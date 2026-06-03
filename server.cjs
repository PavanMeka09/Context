const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
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
app.use(express.json());

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
                setupPageListeners(sid, newPage, session);
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

// Helper to attach console, error and network listeners to page
function setupPageListeners(sid, pageInstance, session) {
  if (pageInstance._listenersAttached) return;
  pageInstance._listenersAttached = true;

  pageInstance._contextTabId = pageInstance._contextTabId || `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  session.logs = session.logs || [];

  const addLog = (type, text, url = '') => {
    session.logs.push({
      timestamp: new Date().toISOString(),
      type,
      text,
      url
    });
    if (session.logs.length > 100) {
      session.logs.shift();
    }
  };

  pageInstance.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    let cleanType = 'info';
    if (type === 'error') cleanType = 'error';
    else if (type === 'warning') cleanType = 'warning';
    
    if (text.trim()) {
      addLog(cleanType, `Console [${type}]: ${text}`, pageInstance.url());
    }
  });

  pageInstance.on('pageerror', err => {
    addLog('error', `JS Exception: ${err.message}`, pageInstance.url());
  });

  pageInstance.on('requestfailed', request => {
    const failure = request.failure();
    const reason = failure ? failure.errorText : 'Failed';
    const resourceType = request.resourceType();
    if (['document', 'xhr', 'fetch', 'script'].includes(resourceType)) {
      addLog('network_error', `Network Error (${resourceType}): ${request.method()} ${request.url()} failed with ${reason}`, pageInstance.url());
    }
  });
}

// Helper to get or create isolated session
async function ensureSession(sessionId) {
  const sid = sessionId || 'default';
  await ensureBrowser();

  let session = sessions.get(sid);
  if (!session) {
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
      latestScreenshotBuffer: null,
      logs: []
    };
    sessions.set(sid, session);
    setupPageListeners(sid, pageInstance, session);
    console.log(`[Browser Server] Created new isolated context for session: ${sid}`);
  } else {
    try {
      const pages = await session.context.pages();
      if (pages.length === 0) {
        const pageInstance = await session.context.newPage();
        await pageInstance.setViewport({ width: 1280, height: 800 });
        setupPageListeners(sid, pageInstance, session);
        session.page = pageInstance;
      } else if (!session.page || session.page.isClosed() || !pages.includes(session.page)) {
        session.page = pages[pages.length - 1];
      }
    } catch (e) {
      console.error(`Error verifying active pages for session ${sid}, resetting context`, e);
      try {
        await session.context.close();
      } catch (err) {}
      sessions.delete(sid);
      return ensureSession(sid);
    }
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
      
      const rect = el.getBoundingClientRect();

      result.push({
        id,
        tagName: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || '',
        text: text || `[Unnamed ${el.tagName.toLowerCase()}]`,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom
        }
      });
    });
    return result;
  });
}

// Helper to resolve an interactive element by ID, or attempt to heal it if missing/mutated
async function getInteractiveElementOrHeal(session, targetId, runLog) {
  const pageInstance = session.page;
  const selector = `[data-context-id="${targetId}"]`;
  let el = await pageInstance.$(selector);
  if (el) return { el, actualId: targetId, healed: false };

  const logMsg = `Element "${targetId}" not found immediately. Entering self-healing flow...`;
  console.log(`[Browser Server] ${logMsg}`);
  if (runLog) runLog.push(logMsg);

  // 1. Wait a bit for page load/DOM changes
  await new Promise(r => setTimeout(r, 1500));

  // 2. Re-scrape interactive elements
  const previousElements = session.lastElements || [];
  const targetElement = previousElements.find(item => item.id === targetId);

  const newElements = await scrapeInteractiveElements(pageInstance);
  session.lastElements = newElements;

  // Try standard selector again first (maybe it appeared/loaded now and has the same ID)
  el = await pageInstance.$(selector);
  if (el) {
    const logFound = `Element "${targetId}" appeared after delay.`;
    console.log(`[Browser Server] ${logFound}`);
    if (runLog) runLog.push(logFound);
    return { el, actualId: targetId, healed: false };
  }

  // 3. Match using element details
  if (targetElement) {
    const matched = newElements.find(item => 
      item.tagName === targetElement.tagName && 
      item.type === targetElement.type && 
      item.text === targetElement.text &&
      item.text !== `[Unnamed ${item.tagName}]`
    );

    if (matched) {
      const healSelector = `[data-context-id="${matched.id}"]`;
      const healedEl = await pageInstance.$(healSelector);
      if (healedEl) {
        const healMsg = `Self-healed: matched mutated element "${targetId}" to new element "${matched.id}" (tag: ${matched.tagName}, text: "${matched.text}").`;
        console.log(`[Browser Server] ${healMsg}`);
        if (runLog) runLog.push(healMsg);
        return { el: healedEl, actualId: matched.id, healed: true };
      }
    }

    // Fallback: match by tagName and text (if text is meaningful)
    if (targetElement.text && !targetElement.text.startsWith('[Unnamed')) {
      const matchedByText = newElements.find(item => 
        item.tagName === targetElement.tagName && 
        item.text === targetElement.text
      );
      if (matchedByText) {
        const healSelector = `[data-context-id="${matchedByText.id}"]`;
        const healedEl = await pageInstance.$(healSelector);
        if (healedEl) {
          const healMsg = `Self-healed (text-match): matched element "${targetId}" to "${matchedByText.id}" (tag: ${matchedByText.tagName}, text: "${matchedByText.text}").`;
          console.log(`[Browser Server] ${healMsg}`);
          if (runLog) runLog.push(healMsg);
          return { el: healedEl, actualId: matchedByText.id, healed: true };
        }
      }
    }

    // Fallback: match by index
    const oldIndex = previousElements.findIndex(item => item.id === targetId);
    if (oldIndex !== -1 && oldIndex < newElements.length) {
      const candidate = newElements[oldIndex];
      if (candidate && candidate.tagName === targetElement.tagName && candidate.type === targetElement.type) {
        const healSelector = `[data-context-id="${candidate.id}"]`;
        const healedEl = await pageInstance.$(healSelector);
        if (healedEl) {
          const healMsg = `Self-healed (index-match): matched element "${targetId}" to "${candidate.id}" at index ${oldIndex} (tag: ${candidate.tagName}).`;
          console.log(`[Browser Server] ${healMsg}`);
          if (runLog) runLog.push(healMsg);
          return { el: healedEl, actualId: candidate.id, healed: true };
        }
      }
    }
  }

  throw new Error(`Element "${targetId}" not found and self-healing failed.`);
}

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
              await new Promise(r => setTimeout(r, 1000));
              await scrapeInteractiveElements(session.page);
            }
          }
        }
        if (!success) throw lastError;
        logMessage = `Clicked element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
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
              item.dispatchEvent(new Event('change', { bubbles: true }));
              item.blur();
            }
          }, selector);
          success = true;
        } catch (err) {
          lastError = err;
          if (attempts < 2) {
            console.log(`[Browser Server] Type attempt ${attempts} failed: ${err.message}. Retrying...`);
            await new Promise(r => setTimeout(r, 1000));
            await scrapeInteractiveElements(session.page);
          }
        }
      }
      if (!success) throw lastError;
      logMessage = `Typed "${text}" into element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
      await new Promise(r => setTimeout(r, 1000));
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
            await new Promise(r => setTimeout(r, 1000));
            await scrapeInteractiveElements(session.page);
          }
        }
      }
      if (!success) throw lastError;
      logMessage = `Hovered cursor over element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
      await new Promise(r => setTimeout(r, 1000));
    } else if (action === 'back') {
      await pageInstance.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
      logMessage = `Performed browser go-back navigation`;
      await new Promise(r => setTimeout(r, 1000));
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
            await new Promise(r => setTimeout(r, 1000));
            await scrapeInteractiveElements(session.page);
          }
        }
      }
      if (!success) throw lastError;
      logMessage = `Pressed key "${text}"${targetId ? ` on element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}` : ''}`;
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
    res.json({ success: true, message: 'Logs cleared' });
  } catch (e) {
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
    pageInstance = await browser.newPage();
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
      session.lastElements = elements; // Save in session for self-healing lookup

      const elementsForLlm = elements.map(({ rect, ...rest }) => rest);

      // Generate step history context for the LLM
      const formattedSteps = steps.map((s, idx) => {
        return `- Step ${idx + 1}: Thought: "${s.thought}" -> Action: ${s.action}${s.targetId ? ` on element "${s.targetId}"` : ''}${s.text ? ` with "${s.text}"` : ''}${s.url ? ` to "${s.url}"` : ''} (${s.status === 'success' ? 'Success' : `Failed: ${s.logMessage || 'unknown error'}`})`;
      }).join('\n');

      const systemPrompt = `You are Context's Browser Agent. Your task is to achieve the user's goal by executing step-by-step browser actions.
Goal: "${userGoal}"
Current URL: ${currentUrl || 'about:blank'}
Page Title: ${currentTitle || 'No Title'}

List of interactive elements on the current page:
${JSON.stringify(elementsForLlm, null, 2)}

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
          let attempts = 0;
          let success = false;
          let lastError;
          let actualTargetId = targetId;
          let healedResult = false;
          
          while (attempts < 2 && !success) {
            attempts++;
            try {
              const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, runLog);
              actualTargetId = actualId;
              healedResult = healed || healedResult;
              const selector = `[data-context-id="${actualId}"]`;
              await highlightElement(selector, '#ef4444', sid);
              await el.click();
              success = true;
            } catch (err) {
              lastError = err;
              if (attempts < 2) {
                runLog.push(`Click attempt ${attempts} failed: ${err.message}. Retrying...`);
                await sleep(1000);
                await scrapeInteractiveElements(pageInstance);
              }
            }
          }
          if (!success) throw lastError;
          await sleep(1500);
          currentStep.status = 'success';
          currentStep.logMessage = `Clicked element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
        } else if (action === 'type') {
          let attempts = 0;
          let success = false;
          let lastError;
          let actualTargetId = targetId;
          let healedResult = false;
          
          while (attempts < 2 && !success) {
            attempts++;
            try {
              const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, runLog);
              actualTargetId = actualId;
              healedResult = healed || healedResult;
              const selector = `[data-context-id="${actualId}"]`;
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
              success = true;
            } catch (err) {
              lastError = err;
              if (attempts < 2) {
                runLog.push(`Type attempt ${attempts} failed: ${err.message}. Retrying...`);
                await sleep(1000);
                await scrapeInteractiveElements(pageInstance);
              }
            }
          }
          if (!success) throw lastError;
          currentStep.status = 'success';
          currentStep.logMessage = `Typed "${text}" into element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
        } else if (action === 'hover') {
          let attempts = 0;
          let success = false;
          let lastError;
          let actualTargetId = targetId;
          let healedResult = false;
          
          while (attempts < 2 && !success) {
            attempts++;
            try {
              const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, runLog);
              actualTargetId = actualId;
              healedResult = healed || healedResult;
              const selector = `[data-context-id="${actualId}"]`;
              await highlightElement(selector, '#eab308', sid);
              await el.hover();
              success = true;
            } catch (err) {
              lastError = err;
              if (attempts < 2) {
                runLog.push(`Hover attempt ${attempts} failed: ${err.message}. Retrying...`);
                await sleep(1000);
                await scrapeInteractiveElements(pageInstance);
              }
            }
          }
          if (!success) throw lastError;
          await sleep(1000);
          currentStep.status = 'success';
          currentStep.logMessage = `Hovered cursor over element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
        } else if (action === 'back') {
          await pageInstance.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
          await sleep(1000);
          currentStep.status = 'success';
          currentStep.logMessage = `Performed browser go-back navigation`;
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
                const { el, actualId, healed } = await getInteractiveElementOrHeal(session, targetId, runLog);
                actualTargetId = actualId;
                healedResult = healed || healedResult;
                const selector = `[data-context-id="${actualId}"]`;
                await highlightElement(selector, '#10b981', sid);
                await el.focus();
              }
              await pageInstance.keyboard.press(text);
              success = true;
            } catch (err) {
              lastError = err;
              if (attempts < 2) {
                runLog.push(`Key press attempt ${attempts} failed: ${err.message}. Retrying...`);
                await sleep(1000);
                await scrapeInteractiveElements(pageInstance);
              }
            }
          }
          if (!success) throw lastError;
          await sleep(1000);
          currentStep.status = 'success';
          currentStep.logMessage = `Pressed key "${text}"${targetId ? ` on element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}` : ''}`;
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

// Server-side SearXNG Search Helper for Scheduled Tasks
async function searchSearxng(query, customUrl) {
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
      }
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
      let systemPrompt = `You are Context's Task Scheduling Agent. Provide a comprehensive summary answering the user's prompt.
Current Time: ${new Date().toLocaleString()}
Scheduled Job: "${schedule.title}"`;

      if (schedule.isWebSearchEnabled) {
        run.log.push('Web Search is enabled. Querying SearXNG...');
        try {
          const results = await searchSearxng(schedule.prompt, settings.searxngUrl);
          if (results && results.length > 0) {
            run.log.push(`Web search completed. Found ${results.length} results.`);
            const webSearchContext = results.map((r, idx) => {
              return `[Web Result #${idx + 1}]
Title: ${r.title}
URL: ${r.url}
Excerpt: ${r.content}`;
            }).join('\n\n');
            systemPrompt += `\n\n[REAL-TIME WEB SEARCH CONTEXT]\nUse the following real-time web search results from SearXNG to answer the user's prompt. Rely on these search results to provide accurate, up-to-date information:\n${webSearchContext}`;
          } else {
            run.log.push('Web search returned no results.');
          }
        } catch (searchErr) {
          run.log.push(`Web search error: ${searchErr.message}`);
          console.error(`Scheduled task search error for job ${schedule.id}:`, searchErr);
        }
      }

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
