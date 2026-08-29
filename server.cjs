const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const {
  DATA_DIR,
  PATHS,
  sseClients,
  readJSON,
  writeJSON
} = require('./server/utils.cjs');

const {
  getBrowser,
  closeBrowser,
  sessions,
  activeBrowserAgents,
  ensureBrowser,
  ensureSession,
  setupPageListeners,
  updateScreenshotForSession,
  saveStepScreenshot,
  highlightElement,
  scrapeInteractiveElements,
  getInteractiveElementOrHeal,
  browserAgentStates,
  pauseBrowserAgent,
  resumeBrowserAgent,
  stepBrowserAgent,
  executeBrowserAgent,
  clearSessionStorage,
  navigateToUrl,
  capturePageScreenshot
} = require('./server/browser.cjs');

const {
  activeRuns,
  activeCronJobs,
  initScheduler,
  startScheduleCron,
  stopScheduleCron,
  executeScheduledTask
} = require('./server/scheduler.cjs');

const {
  getPythonCommand,
  detectPythonCommand,
  executeCode
} = require('./server/executor.cjs');

const {
  searchAndFormat,
  testConnection: testSearchConnection
} = require('./server/webSearchEngine.cjs');

const { router: crawlRouter } = require('./server/crawl4ai.cjs');

// Auto-detect python command interpreter on server boot
detectPythonCommand();

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Lightweight in-memory rate limiting middleware
const rateLimitMap = new Map();
function createRateLimiter(maxRequestsPerMin = 300) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const windowMs = 60 * 1000;
    
    let record = rateLimitMap.get(ip);
    if (!record || (now - record.startTime > windowMs)) {
      record = { startTime: now, count: 1 };
    } else {
      record.count += 1;
    }
    rateLimitMap.set(ip, record);

    if (record.count > maxRequestsPerMin) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Apply rate limiting to all /api endpoints
app.use('/api', createRateLimiter(300));

// Security Hardening Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Endpoint: Health Check Probe
app.get('/api/health', (req, res) => {
  const browserInstance = getBrowser();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeSessions: sessions.size,
    browserConnected: Boolean(browserInstance && browserInstance.connected),
    pythonCommand: getPythonCommand(),
    version: '1.0.0'
  });
});

// Endpoint: Web Search Engine (unified search execution)
app.post('/api/search', async (req, res) => {
  try {
    const { query, forceSearch, customUrl } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }
    const searchResult = await searchAndFormat(query, { forceSearch, customUrl });
    res.json(searchResult);
  } catch (err) {
    console.error('API Search endpoint error:', err);
    res.status(500).json({ error: err.message || 'Web search execution failed' });
  }
});

// Endpoint: Web Search Engine Ping Test
app.post('/api/search/test', async (req, res) => {
  try {
    const { customUrl } = req.body;
    const testResult = await testSearchConnection(customUrl);
    res.json(testResult);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Ollama Connection Test
app.post('/api/ollama/test', async (req, res) => {
  try {
    const { localUrl } = req.body;
    const targetUrl = (localUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const response = await fetch(`${targetUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Ollama returned HTTP ${response.status}`
      });
    }
    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models.map(m => m.name || m.model)
      : [];
    res.json({
      success: true,
      message: `Connected to Ollama! Found ${models.length} installed model(s).`,
      models
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to connect to local Ollama server'
    });
  }
});

// Helper: Clean and normalize local service URLs
function normalizeLocalUrl(url, defaultUrl = 'http://localhost:11434') {
  return String(url || defaultUrl).trim().replace(/\/+$/, '');
}

// Endpoint: Ollama Models List Proxy
app.get('/api/ollama/models', async (req, res) => {
  try {
    const targetUrl = normalizeLocalUrl(req.query.localUrl);
    const response = await fetch(`${targetUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Ollama returned HTTP ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch Ollama models' });
  }
});

// Endpoint: Ollama Running Models (ps) Proxy
app.get('/api/ollama/ps', async (req, res) => {
  try {
    const targetUrl = normalizeLocalUrl(req.query.localUrl);
    const response = await fetch(`${targetUrl}/api/ps`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `Ollama returned HTTP ${response.status}` });
    }
    const data = await response.json();
    res.json({
      success: true,
      models: Array.isArray(data?.models) ? data.models : []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch running Ollama models' });
  }
});

// Endpoint: Ollama Unload Model Proxy
app.post('/api/ollama/unload', async (req, res) => {
  try {
    const { model, localUrl } = req.body;
    if (!model) {
      return res.status(400).json({ success: false, error: 'Model name is required' });
    }
    const targetUrl = normalizeLocalUrl(localUrl);
    const response = await fetch(`${targetUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0 })
    });
    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `Ollama returned HTTP ${response.status}` });
    }
    res.json({ success: true, message: `Model ${model} unloaded from memory` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to unload Ollama model' });
  }
});

// Crawl4AI Endpoints (/api/crawl, /api/crawl/extract, /api/crawl/status)
app.use('/api/crawl', crawlRouter);

// Endpoint: Screenshot
app.get('/api/browser/screenshot', async (req, res) => {
  const { stepId, sessionId } = req.query;
  const sid = sessionId || 'default';

  if (stepId) {
    // Sanitize stepId to prevent directory traversal
    const safeStepId = String(stepId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (safeStepId) {
      const jpgPath = path.join(DATA_DIR, 'screenshots', `${safeStepId}.jpg`);
      if (fs.existsSync(jpgPath)) {
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(jpgPath);
      }
      const pngPath = path.join(DATA_DIR, 'screenshots', `${safeStepId}.png`);
      if (fs.existsSync(pngPath)) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(pngPath);
      }
    }
  }

  const session = sessions.get(sid);
  if (session && session.page) {
    try {
      const buffer = await capturePageScreenshot(session.page);
      session.latestScreenshotBuffer = buffer;
    } catch (e) {
      console.error(`Failed to take live screenshot for session ${sid}`, e);
    }
  }

  const buffer = session ? session.latestScreenshotBuffer : null;

  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (buffer) {
    const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    res.set('Content-Type', isPng ? 'image/png' : 'image/jpeg');
    res.send(buffer);
  } else {
    // Return transparent 1x1 png if no screenshot is captured yet
    const emptyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    res.set('Content-Type', 'image/png');
    res.send(emptyPng);
  }
});

// Endpoint: Page state (URL, Title, and visible interactive element map)
app.get('/api/browser/state', async (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  try {
    const session = await ensureSession(sessionId);
    const url = session.page.url();
    const title = await session.page.title();
    
    const elements = await scrapeInteractiveElements(session.page);
    session.lastElements = elements; // Save in session for self-healing lookup

    let screenshotBase64 = '';
    if (session.page) {
      try {
        const buffer = await capturePageScreenshot(session.page);
        screenshotBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        session.latestScreenshotBuffer = buffer;
      } catch (err) {
        console.error(`Failed to take state screenshot for session ${sessionId}`, err);
      }
    }

    const hasAgent = activeBrowserAgents.has(sessionId);
    const stateObj = browserAgentStates.get(sessionId);
    const agentStatus = hasAgent ? (stateObj && stateObj.state === 'paused' ? 'paused' : 'running') : 'idle';

    res.json({
      url,
      title,
      elements,
      screenshot: screenshotBase64,
      agentStatus
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Execute action
app.post('/api/browser/action', async (req, res) => {
  const { action, targetId, text, url, stepId, sessionId, x, y } = req.body;
  const sid = sessionId || 'default';
  try {
    const session = await ensureSession(sid);
    const pageInstance = session.page;
    let logMessage = '';

    if (action === 'navigate') {
      const targetUrl = await navigateToUrl(pageInstance, url);
      logMessage = `Navigated to ${targetUrl}`;
    } else if (action === 'click') {
      if (targetId) {
        let attempts = 0;
        let success = false;
        let lastError;
        let actualTargetId = targetId;
        let healedResult = false;
        
        while (attempts < 2 && !success) {
          attempts++;
          try {
            const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, null);
            actualTargetId = actualId;
            healedResult = healed || healedResult;
            const selector = `[data-context-id="${actualId}"]`;
            await highlightElement(selector, '#ef4444', sid); // Red outline for click
            await el.click();
            success = true;
          } catch (err) {
            lastError = err;
            if (attempts < 2) {
              console.log(`[Browser Server] Click attempt ${attempts} failed: ${err.message}. Retrying...`);
              await new Promise(r => setTimeout(r, 100));
              await scrapeInteractiveElements(session.page);
            }
          }
        }
        if (!success) throw lastError;
        logMessage = `Clicked element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
        await new Promise(r => setTimeout(r, 50));
      } else if (x !== undefined && y !== undefined) {
        // Resolve element ID at coordinates if any
        const elementId = await pageInstance.evaluate((cx, cy) => {
          let el = document.elementFromPoint(cx, cy);
          while (el) {
            const contextId = el.getAttribute('data-context-id');
            if (contextId) return contextId;
            el = el.parentElement;
          }
          return null;
        }, Number(x), Number(y));

        await pageInstance.mouse.click(Number(x), Number(y));
        logMessage = `Clicked coordinates (${x}, ${y})`;
        
        // Wait briefly for updates/animations
        await new Promise(r => setTimeout(r, 50));
        
        await updateScreenshotForSession(sid);
        await saveStepScreenshot(stepId, sid);
        return res.json({ success: true, logMessage, clickedElementId: elementId, url: pageInstance.url(), title: await pageInstance.title() });
      } else {
        throw new Error('Target ID or coordinates required for click');
      }
    } else if (action === 'type') {
      if (!targetId) throw new Error('Target ID required for typing');
      let attempts = 0;
      let success = false;
      let lastError;
      let actualTargetId = targetId;
      let healedResult = false;
      
      while (attempts < 2 && !success) {
        attempts++;
        try {
          const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, null);
          actualTargetId = actualId;
          healedResult = healed || healedResult;
          const selector = `[data-context-id="${actualId}"]`;
          await highlightElement(selector, '#3b82f6', sid); // Blue outline for typing
          await pageInstance.evaluate((sel) => {
            const item = document.querySelector(sel);
            if (item) {
              item.scrollIntoView({ block: 'center', behavior: 'instant' });
              item.value = '';
              item.focus();
            }
          }, selector);

          await el.type(text || '');
          
          await pageInstance.evaluate((sel) => {
            const item = document.querySelector(sel);
            if (item) {
              item.dispatchEvent(new Event('input', { bubbles: true }));
              item.dispatchEvent(new Event('change', { bubbles: true }));
              item.blur();
            }
          }, selector);
          success = true;
        } catch (err) {
          lastError = err;
          if (attempts < 2) {
            console.log(`[Browser Server] Type attempt ${attempts} failed: ${err.message}. Retrying...`);
            await new Promise(r => setTimeout(r, 100));
            await scrapeInteractiveElements(session.page);
          }
        }
      }
      if (!success) throw lastError;
      logMessage = `Typed "${text}" into element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
      await new Promise(r => setTimeout(r, 50));
    } else if (action === 'hover') {
      if (!targetId) throw new Error('Target ID required for hover');
      let attempts = 0;
      let success = false;
      let lastError;
      let actualTargetId = targetId;
      let healedResult = false;
      
      while (attempts < 2 && !success) {
        attempts++;
        try {
          const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, null);
          actualTargetId = actualId;
          healedResult = healed || healedResult;
          const selector = `[data-context-id="${actualId}"]`;
          await highlightElement(selector, '#eab308', sid); // Yellow outline for hover
          await el.hover();
          success = true;
        } catch (err) {
          lastError = err;
          if (attempts < 2) {
            console.log(`[Browser Server] Hover attempt ${attempts} failed: ${err.message}. Retrying...`);
            await new Promise(r => setTimeout(r, 100));
            await scrapeInteractiveElements(session.page);
          }
        }
      }
      if (!success) throw lastError;
      logMessage = `Hovered cursor over element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
      await new Promise(r => setTimeout(r, 50));
    } else if (action === 'back') {
      await pageInstance.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
      logMessage = `Performed browser go-back navigation`;
      await new Promise(r => setTimeout(r, 50));
    } else if (action === 'key') {
      if (!text) throw new Error('Key text required for keyboard press');
      let attempts = 0;
      let success = false;
      let lastError;
      let actualTargetId = targetId;
      let healedResult = false;
      
      while (attempts < 2 && !success) {
        attempts++;
        try {
          if (targetId) {
            const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, null);
            actualTargetId = actualId;
            healedResult = healed || healedResult;
            const selector = `[data-context-id="${actualId}"]`;
            await highlightElement(selector, '#10b981', sid); // Green outline for key press
            await el.focus();
          }
          await pageInstance.keyboard.press(text);
          success = true;
        } catch (err) {
          lastError = err;
          if (attempts < 2) {
            console.log(`[Browser Server] Key press attempt ${attempts} failed: ${err.message}. Retrying...`);
            await new Promise(r => setTimeout(r, 100));
            await scrapeInteractiveElements(session.page);
          }
        }
      }
      if (!success) throw lastError;
      logMessage = `Pressed key "${text}"${targetId ? ` on element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}` : ''}`;
      await new Promise(r => setTimeout(r, 50));
    } else if (action === 'scroll') {
      const direction = text === 'up' ? 'up' : 'down';
      await pageInstance.evaluate((dir) => {
        window.scrollBy(0, dir === 'up' ? -500 : 500);
      }, direction);
      logMessage = `Scrolled page ${direction}`;
    } else if (action === 'wait') {
      const ms = parseInt(text, 10) || 2000;
      await new Promise(r => setTimeout(r, ms));
      logMessage = `Waited for ${ms}ms`;
    } else if (action === 'extract') {
      const pageText = await pageInstance.evaluate(() => document.body.innerText);
      logMessage = `Extracted page textual data`;
      await updateScreenshotForSession(sid);
      await saveStepScreenshot(stepId, sid);
      return res.json({ success: true, logMessage, data: pageText, url: pageInstance.url(), title: await pageInstance.title() });
    } else {
      throw new Error(`Unsupported action "${action}"`);
    }

    await updateScreenshotForSession(sid);
    await saveStepScreenshot(stepId, sid);
    res.json({ success: true, logMessage, url: pageInstance.url(), title: await pageInstance.title() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: Abort and cleanup active browser agent session
function abortActiveBrowserSession(sessionId) {
  if (activeBrowserAgents.has(sessionId)) {
    try {
      const active = activeBrowserAgents.get(sessionId);
      active.controller.abort();
      console.log(`[Browser Server] Aborted active agent for session ${sessionId}`);
    } catch (e) {
      console.error(`[Browser Server] Error aborting session ${sessionId}:`, e);
    }
    activeBrowserAgents.delete(sessionId);
    resumeBrowserAgent(sessionId);
    return true;
  }
  return false;
}

// Endpoint: Start backend browser agent loop (async background)
app.post('/api/browser/agent/start', async (req, res) => {
  const { sessionId, messageId, userGoal, settings } = req.body;
  if (!sessionId || !messageId || !userGoal || !settings) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  abortActiveBrowserSession(sessionId);

  const controller = new AbortController();
  activeBrowserAgents.set(sessionId, { controller });

  res.json({ success: true, message: 'Browser agent loop started on backend' });

  // Run async in background
  (async () => {
    const runLog = [];
    try {
      await executeBrowserAgent(settings, userGoal, runLog, sessionId, controller.signal, messageId);
    } catch (err) {
      console.error(`[Browser Server] Backend agent loop execution finished/failed:`, err.message);
    } finally {
      activeBrowserAgents.delete(sessionId);
    }
  })();
});

// Endpoint: Run backend browser agent loop (tool execution for LLM)
app.post('/api/browser/agent/run', async (req, res) => {
  const { sessionId, messageId, userGoal, settings } = req.body;
  if (!sessionId || !userGoal || !settings) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  abortActiveBrowserSession(sessionId);

  const controller = new AbortController();
  activeBrowserAgents.set(sessionId, { controller });

  req.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
      activeBrowserAgents.delete(sessionId);
    }
  });

  const runLog = [];
  try {
    const result = await executeBrowserAgent(settings, userGoal, runLog, sessionId, controller.signal, messageId);
    return res.json(result || { success: true, text: 'Browser action completed.' });
  } catch (err) {
    if (controller.signal.aborted) {
      return res.status(499).json({ error: 'Browser agent run cancelled' });
    }
    console.error(`[Browser Server] Backend agent run failed:`, err.message);
    return res.status(500).json({ error: err.message || 'Browser agent execution failed' });
  } finally {
    activeBrowserAgents.delete(sessionId);
  }
});

// Endpoint: Abort running backend browser agent loop
app.post('/api/browser/agent/abort', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const aborted = abortActiveBrowserSession(sessionId);
  if (aborted) {
    return res.json({ success: true, message: 'Browser agent aborted' });
  }

  return res.json({ success: true, message: 'No active browser agent found for this session' });
});

// Endpoint: Pause running backend browser agent loop
app.post('/api/browser/agent/pause', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const success = pauseBrowserAgent(sessionId);
  if (success) {
    console.log(`[Browser Server] Paused agent for session ${sessionId}`);
    return res.json({ success: true, message: 'Browser agent paused' });
  }

  return res.status(404).json({ error: 'No active browser agent found for this session' });
});

// Endpoint: Resume paused backend browser agent loop
app.post('/api/browser/agent/resume', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const success = resumeBrowserAgent(sessionId);
  if (success) {
    console.log(`[Browser Server] Resumed agent for session ${sessionId}`);
    return res.json({ success: true, message: 'Browser agent resumed' });
  }

  return res.status(404).json({ error: 'No active browser agent found for this session' });
});

// Endpoint: Step paused backend browser agent loop (run exactly one iteration)
app.post('/api/browser/agent/step', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const success = stepBrowserAgent(sessionId);
  if (success) {
    console.log(`[Browser Server] Stepped agent for session ${sessionId}`);
    return res.json({ success: true, message: 'Browser agent stepped' });
  }

  return res.status(404).json({ error: 'No active browser agent found or not in paused state for this session' });
});

// Endpoint: Close session
app.post('/api/browser/close', async (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || 'default';
  try {
    // Abort active agent for this session if running
    if (sid === 'all') {
      for (const [id, active] of activeBrowserAgents.entries()) {
        try {
          active.controller.abort();
          console.log(`[Browser Server] Aborted active agent for session ${id} due to closing all sessions`);
        } catch (e) {
          console.error(`Failed to abort active agent for session ${id}`, e);
        }
      }
      activeBrowserAgents.clear();
    } else if (activeBrowserAgents.has(sid)) {
      try {
        const active = activeBrowserAgents.get(sid);
        active.controller.abort();
        console.log(`[Browser Server] Aborted active agent for session ${sid} due to session close`);
      } catch (e) {
        console.error(`Failed to abort active agent for session ${sid}`, e);
      }
      activeBrowserAgents.delete(sid);
    }

    const session = sessions.get(sid);
    if (session) {
      if (session.context) {
        try {
          await session.context.close();
        } catch (e) {
          console.error(`Failed to close context for session ${sid}`, e);
        }
      }
      sessions.delete(sid);
      console.log(`[Browser Server] Closed and cleaned up session: ${sid}`);
    }

    if (sid === 'all') {
      for (const [id, s] of sessions.entries()) {
        try {
          await s.context.close();
        } catch (e) {}
      }
      sessions.clear();
      await closeBrowser();
    } else if (sessions.size === 0 && getBrowser()) {
      console.log(`[Browser Server] No active sessions remaining. Closing browser process to reclaim memory.`);
      await closeBrowser();
    }
    res.json({ success: true, message: `Browser session ${sid} closed` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Get list of active tabs in browser session
app.get('/api/browser/tabs', async (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  try {
    const session = await ensureSession(sessionId);
    const pages = await session.context.pages();
    
    const tabs = await Promise.all(pages.map(async (p, idx) => {
      p._contextTabId = p._contextTabId || `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      setupPageListeners(sessionId, p, session); // Ensure listeners are attached
      
      let title = 'Blank Page';
      try {
        title = await p.title();
      } catch (err) {}
      
      return {
        id: p._contextTabId,
        title: title || 'Untitled',
        url: p.url(),
        isActive: p === session.page
      };
    }));
    
    res.json({ success: true, tabs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Switch to a specific tab
app.post('/api/browser/tabs/switch', async (req, res) => {
  const { sessionId, tabId } = req.body;
  const sid = sessionId || 'default';
  try {
    const session = await ensureSession(sid);
    const pages = await session.context.pages();
    
    const targetPage = pages.find(p => p._contextTabId === tabId);
    if (!targetPage) {
      return res.status(404).json({ error: 'Tab not found' });
    }
    
    session.page = targetPage;
    await updateScreenshotForSession(sid);
    
    res.json({ success: true, message: `Switched to tab: ${targetPage.url()}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Close a specific tab
app.post('/api/browser/tabs/close', async (req, res) => {
  const { sessionId, tabId } = req.body;
  const sid = sessionId || 'default';
  try {
    const session = await ensureSession(sid);
    const pages = await session.context.pages();
    
    const targetPage = pages.find(p => p._contextTabId === tabId);
    if (!targetPage) {
      return res.status(404).json({ error: 'Tab not found' });
    }
    
    await targetPage.close();
    
    // Auto-switch to remaining tabs if active tab was closed
    const remainingPages = await session.context.pages();
    if (remainingPages.length === 0) {
      const pageInstance = await session.context.newPage();
      await pageInstance.setViewport({ width: 1280, height: 800 });
      setupPageListeners(sid, pageInstance, session);
      session.page = pageInstance;
    } else if (session.page === targetPage || session.page.isClosed()) {
      session.page = remainingPages[remainingPages.length - 1];
    }
    
    await updateScreenshotForSession(sid);
    res.json({ success: true, message: 'Tab closed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Open a new tab
app.post('/api/browser/tabs/create', async (req, res) => {
  const { sessionId, url } = req.body;
  const sid = sessionId || 'default';
  try {
    const session = await ensureSession(sid);
    const pageInstance = await session.context.newPage();
    await pageInstance.setViewport({ width: 1280, height: 800 });
    setupPageListeners(sid, pageInstance, session);
    session.page = pageInstance;
    
    if (url) {
      let targetUrl = url.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
      await pageInstance.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    }
    
    await updateScreenshotForSession(sid);
    res.json({ success: true, message: 'New tab created', url: pageInstance.url() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Get console/network logs for session
app.get('/api/browser/logs', async (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  try {
    const session = await ensureSession(sessionId);
    res.json({ success: true, logs: session.logs || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Clear logs
app.post('/api/browser/logs/clear', async (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || 'default';
  try {
    const session = await ensureSession(sid);
    session.logs = [];
    broadcastLiveEvent('browser-log-clear', { sessionId: sid });
    res.json({ success: true, message: 'Logs cleared' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Clear session cookies and browser storage
app.post('/api/browser/storage/clear', async (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || 'default';
  try {
    const success = await clearSessionStorage(sid);
    res.json({ success, message: success ? 'Session storage and cookies cleared' : 'Session not active' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Endpoint: Evaluate arbitrary JS in session browser page context
app.post('/api/browser/eval', async (req, res) => {
  const { sessionId, code } = req.body;
  const sid = sessionId || 'default';
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }

  try {
    const session = await ensureSession(sid);
    const pageInstance = session.page;

    const result = await pageInstance.evaluate((evalCode) => {
      try {
        const evalResult = window.eval(evalCode);
        if (evalResult === undefined) return 'undefined';
        if (evalResult === null) return 'null';
        if (typeof evalResult === 'object') {
          try {
            return JSON.stringify(evalResult, null, 2);
          } catch (e) {
            return evalResult.toString();
          }
        }
        return evalResult.toString();
      } catch (err) {
        throw new Error(err.message);
      }
    }, code);

    // Broadcast log update so standard console list shows the run immediately
    const inputLog = {
      timestamp: new Date().toISOString(),
      type: 'info',
      text: `> ${code}`,
      url: pageInstance.url()
    };
    session.logs.push(inputLog);
    if (session.logs.length > 100) session.logs.shift();
    broadcastLiveEvent('browser-log', { sessionId: sid, log: inputLog });

    const resultLog = {
      timestamp: new Date().toISOString(),
      type: 'info',
      text: result,
      url: pageInstance.url()
    };
    session.logs.push(resultLog);
    if (session.logs.length > 100) session.logs.shift();
    broadcastLiveEvent('browser-log', { sessionId: sid, log: resultLog });

    res.json({ success: true, result });
  } catch (e) {
    // If it threw an error, log it as an error type
    try {
      const session = await ensureSession(sid);
      const inputLog = {
        timestamp: new Date().toISOString(),
        type: 'info',
        text: `> ${code}`,
        url: session.page.url()
      };
      session.logs.push(inputLog);
      if (session.logs.length > 100) session.logs.shift();
      broadcastLiveEvent('browser-log', { sessionId: sid, log: inputLog });

      const errLog = {
        timestamp: new Date().toISOString(),
        type: 'error',
        text: `Evaluation Error: ${e.message}`,
        url: session.page.url()
      };
      session.logs.push(errLog);
      if (session.logs.length > 100) session.logs.shift();
      broadcastLiveEvent('browser-log', { sessionId: sid, log: errLog });
    } catch (innerErr) {}
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Scrape page text content using headless Puppeteer
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let pageInstance = null;
  try {
    await ensureBrowser();
    const browserInstance = getBrowser();
    pageInstance = await browserInstance.newPage();
    await pageInstance.setViewport({ width: 1280, height: 800 });

    // Enable request interception to block images/css/fonts/media
    await pageInstance.setRequestInterception(true);
    pageInstance.on('request', (request) => {
      const type = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Go to page
    await pageInstance.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const title = await pageInstance.title();
    const content = await pageInstance.evaluate(() => {
      // Remove noise elements
      const noise = document.querySelectorAll('script, style, noscript, iframe, head, footer, nav, header, [role="banner"], [role="navigation"], [role="contentinfo"]');
      noise.forEach(el => el.remove());
      return document.body.innerText;
    });

    // Clean extra whitespace and truncate to prevent context window bloating
    const cleanContent = content
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    res.json({ success: true, title, content: cleanContent });
  } catch (err) {
    console.error(`Failed to scrape URL ${url}:`, err);
    res.status(500).json({ error: err.message || 'Scraping failed' });
  } finally {
    if (pageInstance) {
      try {
        await pageInstance.close();
      } catch (closeErr) {
        console.error('Failed to close scraper page', closeErr);
      }
    }
  }
});

app.post('/api/schedules/settings', (req, res) => {
  const settings = req.body;
  writeJSON(PATHS.settings, settings);
  res.json({ success: true });
});

app.get('/api/schedules/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  console.log(`[SSE] Client connected. Total: ${sseClients.size}`);

  req.on('close', () => {
    sseClients.delete(res);
    console.log(`[SSE] Client disconnected. Total: ${sseClients.size}`);
  });
});

app.get('/api/schedules/export', (req, res) => {
  try {
    const schedules = readJSON(PATHS.schedules, []);
    const runs = readJSON(PATHS.runs, []);
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      schedules,
      runs
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/schedules/import', (req, res) => {
  try {
    const { schedules, runs } = req.body;
    if (Array.isArray(schedules)) {
      writeJSON(PATHS.schedules, schedules);
      schedules.forEach(s => {
        if (s.isActive) {
          startScheduleCron(s);
        } else {
          stopScheduleCron(s.id);
        }
      });
    }
    if (Array.isArray(runs)) {
      writeJSON(PATHS.runs, runs);
    }
    res.json({ success: true, message: 'Schedules and run logs imported successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/schedules', (req, res) => {
  res.json(readJSON(PATHS.schedules, []));
});

app.post('/api/schedules', (req, res) => {
  const schedule = req.body;
  if (!schedule.id || !schedule.title || !schedule.prompt) {
    return res.status(400).json({ error: 'Missing schedule fields' });
  }

  const schedules = readJSON(PATHS.schedules, []);
  const idx = schedules.findIndex(s => s.id === schedule.id);
  if (idx !== -1) {
    schedules[idx] = schedule;
  } else {
    schedules.push(schedule);
  }
  writeJSON(PATHS.schedules, schedules);

  if (schedule.isActive) {
    startScheduleCron(schedule);
  } else {
    stopScheduleCron(schedule.id);
  }

  res.json({ success: true, schedule });
});

app.post('/api/schedules/:id/toggle', (req, res) => {
  const { id } = req.params;
  const schedules = readJSON(PATHS.schedules, []);
  const idx = schedules.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });

  schedules[idx].isActive = !schedules[idx].isActive;
  writeJSON(PATHS.schedules, schedules);

  if (schedules[idx].isActive) {
    startScheduleCron(schedules[idx]);
  } else {
    stopScheduleCron(id);
  }

  res.json({ success: true, isActive: schedules[idx].isActive });
});

app.post('/api/schedules/:id/run', async (req, res) => {
  const { id } = req.params;
  const schedules = readJSON(PATHS.schedules, []);
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

  // Execute asynchronously to not block the response
  executeScheduledTask(schedule).catch(err => {
    console.error(`Error executing scheduled task manually: ${id}`, err);
  });

  res.json({ success: true, message: 'Task execution started in the background.' });
});

app.post('/api/schedules/runs/:runId/cancel', (req, res) => {
  const { runId } = req.params;
  const run = activeRuns.get(runId);
  if (!run) {
    return res.status(404).json({ error: 'Running task not found or already completed.' });
  }

  run.controller.abort();
  res.json({ success: true, message: 'Cancellation signal sent.' });
});

app.post('/api/execute', (req, res) => {
  const { language, code } = req.body;
  if (!language || !code) {
    return res.status(400).json({ error: 'Missing language or code parameter.' });
  }

  executeCode(language, code, (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(result);
  });
});

app.delete('/api/schedules/:id', (req, res) => {
  const { id } = req.params;
  const schedules = readJSON(PATHS.schedules, []);
  const filtered = schedules.filter(s => s.id !== id);
  writeJSON(PATHS.schedules, filtered);

  stopScheduleCron(id);
  res.json({ success: true });
});

app.get('/api/schedules/runs', (req, res) => {
  res.json(readJSON(PATHS.runs, []));
});

app.get('/api/schedules/sync', (req, res) => {
  const queue = readJSON(PATHS.syncQueue, []);
  writeJSON(PATHS.syncQueue, []); // Clear queue on poll
  res.json(queue);
});

app.post('/api/schedules/clear-all', (req, res) => {
  try {
    activeCronJobs.forEach(job => {
      if (job.stop) job.stop();
    });
    activeCronJobs.clear();

    writeJSON(PATHS.schedules, []);
    writeJSON(PATHS.runs, []);
    writeJSON(PATHS.syncQueue, []);
    writeJSON(PATHS.settings, null);

    res.json({ success: true, message: 'All scheduled tasks and run logs cleared.' });
  } catch (e) {
    console.error('Failed to clear scheduling database', e);
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: Transpile TypeScript to clean JavaScript
app.post('/api/transpile', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter.' });
  }
  try {
    const ts = require('typescript');
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        removeComments: false
      }
    });
    res.json({ success: true, code: result.outputText });
  } catch (err) {
    console.error('TypeScript transpilation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Get list of all active browser sessions
app.get('/api/browser/sessions', async (req, res) => {
  try {
    const activeSessions = [];
    for (const [id, session] of sessions.entries()) {
      let pageUrl = 'about:blank';
      let pageTitle = 'Blank Page';
      try {
        if (session.page && !session.page.isClosed()) {
          pageUrl = session.page.url();
          pageTitle = await session.page.title();
        }
      } catch (err) {}
      activeSessions.push({
        id,
        url: pageUrl,
        title: pageTitle || 'Untitled'
      });
    }
    res.json({ success: true, sessions: activeSessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Global error middleware
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const { initWebSocketServer } = require('./server/screencastWs.cjs');

// Boot the scheduler engine
initScheduler();

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Browser Companion Server running on http://localhost:${PORT}`);
  initWebSocketServer(server);
});

// Graceful Shutdown handling
async function gracefulShutdown(signal) {
  console.log(`[Server] Received ${signal || 'shutdown signal'}. Starting graceful shutdown...`);
  for (const [, session] of sessions.entries()) {
    try {
      if (session.context) {
        await session.context.close();
      }
    } catch {
      // ignore context close errors during shutdown
    }
  }
  sessions.clear();
  try {
    await closeBrowser();
  } catch (err) {
    console.error('[Server] Error closing browser during shutdown:', err);
  }
  server.close(() => {
    console.log('[Server] Companion server closed cleanly.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
