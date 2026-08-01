const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { PATHS, readJSON, writeJSON, broadcastLiveEvent } = require('./utils.cjs');
const { callLLM } = require('./llm.cjs');
const { executeBrowserAgent } = require('./browser.cjs');

const activeRuns = new Map(); // runId -> { controller, scheduleId }
const activeCronJobs = new Map(); // scheduleId -> cronJob / timerObj

// Server-side SearXNG Search Helper for Scheduled Tasks
async function searchSearxng(query, customUrl, abortSignal = null) {
  let baseUrl = customUrl?.trim() || '';
  if (!baseUrl) {
    baseUrl = 'http://localhost:8082';
  } else {
    baseUrl = baseUrl.replace(/\/+$/, '');
  }

  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: abortSignal
    });

    if (!response.ok) {
      throw new Error(`SearXNG request failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data && Array.isArray(data.results)) {
      const seenUrls = new Set();
      const uniqueResults = [];
      for (const r of data.results) {
        if (!r.url) continue;
        const cleanUrl = r.url.replace(/\/+$/, '').split('#')[0];
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);

        uniqueResults.push({
          title: r.title || 'Untitled Page',
          url: r.url,
          content: (r.content || r.snippet || '').replace(/<[^>]*>/g, '').trim()
        });

        if (uniqueResults.length >= 5) break;
      }
      return uniqueResults;
    }
  } catch (error) {
    console.error('Error fetching from SearXNG on server:', error);
    throw error;
  }
  return [];
}

// Main Scheduled Task Trigger
async function executeScheduledTask(schedule) {
  console.log(`[Scheduler] Triggering task: ${schedule.title} (${schedule.id})`);
  const settings = readJSON(PATHS.settings, null);
  
  const run = {
    id: `run-${Date.now()}`,
    scheduleId: schedule.id,
    scheduleTitle: schedule.title,
    startTime: new Date().toISOString(),
    status: 'running',
    log: []
  };

  const runs = readJSON(PATHS.runs, []);
  runs.unshift(run);
  writeJSON(PATHS.runs, runs);
  broadcastLiveEvent('run-update', { run });

  const abortController = new AbortController();
  activeRuns.set(run.id, { controller: abortController, scheduleId: schedule.id });

  // Proxy to stream logs to front-end in real-time
  const runLog = new Proxy(run.log, {
    set(target, property, value, receiver) {
      const result = Reflect.set(target, property, value, receiver);
      if (!isNaN(property)) {
        // Stream updates in real-time. Final persistence is handled upon completion of executeScheduledTask.
        broadcastLiveEvent('run-update', { run });
      }
      return result;
    }
  });

  let browserSessionData = null;

  try {
    if (!settings) {
      throw new Error('LLM Settings not synchronized to server yet. Please open Context in your browser first to sync configuration.');
    }
    
    let resultText = '';

    if (schedule.scheduleType === 'once') {
      // Toggle off once job
      schedule.isActive = false;
      const schedules = readJSON(PATHS.schedules, []);
      const idx = schedules.findIndex(s => s.id === schedule.id);
      if (idx !== -1) {
        schedules[idx].isActive = false;
        writeJSON(PATHS.schedules, schedules);
      }
      stopScheduleCron(schedule.id);
    }

    if (abortController.signal.aborted) {
      throw new Error('Task execution cancelled by user.');
    }

    if (schedule.agentMode === 'browser') {
      runLog.push('Executing background Browser Agent task...');
      const res = await executeBrowserAgent(settings, schedule.prompt, runLog, run.id, abortController.signal);
      resultText = res.text;
      
      browserSessionData = {
        url: res.url,
        title: res.title,
        status: res.success ? 'completed' : 'failed',
        steps: res.steps,
        screenshotTimestamp: Date.now()
      };
      runLog.push('Headless browser operations completed.');
    } else {
      runLog.push('Executing standard LLM completion task...');
      let systemPrompt = `You are Context's Task Scheduling Agent. Provide a comprehensive summary answering the user's prompt.
Current Time: ${new Date().toLocaleString()}
Scheduled Job: "${schedule.title}"`;

      if (schedule.isWebSearchEnabled) {
        runLog.push('Web Search is enabled. Querying SearXNG...');
        if (abortController.signal.aborted) {
          throw new Error('Task execution cancelled by user.');
        }
        try {
          const results = await searchSearxng(schedule.prompt, settings.searxngUrl, abortController.signal);
          if (results && results.length > 0) {
            runLog.push(`Web search completed. Found ${results.length} results.`);
            const webSearchContext = results.map((r, idx) => {
              return `[Web Result #${idx + 1}]
Title: ${r.title}
URL: ${r.url}
Excerpt: ${r.content}`;
            }).join('\n\n');
            systemPrompt += `\n\n[REAL-TIME WEB SEARCH CONTEXT]\nUse the following real-time web search results from SearXNG to answer the user's prompt. Rely on these search results to provide accurate, up-to-date information:\n${webSearchContext}`;
          } else {
            runLog.push('Web search returned no results.');
          }
        } catch (searchErr) {
          if (abortController.signal.aborted) {
            throw new Error('Task execution cancelled by user.');
          }
          runLog.push(`Web search error: ${searchErr.message}`);
          console.error(`Scheduled task search error for job ${schedule.id}:`, searchErr);
        }
      }

      if (abortController.signal.aborted) {
        throw new Error('Task execution cancelled by user.');
      }
      resultText = await callLLM(settings, systemPrompt, schedule.prompt, '', abortController.signal);
      runLog.push('API completion call successful.');
    }

    if (schedule.agentMode === 'browser' && browserSessionData) {
      run.status = browserSessionData.status === 'completed' ? 'success' : 'failed';
    } else {
      run.status = 'success';
    }
    run.endTime = new Date().toISOString();
    run.output = resultText;
    if (browserSessionData) {
      run.browserSession = browserSessionData;
    }

    // Build chat message payload for syncing
    let chatId = schedule.targetChatId;
    let isNewChat = false;
    let chatTitle = schedule.title;

    if (chatId === 'new') {
      chatId = `chat-sched-${Date.now()}`;
      isNewChat = true;
    }

    const assistantMsg = {
      id: `msg-sched-assistant-${Date.now()}`,
      role: 'assistant',
      content: resultText,
      timestamp: new Date().toISOString(),
      browserSession: browserSessionData || undefined
    };

    const userMsg = {
      id: `msg-sched-user-${Date.now()}`,
      role: 'user',
      content: `[Scheduled Task Triggered: ${schedule.title}]\nPrompt: ${schedule.prompt}`,
      timestamp: new Date().toISOString()
    };

    const syncQueue = readJSON(PATHS.syncQueue, []);
    const syncEvent = {
      id: `sync-${Date.now()}`,
      chatId,
      isNewChat,
      chatTitle,
      userMsg,
      assistantMsg,
      timestamp: new Date().toISOString()
    };
    syncQueue.push(syncEvent);
    writeJSON(PATHS.syncQueue, syncQueue);
    broadcastLiveEvent('schedule-sync', syncEvent);

    runLog.push('Run completed. Message queued for front-end sync.');
  } catch (e) {
    console.error(`[Scheduler] Task execution failed: ${schedule.title}`, e);
    run.status = 'failed';
    run.endTime = new Date().toISOString();
    run.output = `Execution Failed: ${e.message}`;
    runLog.push(`ERROR: ${e.message}`);
    if (browserSessionData) {
      run.browserSession = browserSessionData;
    }
  } finally {
    activeRuns.delete(run.id);
  }

  // Update lastRun & nextRun estimates
  const schedulesList = readJSON(PATHS.schedules, []);
  const sIdx = schedulesList.findIndex(s => s.id === schedule.id);
  if (sIdx !== -1) {
    schedulesList[sIdx].lastRun = new Date().toISOString();
    
    if (schedulesList[sIdx].isActive) {
      if (schedulesList[sIdx].scheduleType === 'interval') {
        schedulesList[sIdx].nextRun = new Date(Date.now() + (schedulesList[sIdx].intervalMinutes || 5) * 60000).toISOString();
      } else if (schedulesList[sIdx].scheduleType === 'cron') {
        schedulesList[sIdx].nextRun = 'See Cron Schedule';
      }
    } else {
      schedulesList[sIdx].nextRun = undefined;
    }
    writeJSON(PATHS.schedules, schedulesList);
  }

  // Update run history details
  const runsList = readJSON(PATHS.runs, []);
  const runIdx = runsList.findIndex(r => r.id === run.id);
  if (runIdx !== -1) {
    runsList[runIdx] = run;
    writeJSON(PATHS.runs, runsList);
  }
  
  // Stream final run status update
  broadcastLiveEvent('run-update', { run });

  // Optional Webhook HTTP POST notification for external integrations
  if (schedule.webhookUrl && typeof schedule.webhookUrl === 'string' && schedule.webhookUrl.startsWith('http')) {
    try {
      fetch(schedule.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'schedule_run_completed',
          scheduleId: schedule.id,
          scheduleTitle: schedule.title,
          runId: run.id,
          status: run.status,
          output: run.output,
          startTime: run.startTime,
          endTime: run.endTime
        })
      }).catch(err => console.error(`[Scheduler] Webhook delivery failed for ${schedule.title}:`, err.message));
    } catch (err) {
      console.error(`[Scheduler] Error initiating webhook for ${schedule.title}:`, err.message);
    }
  }
}

function startScheduleCron(schedule) {
  stopScheduleCron(schedule.id);
  
  if (schedule.scheduleType === 'once') {
    const delay = new Date(schedule.dateTime).getTime() - Date.now();
    if (delay > 0) {
      const timer = setTimeout(() => {
        executeScheduledTask(schedule);
      }, delay);
      activeCronJobs.set(schedule.id, { stop: () => clearTimeout(timer) });
      console.log(`[Scheduler] Scheduled task ${schedule.title} to run once in ${Math.round(delay / 1000)}s`);
    } else {
      console.log(`[Scheduler] Task ${schedule.title} date is in the past. Disabling.`);
      const schedules = readJSON(PATHS.schedules, []);
      const idx = schedules.findIndex(s => s.id === schedule.id);
      if (idx !== -1) {
        schedules[idx].isActive = false;
        writeJSON(PATHS.schedules, schedules);
      }
    }
  } else if (schedule.scheduleType === 'interval') {
    const intervalMs = (schedule.intervalMinutes || 5) * 60 * 1000;
    const timer = setInterval(() => {
      executeScheduledTask(schedule);
    }, intervalMs);
    activeCronJobs.set(schedule.id, { stop: () => clearInterval(timer) });
    console.log(`[Scheduler] Scheduled task ${schedule.title} (${schedule.id}) to run every ${schedule.intervalMinutes || 5} minutes`);
  } else {
    let cronExpr = schedule.cronExpression;
    try {
      const job = cron.schedule(cronExpr, () => {
        executeScheduledTask(schedule);
      });
      activeCronJobs.set(schedule.id, job);
      console.log(`[Scheduler] Scheduled task ${schedule.title} (${schedule.id}) with cron: ${cronExpr}`);
    } catch (e) {
      console.error(`[Scheduler] Failed to compile cron expression for ${schedule.title}`, e);
    }
  }
}

function stopScheduleCron(id) {
  if (activeCronJobs.has(id)) {
    const job = activeCronJobs.get(id);
    if (job.stop) job.stop();
    activeCronJobs.delete(id);
    console.log(`[Scheduler] Stopped task: ${id}`);
  }
}

// Load and start all active schedules on boot
function initScheduler() {
  console.log('[Scheduler] Starting task scheduling engine...');
  const schedules = readJSON(PATHS.schedules, []);
  let count = 0;
  for (const s of schedules) {
    if (s.isActive) {
      startScheduleCron(s);
      count++;
    }
  }
  console.log(`[Scheduler] Activated ${count} scheduled tasks on boot.`);
}

module.exports = {
  activeRuns,
  activeCronJobs,
  executeScheduledTask,
  startScheduleCron,
  stopScheduleCron,
  initScheduler
};
