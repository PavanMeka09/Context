const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const { getPythonCommand } = require('./executor.cjs');

const router = express.Router();
const SERVICE_SCRIPT = path.join(__dirname, 'crawl4ai_service.py');
const DAEMON_URL = process.env.CRAWLER_DAEMON_URL || 'http://127.0.0.1:8083';

/**
 * Execute crawl via persistent FastAPI daemon with fallback to subprocess
 */
async function executeCrawl(url, options = {}) {
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      error: 'Invalid URL provided',
      stats: { raw_bytes: 0, markdown_bytes: 0, tokens_saved_pct: 0, status_code: 400 }
    };
  }

  // Validate URL protocol
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        success: false,
        error: 'Only HTTP and HTTPS URLs are supported',
        stats: { raw_bytes: 0, markdown_bytes: 0, tokens_saved_pct: 0, status_code: 400 }
      };
    }
  } catch (e) {
    return {
      success: false,
      error: 'Malformed URL structure',
      stats: { raw_bytes: 0, markdown_bytes: 0, tokens_saved_pct: 0, status_code: 400 }
    };
  }

  // 1. Attempt ultra-fast persistent FastAPI daemon
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${DAEMON_URL}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        extractCss: options.extractCss,
        bypassCache: options.bypassCache !== false,
        wordLimit: options.wordLimit
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (e) {
    // Daemon offline or unreachable; fall back to subprocess gracefully
  }

  // 2. Subprocess Fallback
  return new Promise((resolve) => {
    const pyCmd = getPythonCommand() || 'py';
    const args = [SERVICE_SCRIPT, '--url', url];

    if (options.extractCss) {
      args.push('--extract-css', options.extractCss);
    }
    if (options.bypassCache !== false) {
      args.push('--bypass-cache');
    }

    execFile(pyCmd, args, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        return resolve({
          success: false,
          engine: 'error',
          url,
          error: error.message || 'Crawl process execution timed out or failed',
          markdown: '',
          stats: { raw_bytes: 0, markdown_bytes: 0, tokens_saved_pct: 0, status_code: 500 }
        });
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (parseError) {
        resolve({
          success: false,
          engine: 'raw',
          url,
          markdown: stdout || '',
          error: stderr || 'Failed to parse JSON response from crawler service',
          stats: { raw_bytes: (stdout || '').length, markdown_bytes: (stdout || '').length, tokens_saved_pct: 0, status_code: 500 }
        });
      }
    });
  });
}

/**
 * Check Python Crawl4AI installation status
 */
async function getCrawlStatus() {
  // 1. Try persistent daemon first (< 2ms response)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`${DAEMON_URL}/status`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return { ...data, python_command: getPythonCommand() || 'python' };
    }
  } catch (e) {
    // Daemon offline, fallback
  }

  // 2. Subprocess check fallback
  return new Promise((resolve) => {
    const pyCmd = getPythonCommand() || 'py';
    execFile(pyCmd, [SERVICE_SCRIPT, '--status'], { timeout: 5000 }, (error, stdout) => {
      if (error || !stdout) {
        return resolve({
          crawl4ai_installed: false,
          playwright_installed: false,
          mode: 'offline',
          python_command: pyCmd
        });
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({ ...parsed, python_command: pyCmd });
      } catch (e) {
        resolve({
          crawl4ai_installed: false,
          playwright_installed: false,
          mode: 'error',
          python_command: pyCmd
        });
      }
    });
  });
}

// Router Endpoints
router.get('/status', async (req, res) => {
  const status = await getCrawlStatus();
  res.json(status);
});

router.post('/', async (req, res) => {
  const { url, extractCss, bypassCache } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const result = await executeCrawl(url, { extractCss, bypassCache });
  res.json(result);
});

router.post('/extract', async (req, res) => {
  const { url, schema, cssSelector } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const extractTarget = schema ? JSON.stringify(schema) : cssSelector;
  const result = await executeCrawl(url, { extractCss: extractTarget });
  res.json(result);
});

module.exports = {
  router,
  executeCrawl,
  getCrawlStatus
};
