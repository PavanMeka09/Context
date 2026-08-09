const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const { DATA_DIR, broadcastLiveEvent, safeJsonParse } = require('./utils.cjs');
const { callLLM } = require('./llm.cjs');

let browser = null;
const sessions = new Map(); // sessionId -> { context, page, latestScreenshotBuffer, logs, lastAccessed }
const sessionCreationLocks = new Map(); // sessionId -> Promise
let browserLaunchPromise = null;
const activeBrowserAgents = new Map(); // sessionId -> { controller }
const browserAgentStates = new Map(); // sessionId -> { state: 'running' | 'paused', pauseResolver: null }
const SCREENSHOT_OPTIONS = Object.freeze({ type: 'jpeg', quality: 75 });


async function capturePageScreenshot(pageInstance) {
  return await pageInstance.screenshot(SCREENSHOT_OPTIONS);
}

async function navigateToUrl(pageInstance, rawUrl, options = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL required for navigation');
  }
  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }
  const timeout = options.timeout || 15000;
  const waitUntil = options.waitUntil || 'domcontentloaded';
  await pageInstance.goto(targetUrl, { waitUntil, timeout });
  return targetUrl;
}

function pauseBrowserAgent(sessionId) {
  const sid = sessionId || 'default';
  const stateObj = browserAgentStates.get(sid);
  if (stateObj) {
    stateObj.state = 'paused';
    return true;
  }
  return false;
}

function resumeBrowserAgent(sessionId) {
  const sid = sessionId || 'default';
  const stateObj = browserAgentStates.get(sid);
  if (stateObj) {
    stateObj.state = 'running';
    if (stateObj.pauseResolver) {
      stateObj.pauseResolver();
      stateObj.pauseResolver = null;
    }
    return true;
  }
  return false;
}

function stepBrowserAgent(sessionId) {
  const sid = sessionId || 'default';
  const stateObj = browserAgentStates.get(sid);
  if (stateObj && stateObj.state === 'paused') {
    if (stateObj.pauseResolver) {
      stateObj.pauseResolver();
      stateObj.pauseResolver = null;
    }
    return true;
  }
  return false;
}

// Periodically clean up inactive browser sessions to prevent memory and process leaks
const SESSION_IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
setInterval(async () => {
  const now = Date.now();
  for (const [sid, session] of sessions.entries()) {
    if (now - session.lastAccessed > SESSION_IDLE_TIMEOUT) {
      console.log(`[Browser Server] Cleaning up idle session: ${sid}`);
      try {
        if (session.context) {
          await session.context.close();
        }
      } catch (e) {
        console.error(`Failed to close idle session context for ${sid}`, e);
      }
      sessions.delete(sid);
      activeBrowserAgents.delete(sid);
      browserAgentStates.delete(sid);
    }
  }

  if (sessions.size === 0 && browser) {
    console.log('[Browser Server] All sessions idle and cleaned. Shutting down browser instance.');
    await closeBrowser();
  }
}, 60000); // Sweep every minute

function getBrowser() {
  return browser;
}

function setBrowser(val) {
  browser = val;
}

async function closeBrowser() {
  if (browser) {
    try {
      await browser.close();
      console.log('[Browser Server] Headless browser closed.');
    } catch (e) {}
    browser = null;
  }
}

// Helper to launch browser if not running (concurrency-safe)
async function ensureBrowser() {
  if (browser) {
    const isConn = typeof browser.isConnected === 'function' ? browser.isConnected() : browser.connected;
    if (isConn === false) {
      try {
        await browser.close();
      } catch (e) {}
      browser = null;
      sessions.clear();
    }
  }

  if (browser) return;

  if (browserLaunchPromise) {
    await browserLaunchPromise;
    return;
  }

  browserLaunchPromise = (async () => {
    const instance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    browser = instance;
  })();

  try {
    await browserLaunchPromise;
  } finally {
    browserLaunchPromise = null;
  }
}

// Helper to attach console, error and network listeners to page
function setupPageListeners(sid, pageInstance, session) {
  if (pageInstance._listenersAttached) return;
  pageInstance._listenersAttached = true;

  pageInstance._contextTabId = pageInstance._contextTabId || `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  session.logs = session.logs || [];

  const addLog = (type, text, url = '') => {
    const newLog = {
      timestamp: new Date().toISOString(),
      type,
      text,
      url
    };
    session.logs.push(newLog);
    if (session.logs.length > 100) {
      session.logs.shift();
    }
    broadcastLiveEvent('browser-log', { sessionId: sid, log: newLog });
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

  pageInstance.on('dialog', async dialog => {
    addLog('info', `Dialog [${dialog.type()}]: ${dialog.message()}`, pageInstance.url());
    try {
      await dialog.dismiss();
    } catch (err) {}
  });

  pageInstance.on('load', () => {
    updateScreenshotForSession(sid);
  });
}

// Helper to get or create isolated session (concurrency-safe)
async function ensureSession(sessionId) {
  const sid = sessionId || 'default';
  await ensureBrowser();

  let session = sessions.get(sid);
  if (session) {
    try {
      const pages = session.context.pages ? await session.context.pages() : [];
      if (pages.length === 0) {
        const pageInstance = await session.context.newPage();
        await pageInstance.setViewportSize({ width: 1280, height: 800 });
        setupPageListeners(sid, pageInstance, session);
        session.page = pageInstance;
      } else if (!session.page || session.page.isClosed() || !pages.includes(session.page)) {
        session.page = pages[pages.length - 1];
      }
      session.lastAccessed = Date.now();
      return session;
    } catch (e) {
      console.error(`Error verifying active pages for session ${sid}, resetting context`, e);
      try {
        await session.context.close();
      } catch (err) {}
      sessions.delete(sid);
    }
  }

  if (sessionCreationLocks.has(sid)) {
    await sessionCreationLocks.get(sid);
    return sessions.get(sid);
  }

  const creationPromise = (async () => {
    let context;
    try {
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
    } catch (err) {
      console.error(`Failed to create browser context for ${sid}`, err);
      throw err;
    }

    const pageInstance = await context.newPage();

    session = {
      context,
      page: pageInstance,
      latestScreenshotBuffer: null,
      logs: [],
      lastAccessed: Date.now()
    };
    sessions.set(sid, session);

    if (context.on) {
      context.on('page', async (newPage) => {
        setupPageListeners(sid, newPage, session);
        session.page = newPage;
        console.log(`[Browser Server] Auto-switched session ${sid} to new page: ${newPage.url()}`);
        await updateScreenshotForSession(sid);
      });
    }

    setupPageListeners(sid, pageInstance, session);
    console.log(`[Browser Server] Created new isolated Playwright context for session: ${sid}`);
  })();

  sessionCreationLocks.set(sid, creationPromise);
  try {
    await creationPromise;
  } finally {
    sessionCreationLocks.delete(sid);
  }

  return sessions.get(sid);
}

async function updateScreenshotForSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.page) {
    try {
      session.latestScreenshotBuffer = await capturePageScreenshot(session.page);
      const url = session.page.url();
      const title = await session.page.title();
      const elements = await scrapeInteractiveElements(session.page);
      session.lastElements = elements;

      const screenshotBase64 = `data:image/jpeg;base64,${session.latestScreenshotBuffer.toString('base64')}`;

      const hasAgent = activeBrowserAgents.has(sessionId);
      const stateObj = browserAgentStates.get(sessionId);
      const agentStatus = hasAgent ? (stateObj && stateObj.state === 'paused' ? 'paused' : 'running') : 'idle';

      broadcastLiveEvent('browser-state', {
        sessionId,
        url,
        title,
        elements,
        screenshot: screenshotBase64,
        agentStatus
      });
    } catch (e) {
      console.error(`Failed to take screenshot and broadcast state for session ${sessionId}`, e);
    }
  }
}

async function saveStepScreenshot(stepId, sessionId) {
  const session = sessions.get(sessionId);
  if (stepId && session && session.latestScreenshotBuffer) {
    try {
      const screenshotsDir = path.join(DATA_DIR, 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(screenshotsDir, `${stepId}.jpg`), session.latestScreenshotBuffer);
    } catch (e) {
      console.error(`Failed to save step screenshot to disk for session ${sessionId}`, e);
    }
  }
}

async function highlightElement(selector, color = '#ef4444', sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.page) {
    try {
      await session.page.evaluate(({ sel, col }) => {
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
      }, { sel: selector, col: color });

      await new Promise(r => setTimeout(r, 30));
      await updateScreenshotForSession(sessionId);

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

async function drawVisualTags(pageInstance) {
  if (!pageInstance) return;
  try {
    await pageInstance.evaluate(() => {
      let style = document.getElementById('context-visual-tag-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'context-visual-tag-style';
        style.innerHTML = `
          .context-ai-visual-tag {
            position: absolute !important;
            background-color: #ef4444 !important;
            color: white !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            padding: 1px 4px !important;
            border: 1px solid white !important;
            border-radius: 3px !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
            z-index: 100000000 !important;
            pointer-events: none !important;
            line-height: 1 !important;
            transform: translate(-50%, -50%) !important;
          }
        `;
        document.head.appendChild(style);
      }

      const elements = document.querySelectorAll('[data-context-id]');
      elements.forEach(el => {
        const id = el.getAttribute('data-context-id');
        const num = id.replace('context-el-', '');

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const tag = document.createElement('div');
        tag.className = 'context-ai-visual-tag';
        tag.style.left = (window.scrollX + rect.left + rect.width / 2) + 'px';
        tag.style.top = (window.scrollY + rect.top + rect.height / 2) + 'px';
        tag.innerText = num;

        document.body.appendChild(tag);
      });
    });
  } catch (err) {
    console.error('Failed to draw visual tags:', err);
  }
}

async function clearVisualTags(pageInstance) {
  if (!pageInstance) return;
  try {
    await pageInstance.evaluate(() => {
      const tags = document.querySelectorAll('.context-ai-visual-tag');
      tags.forEach(t => t.remove());

      const style = document.getElementById('context-visual-tag-style');
      if (style) style.remove();
    });
  } catch (err) {
    console.error('Failed to clear visual tags:', err);
  }
}

async function scrapeInteractiveElements(pageInstance) {
  if (!pageInstance) return [];
  return pageInstance.evaluate(() => {
    const interactiveSelectors = [
      'a', 'button', 'input', 'textarea', 'select', 'option', 'details', 'summary',
      '[role="button"]', '[role="checkbox"]', '[role="link"]', '[role="menuitem"]',
      '[role="tab"]', '[role="treeitem"]', '[role="radio"]', '[role="switch"]',
      '[role="textbox"]', '[role="combobox"]', '[role="searchbox"]',
      '[tabindex]', '[onclick]', '[contenteditable="true"]'
    ].join(', ');

    const els = document.querySelectorAll(interactiveSelectors);

    if (window._contextElementCounter === undefined) {
      window._contextElementCounter = 1;
    }

    const visibilityCache = new Map();
    const isVisible = (el) => {
      if (visibilityCache.has(el)) return visibilityCache.get(el);

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        visibilityCache.set(el, false);
        return false;
      }

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        visibilityCache.set(el, false);
        return false;
      }

      const margin = 50;
      const vHeight = window.innerHeight || 800;
      const vWidth = window.innerWidth || 1280;
      if (
        rect.top >= vHeight + margin ||
        rect.bottom <= -margin ||
        rect.left >= vWidth + margin ||
        rect.right <= -margin
      ) {
        visibilityCache.set(el, false);
        return false;
      }

      visibilityCache.set(el, true);
      return true;
    };

    const hasInteractiveAncestor = (el) => {
      let parent = el.parentElement;
      while (parent) {
        const tag = parent.tagName.toLowerCase();
        if (
          tag === 'a' ||
          tag === 'button' ||
          tag === 'select' ||
          tag === 'label' ||
          parent.getAttribute('role') === 'button' ||
          parent.getAttribute('role') === 'link'
        ) {
          if (isVisible(parent)) {
            return true;
          }
        }
        parent = parent.parentElement;
      }
      return false;
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

    const getCssSelector = (el) => {
      if (el.id) {
        const escapedId = el.id.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1');
        try {
          if (document.querySelectorAll(`#${escapedId}`).length === 1) {
            return `#${escapedId}`;
          }
        } catch (e) {}
      }

      const tagName = el.tagName.toLowerCase();
      const name = el.getAttribute('name');
      if (name) {
        const escapedName = name.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1');
        const nameSelector = `${tagName}[name="${escapedName}"]`;
        try {
          if (document.querySelectorAll(nameSelector).length === 1) {
            return nameSelector;
          }
        } catch (e) {}
      }

      const pathArr = [];
      let parent = el;
      while (parent && parent.nodeType === Node.ELEMENT_NODE) {
        let selector = parent.tagName.toLowerCase();
        if (parent.id) {
          const escapedId = parent.id.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1');
          selector += `#${escapedId}`;
          try {
            if (document.querySelectorAll(`#${escapedId}`).length === 1) {
              pathArr.unshift(selector);
              break;
            }
          } catch (e) {}
        } else {
          let sibling = parent.previousElementSibling;
          let nth = 1;
          while (sibling) {
            if (sibling.tagName === parent.tagName) {
              nth++;
            }
            sibling = sibling.previousElementSibling;
          }
          selector += `:nth-of-type(${nth})`;
        }
        pathArr.unshift(selector);
        parent = parent.parentElement;
      }
      return pathArr.join(' > ');
    };

    const result = [];
    const activeEls = new Set();

    els.forEach(el => {
      if (!isVisible(el)) return;
      if (hasInteractiveAncestor(el)) return;

      activeEls.add(el);

      let id = el.getAttribute('data-context-id');
      if (!id) {
        id = `context-el-${window._contextElementCounter++}`;
        el.setAttribute('data-context-id', id);
      }

      let rawText = getSemanticLabel(el);
      let text = rawText.trim().replace(/\s+/g, ' ').slice(0, 80);

      const rect = el.getBoundingClientRect();

      const attributes = {
        id: el.getAttribute('id') || '',
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        title: el.getAttribute('title') || '',
        href: el.getAttribute('href') || '',
        className: el.className || '',
        role: el.getAttribute('role') || ''
      };

      result.push({
        id,
        tagName: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || '',
        text: text || `[Unnamed ${el.tagName.toLowerCase()}]`,
        selector: getCssSelector(el),
        attributes,
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

    document.querySelectorAll('[data-context-id]').forEach(el => {
      if (!activeEls.has(el)) {
        el.removeAttribute('data-context-id');
      }
    });

    return result;
  });
}
async function retagElementContextId(pageInstance, elementHandle, targetId) {
  await pageInstance.evaluate(({ elObj, id }) => {
    const old = document.querySelector(`[data-context-id="${id}"]`);
    if (old) old.removeAttribute('data-context-id');
    if (elObj) elObj.setAttribute('data-context-id', id);
  }, { elObj: elementHandle, id: targetId });
}


async function getInteractiveElementOrHeal(session, targetId, runLog) {
  const pageInstance = session.page;
  const selector = `[data-context-id="${targetId}"]`;
  let el = await pageInstance.$(selector);
  if (el) return { el, actualId: targetId, healed: false };

  const logMsg = `Element "${targetId}" not found immediately. Entering self-healing flow...`;
  console.log(`[Browser Server] ${logMsg}`);
  if (runLog) runLog.push(logMsg);

  const previousElements = session.lastElements || [];
  const targetElement = previousElements.find(item => item.id === targetId);

  if (targetElement && targetElement.selector) {
    try {
      const cssEl = await pageInstance.$(targetElement.selector);
      if (cssEl) {
        const isInteractive = await pageInstance.evaluate((elObj) => {
          if (!elObj) return false;
          const rect = elObj.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const style = window.getComputedStyle(elObj);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          return true;
        }, cssEl);

        if (isInteractive) {
          await retagElementContextId(pageInstance, cssEl, targetId);
          const healMsg = `Self-healed instantly: matched element "${targetId}" via CSS selector "${targetElement.selector}".`;
          console.log(`[Browser Server] ${healMsg}`);
          if (runLog) runLog.push(healMsg);
          return { el: cssEl, actualId: targetId, healed: true };
        }
      }
    } catch (e) {
      console.warn(`[Browser Server] CSS selector instant-heal attempt failed:`, e);
    }
  }

  await new Promise(r => setTimeout(r, 1500));

  const newElements = await scrapeInteractiveElements(pageInstance);
  session.lastElements = newElements;

  if (targetElement) {
    let bestMatch = null;
    let highestScore = 0;

    for (const candidate of newElements) {
      let score = 0;

      if (candidate.tagName === targetElement.tagName) {
        score += 2;
      }

      if (candidate.type === targetElement.type) {
        score += 1;
      }

      if (candidate.text === targetElement.text && targetElement.text && !targetElement.text.startsWith('[Unnamed')) {
        score += 4;
      } else if (targetElement.text && candidate.text && !targetElement.text.startsWith('[Unnamed')) {
        const t1 = targetElement.text.toLowerCase();
        const t2 = candidate.text.toLowerCase();
        if (t1.includes(t2) || t2.includes(t1)) {
          score += 2;
        }
      }

      if (targetElement.attributes && candidate.attributes) {
        const attr1 = targetElement.attributes;
        const attr2 = candidate.attributes;

        if (attr1.id && attr1.id === attr2.id) score += 4;
        if (attr1.name && attr1.name === attr2.name) score += 3;
        if (attr1.placeholder && attr1.placeholder === attr2.placeholder) score += 3;
        if (attr1.ariaLabel && attr1.ariaLabel === attr2.ariaLabel) score += 3;
        if (attr1.title && attr1.title === attr2.title) score += 3;
        if (attr1.href && attr1.href === attr2.href) score += 3;
        if (attr1.role && attr1.role === attr2.role) score += 2;

        if (attr1.className && attr2.className) {
          const classes1 = attr1.className.split(/\s+/).filter(Boolean);
          const classes2 = attr2.className.split(/\s+/).filter(Boolean);
          const intersection = classes1.filter(c => classes2.includes(c));
          if (intersection.length > 0) {
            score += Math.min(2, intersection.length * 0.5);
          }
        }
      }

      if (targetElement.rect && candidate.rect) {
        const dx = Math.abs(candidate.rect.x - targetElement.rect.x);
        const dy = Math.abs(candidate.rect.y - targetElement.rect.y);
        if (dx < 100 && dy < 100) {
          score += 2;
          if (dx < 20 && dy < 20) {
            score += 1;
          }
        }
      }

      if (targetElement.selector && candidate.selector && targetElement.selector === candidate.selector) {
        score += 5;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch && highestScore >= 5) {
      const healSelector = `[data-context-id="${bestMatch.id}"]`;
      const healedEl = await pageInstance.$(healSelector);
      if (healedEl) {
        await retagElementContextId(pageInstance, healedEl, targetId);

        const healMsg = `Self-healed: matched mutated element "${targetId}" to new element "${bestMatch.id}" (score: ${highestScore}, tag: ${bestMatch.tagName}, text: "${bestMatch.text}").`;
        console.log(`[Browser Server] ${healMsg}`);
        if (runLog) runLog.push(healMsg);
        return { el: healedEl, actualId: targetId, healed: true };
      }
    }
  }

  throw new Error(`Element "${targetId}" not found and self-healing failed.`);
}

async function executeBrowserAgent(settings, userGoal, runLog, sessionId, abortSignal = null, messageId = null) {
  const sid = sessionId || `sched-agent-${Date.now()}`;
  browserAgentStates.set(sid, { state: 'running', pauseResolver: null });
  let currentUrl = '';
  let currentTitle = '';
  const steps = [];
  try {
    runLog.push(`Launching Playwright browser viewport for session ${sid}...`);
    const session = await ensureSession(sid);
    let pageInstance = session.page;

    currentUrl = pageInstance.url();
    currentTitle = await pageInstance.title();
    let extractedContext = '';
    let loopCount = 0;
    const maxLoops = 15;
    let isFinished = false;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    while (!isFinished && loopCount < maxLoops) {
      if (abortSignal && abortSignal.aborted) {
        throw new Error('Task execution cancelled by user.');
      }
      loopCount++;
      pageInstance = session.page;
      runLog.push(`Executing browser cycle step ${loopCount}...`);

      currentUrl = pageInstance.url();
      currentTitle = await pageInstance.title();

      // Pause check
      let stateObj = browserAgentStates.get(sid);
      if (stateObj && stateObj.state === 'paused') {
        const pauseMsg = `Agent paused. Waiting for resume or step...`;
        console.log(`[Browser Server] ${pauseMsg}`);
        runLog.push(pauseMsg);

        if (messageId) {
          broadcastLiveEvent('browser-agent-update', {
            sessionId,
            messageId,
            url: currentUrl,
            title: currentTitle,
            status: 'paused',
            steps,
            screenshotTimestamp: Date.now()
          });
        }

        let onAbort;
        await new Promise((resolve) => {
          stateObj.pauseResolver = resolve;
          if (abortSignal) {
            onAbort = () => {
              stateObj.pauseResolver = null;
              resolve();
            };
            abortSignal.addEventListener('abort', onAbort);
          }
        });

        if (abortSignal && onAbort) {
          abortSignal.removeEventListener('abort', onAbort);
        }

        if (abortSignal && abortSignal.aborted) {
          throw new Error('Task execution cancelled by user.');
        }
      }

      const elements = await scrapeInteractiveElements(pageInstance);
      session.lastElements = elements;

      let ariaTree = '';
      try {
        if (typeof pageInstance.ariaSnapshot === 'function') {
          ariaTree = await pageInstance.ariaSnapshot();
        }
      } catch (e) {
        ariaTree = '';
      }

      const elementsForLlm = elements.map(({ rect, selector, ...rest }) => rest);

      const formattedSteps = steps.map((s, idx) => {
        return `- Step ${idx + 1}: Thought: "${s.thought}" -> Action: ${s.action}${s.targetId ? ` on element "${s.targetId}"` : ''}${s.text ? ` with "${s.text}"` : ''}${s.url ? ` to "${s.url}"` : ''} (${s.status === 'success' ? 'Success' : `Failed: ${s.logMessage || 'unknown error'}`})`;
      }).join('\n');

      const systemPrompt = `You are Context's Browser Agent. Your task is to achieve the user's goal by executing step-by-step browser actions.
Goal: "${userGoal}"
Current URL: ${currentUrl || 'about:blank'}
Page Title: ${currentTitle || 'No Title'}

ACCESSIBILITY & UI TREE (ARIA Snapshot):
${ariaTree || 'N/A'}

IMPORTANT VISUAL LABELS: Each interactive element on the page screenshot is annotated with a red badge containing a number (e.g., [1], [2], [3]). This number corresponds exactly to the number suffix of the element's ID (e.g., badge "1" represents element ID "context-el-1", badge "42" is "context-el-42"). Examine the ARIA tree and screenshot visually, find the target element/badge, and select the corresponding element ID from the JSON list.

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
        await drawVisualTags(pageInstance);
        const buffer = await capturePageScreenshot(pageInstance);
        await clearVisualTags(pageInstance);
        screenshotBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        session.latestScreenshotBuffer = buffer;
      } catch (e) {
        console.error('Failed to take screenshot for background LLM loop', e);
        try {
          await clearVisualTags(pageInstance);
        } catch (err) {}
      }

      const llmResponse = await callLLM(settings, systemPrompt, "What is the next action to take to achieve my goal?", screenshotBase64, abortSignal);
      const decision = safeJsonParse(llmResponse);
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

      if (messageId) {
        broadcastLiveEvent('browser-agent-update', {
          sessionId,
          messageId,
          url: currentUrl,
          title: currentTitle,
          status: 'running',
          steps,
          screenshotTimestamp: Date.now()
        });
      }

      if (decision.action === 'done' || decision.action === 'fail') {
        currentStep.status = 'success';
        currentStep.logMessage = decision.action === 'done' ? 'Completed task' : 'Failed task';
        isFinished = true;
        runLog.push(`Finished Playwright agent: ${decision.action}`);

        if (messageId) {
          broadcastLiveEvent('browser-agent-update', {
            sessionId,
            messageId,
            url: currentUrl,
            title: currentTitle,
            status: decision.action === 'done' ? 'completed' : 'failed',
            steps,
            screenshotTimestamp: Date.now(),
            text: decision.text || (decision.action === 'done' ? 'Browser task completed successfully.' : 'Browser task failed.')
          });
        }

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
          try {
            await pageInstance.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          } catch (err) {
            if (targetUrl.startsWith('https://')) {
              const httpUrl = targetUrl.replace(/^https:\/\//i, 'http://');
              await pageInstance.goto(httpUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
              targetUrl = httpUrl;
            } else {
              throw err;
            }
          }
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
              await pageInstance.evaluate(({ sel }) => {
                const item = document.querySelector(sel);
                if (item) {
                  item.value = '';
                  item.focus();
                }
              }, { sel: selector });
              if (typeof el.fill === 'function') {
                await el.fill(text || '');
              } else {
                await el.type(text || '');
              }
              await pageInstance.evaluate(({ sel }) => {
                const item = document.querySelector(sel);
                if (item) {
                  item.dispatchEvent(new Event('input', { bubbles: true }));
                  item.dispatchEvent(new Event('change', { bubbles: true }));
                  item.blur();
                }
              }, { sel: selector });
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
          await sleep(200);
          currentStep.status = 'success';
          currentStep.logMessage = `Hovered cursor over element "${targetId}"${healedResult ? ` (healed to "${actualTargetId}")` : ''}`;
        } else if (action === 'back') {
          await pageInstance.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await sleep(200);
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

      try {
        currentUrl = pageInstance.url();
        currentTitle = await pageInstance.title();
      } catch (e) {}

      if (messageId) {
        broadcastLiveEvent('browser-agent-update', {
          sessionId,
          messageId,
          url: currentUrl,
          title: currentTitle,
          status: 'running',
          steps,
          screenshotTimestamp: Date.now()
        });
      }

      await sleep(1000);
    }

    throw new Error(`Execution timed out after ${maxLoops} cycles.`);
  } catch (err) {
    console.error(`[Browser Agent] Loop error:`, err);
    if (steps.length === 0 || steps[steps.length - 1].status !== 'error') {
      steps.push({
        id: `error-${Date.now()}`,
        thought: 'An error occurred during execution.',
        action: 'error',
        status: 'error',
        logMessage: err.message || 'Unknown error occurred',
        timestamp: new Date().toISOString()
      });
    }
    if (messageId) {
      broadcastLiveEvent('browser-agent-update', {
        sessionId,
        messageId,
        url: currentUrl,
        title: currentTitle,
        status: 'failed',
        steps,
        screenshotTimestamp: Date.now(),
        text: `Browser automation failed: ${err.message || 'Unknown error'}`
      });
    }
    return {
      success: false,
      text: `Browser automation failed: ${err.message || 'Unknown error'}`,
      steps,
      url: currentUrl,
      title: currentTitle
    };
  } finally {
    browserAgentStates.delete(sid);
    try {
      const s = sessions.get(sid);
      if (s && s.context) {
        if (sid.startsWith('run-')) {
          await s.context.close();
          sessions.delete(sid);
          console.log(`[Browser Server] Cleaned up completed scheduled run session: ${sid}`);
        } else {
          console.log(`[Browser Server] Persisting interactive session ${sid} for user inspection/takeover`);
        }
      }
    } catch (innerErr) {
      console.error(`Failed to close context for session ${sid}`, innerErr);
    }
  }
}

async function clearSessionStorage(sessionId) {
  const sid = sessionId || 'default';
  const session = sessions.get(sid);
  if (session) {
    try {
      if (session.context && typeof session.context.clearCookies === 'function') {
        await session.context.clearCookies();
      }
    } catch (e) {}
    if (session.page && !session.page.isClosed()) {
      try {
        await session.page.evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {}
        });
      } catch (e) {}
    }
    return true;
  }
  return false;
}

module.exports = {
  getBrowser,
  setBrowser,
  closeBrowser,
  sessions,
  activeBrowserAgents,
  ensureBrowser,
  ensureSession,
  setupPageListeners,
  updateScreenshotForSession,
  saveStepScreenshot,
  highlightElement,
  drawVisualTags,
  clearVisualTags,
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
};
