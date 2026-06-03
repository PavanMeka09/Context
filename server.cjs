const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const os = require('os');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const DATA_DIR = path.join(os.homedir(), '.context-ai');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PATHS = {
  schedules: path.join(DATA_DIR, 'schedules.json'),
  runs: path.join(DATA_DIR, 'runs.json'),
  syncQueue: path.join(DATA_DIR, 'sync_queue.json'),
  settings: path.join(DATA_DIR, 'settings.json')
};

const app = express();
app.use(cors());
app.use(bodyParser.json());

let browser = null;
const sessions = new Map(); // sessionId -> { context, page, latestScreenshotBuffer }

// Helper to launch browser if not running
async function ensureBrowser() {
  if (browser && !browser.connected) {
    try {
      await browser.close();
    } catch (e) {}
    browser = null;
    sessions.clear();
  }

  if (!browser) {
    const profileDir = path.join(DATA_DIR, 'puppeteer_profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: profileDir,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Auto-switch to newly opened pages/tabs for specific sessions (Target Created)
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        try {
          const newPage = await target.page();
          if (newPage) {
            const targetContext = target.browserContext();
            for (const [sid, session] of sessions.entries()) {
              if (session.context === targetContext) {
                session.page = newPage;
                await newPage.setViewport({ width: 1280, height: 800 });
                console.log(`[Browser Server] Auto-switched session ${sid} to new page: ${newPage.url()}`);
                await updateScreenshotForSession(sid);
                break;
              }
            }
          }
        } catch (e) {
          console.error('Failed to auto-switch page context to new target', e);
        }
      }
    });
  }
}

// Helper to get or create isolated session
async function ensureSession(sessionId) {
  const sid = sessionId || 'default';
  await ensureBrowser();

  let session = sessions.get(sid);
  if (!session || (session.page && session.page.isClosed())) {
    let context;
    try {
      context = await browser.createBrowserContext();
    } catch (err) {
      console.error(`Failed to create browser context for ${sid}, using default`, err);
      context = browser.defaultBrowserContext();
    }

    const pageInstance = await context.newPage();
    await pageInstance.setViewport({ width: 1280, height: 800 });

    session = {
      context,
      page: pageInstance,
      latestScreenshotBuffer: null
    };
    sessions.set(sid, session);
    console.log(`[Browser Server] Created new isolated context for session: ${sid}`);
  }

  return session;
}

// Helper to take a screenshot and update buffer
async function updateScreenshotForSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.page) {
    try {
      session.latestScreenshotBuffer = await session.page.screenshot({ type: 'png' });
    } catch (e) {
      console.error(`Failed to take screenshot for session ${sessionId}`, e);
    }
  }
}

// Helper to save step screenshots to disk
async function saveStepScreenshot(stepId, sessionId) {
  const session = sessions.get(sessionId);
  if (stepId && session && session.latestScreenshotBuffer) {
    try {
      const screenshotsDir = path.join(DATA_DIR, 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(screenshotsDir, `${stepId}.png`), session.latestScreenshotBuffer);
    } catch (e) {
      console.error(`Failed to save step screenshot to disk for session ${sessionId}`, e);
    }
  }
}

// Helper to briefly highlight element for screenshot capture
async function highlightElement(selector, color = '#ef4444', sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.page) {
    try {
      await session.page.evaluate((sel, col) => {
        const item = document.querySelector(sel);
        if (item) {
          item.scrollIntoView({ block: 'center', behavior: 'instant' });
          const originalOutline = item.style.outline;
          const originalOffset = item.style.outlineOffset;
          item.style.outline = `4px solid ${col}`;
          item.style.outlineOffset = '2px';
          
          window._activeHighlight = {
            item,
            originalOutline,
            originalOffset
          };
        }
      }, selector, color);
      
      // Let it stay highlighted for screenshot capture
      await new Promise(r => setTimeout(r, 200));
      await updateScreenshotForSession(sessionId);
      
      // Restore outline
      await session.page.evaluate(() => {
        if (window._activeHighlight) {
          const { item, originalOutline, originalOffset } = window._activeHighlight;
          item.style.outline = originalOutline;
          item.style.outlineOffset = originalOffset;
          delete window._activeHighlight;
        }
      });
    } catch (e) {
      console.error(`Failed to highlight element in session ${sessionId}`, e);
    }
  }
}

// Endpoint: Screenshot
app.get('/api/browser/screenshot', async (req, res) => {
  const { stepId, sessionId } = req.query;
  const sid = sessionId || 'default';

  if (stepId) {
    const filePath = path.join(DATA_DIR, 'screenshots', `${stepId}.png`);
    if (fs.existsSync(filePath)) {
      res.set('Content-Type', 'image/png');
      return res.sendFile(filePath);
    }
  }

  const session = sessions.get(sid);
  if (session && session.page) {
    try {
      const buffer = await session.page.screenshot({ type: 'png' });
      session.latestScreenshotBuffer = buffer;
    } catch (e) {
      console.error(`Failed to take live screenshot for session ${sid}`, e);
    }
  }

  const buffer = session ? session.latestScreenshotBuffer : null;

  if (buffer) {
    res.set('Content-Type', 'image/png');
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

// Helper to scrape visible interactive elements semantically
async function scrapeInteractiveElements(pageInstance) {
  if (!pageInstance) return [];
  return pageInstance.evaluate(() => {
    document.querySelectorAll('[data-context-id]').forEach(el => el.removeAttribute('data-context-id'));
    
    const interactiveSelectors = [
      'a', 'button', 'input', 'textarea', 'select', 'option', 'details', 'summary',
      '[role="button"]', '[role="checkbox"]', '[role="link"]', '[role="menuitem"]',
      '[role="tab"]', '[role="treeitem"]', '[role="radio"]', '[role="switch"]',
      '[role="textbox"]', '[role="combobox"]', '[role="searchbox"]',
      '[tabindex]', '[onclick]', '[contenteditable="true"]'
    ].join(', ');
    
    const els = document.querySelectorAll(interactiveSelectors);
    
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return true;
    };

    const getSemanticLabel = (el) => {
      let label = el.getAttribute('aria-label');
      if (label && label.trim()) return label.trim();

      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labellingEl = document.getElementById(labelledBy);
        if (labellingEl && labellingEl.innerText.trim()) {
          return labellingEl.innerText.trim();
        }
      }

      if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'select') {
        if (el.id) {
          const explicitLabel = document.querySelector(`label[for="${el.id}"]`);
          if (explicitLabel && explicitLabel.innerText.trim()) {
            return explicitLabel.innerText.trim();
          }
        }
        let parent = el.parentElement;
        while (parent) {
          if (parent.tagName.toLowerCase() === 'label') {
            let text = parent.innerText.trim();
            if (text) return text;
          }
          parent = parent.parentElement;
        }
      }

      if (el.tagName.toLowerCase() === 'img') {
        let alt = el.getAttribute('alt');
        if (alt && alt.trim()) return alt.trim();
      } else {
        const childImg = el.querySelector('img');
        if (childImg) {
          let alt = childImg.getAttribute('alt');
          if (alt && alt.trim()) return alt.trim();
        }
      }

      let title = el.getAttribute('title');
      if (title && title.trim()) return title.trim();

      let placeholder = el.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) return placeholder.trim();

      let value = el.value;
      if (value && typeof value === 'string' && value.trim()) return value.trim();

      let innerText = el.innerText;
      if (innerText && innerText.trim()) return innerText.trim();

      return '';
    };

    const result = [];
    let counter = 1;
    
    els.forEach(el => {
      if (!isVisible(el)) return;
      const id = `context-el-${counter++}`;
      el.setAttribute('data-context-id', id);
      
      let rawText = getSemanticLabel(el);
      let text = rawText.trim().replace(/\s+/g, ' ').slice(0, 80);

      result.push({
        id,
        tagName: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || '',
        text: text || `[Unnamed ${el.tagName.toLowerCase()}]`
      });
    });
    return result;
  });
}

// Endpoint: Page state (URL, Title, and visible interactive element map)
app.get('/api/browser/state', async (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  try {
    const session = await ensureSession(sessionId);
    const url = session.page.url();
    const title = await session.page.title();
    
    const elements = await scrapeInteractiveElements(session.page);

    let screenshotBase64 = '';
    if (session.page) {
      try {
        const buffer = await session.page.screenshot({ type: 'png' });
        screenshotBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
        session.latestScreenshotBuffer = buffer;
      } catch (err) {
        console.error(`Failed to take state screenshot for session ${sessionId}`, err);
      }
    }

    res.json({
      url,
      title,
      elements,
      screenshot: screenshotBase64
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
      if (!url) throw new Error('URL required for navigation');
      let targetUrl = url.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
      await pageInstance.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      logMessage = `Navigated to ${targetUrl}`;
    } else if (action === 'click') {
      if (targetId) {
        const selector = `[data-context-id="${targetId}"]`;
        const el = await pageInstance.$(selector);
        if (!el) throw new Error(`Element with ID ${targetId} not found`);

        await highlightElement(selector, '#ef4444', sid); // Red outline for click
        await el.click();
        logMessage = `Clicked element "${targetId}"`;
        await new Promise(r => setTimeout(r, 1500));
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
        await new Promise(r => setTimeout(r, 1500));
        
        await updateScreenshotForSession(sid);
        await saveStepScreenshot(stepId, sid);
        return res.json({ success: true, logMessage, clickedElementId: elementId, url: pageInstance.url(), title: await pageInstance.title() });
      } else {
        throw new Error('Target ID or coordinates required for click');
      }
    } else if (action === 'type') {
      if (!targetId) throw new Error('Target ID required for typing');
      const selector = `[data-context-id="${targetId}"]`;
      const el = await pageInstance.$(selector);
      if (!el) throw new Error(`Element with ID ${targetId} not found`);

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
      logMessage = `Typed "${text}" into element "${targetId}"`;
      
      await pageInstance.evaluate((sel) => {
        const item = document.querySelector(sel);
        if (item) {
          item.dispatchEvent(new Event('change', { bubbles: true }));
          item.blur();
        }
      }, selector);
      await new Promise(r => setTimeout(r, 1000));
    } else if (action === 'hover') {
      if (!targetId) throw new Error('Target ID required for hover');
      const selector = `[data-context-id="${targetId}"]`;
      const el = await pageInstance.$(selector);
      if (!el) throw new Error(`Element with ID ${targetId} not found`);

      await highlightElement(selector, '#eab308', sid); // Yellow outline for hover
      await el.hover();
      logMessage = `Hovered cursor over element "${targetId}"`;
      await new Promise(r => setTimeout(r, 1000));
    } else if (action === 'back') {
      await pageInstance.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
      logMessage = `Performed browser go-back navigation`;
      await new Promise(r => setTimeout(r, 1000));
    } else if (action === 'key') {
      if (!text) throw new Error('Key text required for keyboard press');
      if (targetId) {
        const selector = `[data-context-id="${targetId}"]`;
        const el = await pageInstance.$(selector);
        if (!el) throw new Error(`Element with ID ${targetId} not found`);
        await highlightElement(selector, '#10b981', sid); // Green outline for key press
        await el.focus();
      }
      await pageInstance.keyboard.press(text);
      logMessage = `Pressed key "${text}"${targetId ? ` on element "${targetId}"` : ''}`;
      await new Promise(r => setTimeout(r, 1000));
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

// Endpoint: Close session
app.post('/api/browser/close', async (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || 'default';
  try {
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
      if (browser) {
        await browser.close();
        browser = null;
      }
    }
    res.json({ success: true, message: `Browser session ${sid} closed` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// TASK SCHEDULING SYSTEM IMPLEMENTATION
// ==========================================



// Helper: read JSON database
function readJSON(file, defaultVal = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`Error reading database file: ${file}`, e);
  }
  return defaultVal;
}

// Helper: write JSON database
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error writing database file: ${file}`, e);
  }
}

// Helper: Call LLM API (Gemini / OpenRouter / Ollama) from the backend
async function callLLM(settings, systemPrompt, userPrompt, screenshotBase64 = '') {
  const { provider, apiKey, model, localUrl } = settings;
  if (!apiKey && provider !== 'ollama') {
    throw new Error('API Key is not configured on the server. Please save settings in Context.');
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const userParts = [{ text: userPrompt }];
    if (screenshotBase64) {
      const cleanBase64 = screenshotBase64.split(',')[1] || screenshotBase64;
      userParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: cleanBase64
        }
      });
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: userParts
        }
      ]
    };
    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else if (provider === 'openrouter' || provider === 'ollama') {
    const baseURL = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : `${localUrl || 'http://localhost:11434/v1'}/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && provider === 'openrouter') {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = 'https://context.ai';
      headers['X-Title'] = 'Context AI Chat';
    }

    let userContent = userPrompt;
    if (screenshotBase64) {
      userContent = [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/png;base64,${screenshotBase64}`
          }
        }
      ];
    }

    const response = await fetch(baseURL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: userContent }
        ]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${provider.toUpperCase()} API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Background headless Browser Agent executor
async function executeBrowserAgent(settings, userGoal, runLog, sessionId) {
  const sid = sessionId || `sched-agent-${Date.now()}`;
  try {
    runLog.push(`Launching browser viewport for session ${sid}...`);
    const session = await ensureSession(sid);
    const pageInstance = session.page;
    
    let currentUrl = pageInstance.url();
    let currentTitle = await pageInstance.title();
    let extractedContext = '';
    const steps = [];
    let loopCount = 0;
    const maxLoops = 15;
    let isFinished = false;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    while (!isFinished && loopCount < maxLoops) {
      loopCount++;
      runLog.push(`Executing browser cycle step ${loopCount}...`);

      currentUrl = pageInstance.url();
      currentTitle = await pageInstance.title();

      // Generate semantic context element mappings
      const elements = await scrapeInteractiveElements(pageInstance);

      // Generate step history context for the LLM
      const formattedSteps = steps.map((s, idx) => {
        return `- Step ${idx + 1}: Thought: "${s.thought}" -> Action: ${s.action}${s.targetId ? ` on element "${s.targetId}"` : ''}${s.text ? ` with "${s.text}"` : ''}${s.url ? ` to "${s.url}"` : ''} (${s.status === 'success' ? 'Success' : `Failed: ${s.logMessage || 'unknown error'}`})`;
      }).join('\n');

      const systemPrompt = `You are Context's Browser Agent. Your task is to achieve the user's goal by executing step-by-step browser actions.
Goal: "${userGoal}"
Current URL: ${currentUrl || 'about:blank'}
Page Title: ${currentTitle || 'No Title'}

List of interactive elements on the current page:
${JSON.stringify(elements, null, 2)}

${extractedContext ? `Extracted Page Text Context:\n${extractedContext}\n` : ''}

${steps.length > 0 ? `Execution History of Previous Steps:\n${formattedSteps}\n` : ''}

Available Actions:
1. { "action": "navigate", "url": "https://..." }
2. { "action": "click", "targetId": "element-id-from-list" }
3. { "action": "type", "targetId": "element-id-from-list", "text": "text to type" }
4. { "action": "hover", "targetId": "element-id-from-list" }
5. { "action": "back" }
6. { "action": "key", "targetId": "element-id-from-list", "text": "keyName" }
7. { "action": "scroll", "text": "up" | "down" }
8. { "action": "wait", "text": "milliseconds" }
9. { "action": "extract" } - Extract text content from the current page.
10. { "action": "done", "text": "Final detailed answer / summary of what you accomplished" }
11. { "action": "fail", "text": "Error explanation / why it was not possible to complete the task" }

Select the next single action to take. Provide your thought process (concise, written in third-person) and the next action in JSON format:
{
  "thought": "Thought text...",
  "action": "click" | "navigate" | "type" | "hover" | "back" | "key" | "scroll" | "wait" | "extract" | "done" | "fail",
  "targetId": "context-el-...",
  "text": "...",
  "url": "..."
}

Respond ONLY with a JSON object. Do not include markdown code block wrappers (like \`\`\`json). No explanations, no text before or after the JSON.`;

      let screenshotBase64 = '';
      try {
        const buffer = await pageInstance.screenshot({ type: 'png' });
        screenshotBase64 = buffer.toString('base64');
        session.latestScreenshotBuffer = buffer;
      } catch (e) {
        console.error('Failed to take screenshot for background LLM loop', e);
      }

      const llmResponse = await callLLM(settings, systemPrompt, "What is the next action to take to achieve my goal?", screenshotBase64);
      let cleanLlm = llmResponse.trim();
      if (cleanLlm.startsWith('```json')) cleanLlm = cleanLlm.slice(7);
      else if (cleanLlm.startsWith('```')) cleanLlm = cleanLlm.slice(3);
      if (cleanLlm.endsWith('```')) cleanLlm = cleanLlm.slice(0, -3);
      cleanLlm = cleanLlm.trim();

      const decision = JSON.parse(cleanLlm);
      runLog.push(`Thought: "${decision.thought}" | Action: ${decision.action}`);

      const currentStep = {
        id: `step-${loopCount}-${Date.now()}`,
        thought: decision.thought || 'Executing next step...',
        action: decision.action,
        targetId: decision.targetId,
        text: decision.text,
        url: decision.url,
        status: 'pending',
        timestamp: new Date().toISOString()
      };
      steps.push(currentStep);

      if (decision.action === 'done' || decision.action === 'fail') {
        currentStep.status = 'success';
        currentStep.logMessage = decision.action === 'done' ? 'Completed task' : 'Failed task';
        isFinished = true;
        runLog.push(`Finished headless agent: ${decision.action}`);
        return {
          success: decision.action === 'done',
          text: decision.text || (decision.action === 'done' ? 'Browser task completed successfully.' : 'Browser task failed.'),
          steps,
          url: currentUrl,
          title: currentTitle
        };
      }

      const { action, targetId, text, url } = decision;
      try {
        if (action === 'navigate') {
          let targetUrl = url.trim();
          if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
          await pageInstance.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          currentStep.status = 'success';
          currentStep.logMessage = `Navigated to ${targetUrl}`;
        } else if (action === 'click') {
          const selector = `[data-context-id="${targetId}"]`;
          const el = await pageInstance.$(selector);
          if (!el) throw new Error(`Element ${targetId} not found`);
          await highlightElement(selector, '#ef4444', sid);
          await el.click();
          await sleep(1500);
          currentStep.status = 'success';
          currentStep.logMessage = `Clicked element "${targetId}"`;
        } else if (action === 'type') {
          const selector = `[data-context-id="${targetId}"]`;
          const el = await pageInstance.$(selector);
          if (!el) throw new Error(`Element ${targetId} not found`);
          await highlightElement(selector, '#3b82f6', sid);
          await pageInstance.evaluate((sel) => {
            const item = document.querySelector(sel);
            if (item) {
              item.value = '';
              item.focus();
            }
          }, selector);
          await el.type(text || '');
          await pageInstance.evaluate((sel) => {
            const item = document.querySelector(sel);
            if (item) {
              item.dispatchEvent(new Event('change', { bubbles: true }));
              item.blur();
            }
          }, selector);
          currentStep.status = 'success';
          currentStep.logMessage = `Typed "${text}" into element "${targetId}"`;
        } else if (action === 'hover') {
          const selector = `[data-context-id="${targetId}"]`;
          const el = await pageInstance.$(selector);
          if (!el) throw new Error(`Element ${targetId} not found`);
          await highlightElement(selector, '#eab308', sid);
          await el.hover();
          await sleep(1000);
          currentStep.status = 'success';
          currentStep.logMessage = `Hovered cursor over element "${targetId}"`;
        } else if (action === 'back') {
          await pageInstance.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
          await sleep(1000);
          currentStep.status = 'success';
          currentStep.logMessage = `Performed browser go-back navigation`;
        } else if (action === 'key') {
          if (!text) throw new Error('Key text required for keyboard press');
          if (targetId) {
            const selector = `[data-context-id="${targetId}"]`;
            const el = await pageInstance.$(selector);
            if (!el) throw new Error(`Element ${targetId} not found`);
            await highlightElement(selector, '#10b981', sid);
            await el.focus();
          }
          await pageInstance.keyboard.press(text);
          await sleep(1000);
          currentStep.status = 'success';
          currentStep.logMessage = `Pressed key "${text}"${targetId ? ` on element "${targetId}"` : ''}`;
        } else if (action === 'scroll') {
          const dir = text === 'up' ? 'up' : 'down';
          await pageInstance.evaluate((d) => window.scrollBy(0, d === 'up' ? -500 : 500), dir);
          currentStep.status = 'success';
          currentStep.logMessage = `Scrolled page ${dir}`;
        } else if (action === 'wait') {
          const ms = parseInt(text, 10) || 2000;
          await sleep(ms);
          currentStep.status = 'success';
          currentStep.logMessage = `Waited ${ms}ms`;
        } else if (action === 'extract') {
          const pageText = await pageInstance.evaluate(() => document.body.innerText);
          extractedContext += `\n[Page Data from ${pageInstance.url()}]:\n${pageText.slice(0, 1500)}\n`;
          currentStep.status = 'success';
          currentStep.logMessage = `Extracted text from page`;
        } else {
          throw new Error(`Unsupported action "${action}"`);
        }
      } catch (err) {
        console.error(`Error executing action ${action} in background session ${sid}:`, err);
        currentStep.status = 'error';
        currentStep.logMessage = err.message || `Action ${action} failed`;
        runLog.push(`Step ${loopCount} error: ${err.message}`);
      }

      await updateScreenshotForSession(sid);
      await saveStepScreenshot(currentStep.id, sid);
      await sleep(1000);
    }

    throw new Error(`Execution timed out after ${maxLoops} cycles.`);
  } finally {
    // Auto close context and clean up session
    try {
      const s = sessions.get(sid);
      if (s && s.context) {
        await s.context.close();
      }
      sessions.delete(sid);
      console.log(`[Browser Server] Cleaned up background browser task context: ${sid}`);
    } catch (err) {
      console.error(`Failed to close context for session ${sid}`, err);
    }
  }
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

  try {
    if (!settings) {
      throw new Error('LLM Settings not synchronized to server yet. Please open Context in your browser first to sync configuration.');
    }
    
    let resultText = '';
    let browserSessionData = null;

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

    if (schedule.agentMode === 'browser') {
      run.log.push('Executing background Browser Agent task...');
      const res = await executeBrowserAgent(settings, schedule.prompt, run.log);
      resultText = res.text;
      
      browserSessionData = {
        url: res.url,
        title: res.title,
        status: res.success ? 'completed' : 'failed',
        steps: res.steps,
        screenshotTimestamp: Date.now()
      };
      run.log.push('Headless browser operations completed.');
    } else {
      run.log.push('Executing standard LLM completion task...');
      const systemPrompt = `You are Context's Task Scheduling Agent. Provide a comprehensive summary answering the user's prompt.
Current Time: ${new Date().toLocaleString()}
Scheduled Job: "${schedule.title}"`;

      resultText = await callLLM(settings, systemPrompt, schedule.prompt);
      run.log.push('API completion call successful.');
    }

    run.status = 'success';
    run.endTime = new Date().toISOString();
    run.output = resultText;

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
    syncQueue.push({
      id: `sync-${Date.now()}`,
      chatId,
      isNewChat,
      chatTitle,
      userMsg,
      assistantMsg,
      timestamp: new Date().toISOString()
    });
    writeJSON(PATHS.syncQueue, syncQueue);

    run.log.push('Run completed. Message queued for front-end sync.');
  } catch (e) {
    console.error(`[Scheduler] Task execution failed: ${schedule.title}`, e);
    run.status = 'failed';
    run.endTime = new Date().toISOString();
    run.output = `Execution Failed: ${e.message}`;
    run.log.push(`ERROR: ${e.message}`);
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
}

const activeCronJobs = new Map();

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
  } else {
    let cronExpr = schedule.cronExpression;
    if (schedule.scheduleType === 'interval') {
      cronExpr = `*/${schedule.intervalMinutes} * * * *`;
    }

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
  schedules.forEach(schedule => {
    if (schedule.isActive) {
      startScheduleCron(schedule);
    }
  });
}

// REST Endpoints for schedules
app.post('/api/schedules/settings', (req, res) => {
  writeJSON(PATHS.settings, req.body);
  res.json({ success: true });
});

app.get('/api/schedules', (req, res) => {
  res.json(readJSON(PATHS.schedules, []));
});

app.post('/api/schedules', (req, res) => {
  const schedule = req.body;
  if (!schedule.id) {
    schedule.id = `sched-${Date.now()}`;
    schedule.createdAt = new Date().toISOString();
  }

  const schedules = readJSON(PATHS.schedules, []);
  const idx = schedules.findIndex(s => s.id === schedule.id);
  if (idx !== -1) {
    schedules[idx] = schedule;
  } else {
    schedules.push(schedule);
  }

  if (schedule.isActive) {
    if (schedule.scheduleType === 'interval') {
      schedule.nextRun = new Date(Date.now() + (schedule.intervalMinutes || 5) * 60000).toISOString();
    } else if (schedule.scheduleType === 'cron') {
      schedule.nextRun = 'See Cron Schedule';
    } else if (schedule.scheduleType === 'once') {
      schedule.nextRun = schedule.dateTime;
    }
  } else {
    schedule.nextRun = undefined;
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

  const schedule = schedules[idx];
  schedule.isActive = !schedule.isActive;

  if (schedule.isActive) {
    if (schedule.scheduleType === 'interval') {
      schedule.nextRun = new Date(Date.now() + (schedule.intervalMinutes || 5) * 60000).toISOString();
    } else if (schedule.scheduleType === 'cron') {
      schedule.nextRun = 'See Cron Schedule';
    } else if (schedule.scheduleType === 'once') {
      schedule.nextRun = schedule.dateTime;
    }
  } else {
    schedule.nextRun = undefined;
  }

  writeJSON(PATHS.schedules, schedules);

  if (schedule.isActive) {
    startScheduleCron(schedule);
  } else {
    stopScheduleCron(schedule.id);
  }

  res.json({ success: true, schedule });
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

// Boot the scheduler engine
initScheduler();

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Browser Companion Server running on http://localhost:${PORT}`);
});
