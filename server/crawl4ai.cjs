const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const { getPythonCommand } = require('./executor.cjs');

const router = express.Router();
const SERVICE_SCRIPT = path.join(__dirname, 'crawl4ai_service.py');
const DAEMON_URL = process.env.CRAWLER_DAEMON_URL || 'http://127.0.0.1:8083';

/**
 * Standardized error result builder to eliminate duplicated fallback structures
 */
function createCrawlErrorResult(url, errorMsg, statusCode = 400, engine = 'error', rawText = '') {
  return {
    success: false,
    engine,
    url: url || '',
    error: errorMsg,
    markdown: rawText,
    stats: {
      raw_bytes: rawText ? rawText.length : 0,
      markdown_bytes: rawText ? rawText.length : 0,
      tokens_saved_pct: 0,
      status_code: statusCode
    }
  };
}

/**
 * Execute crawl via persistent FastAPI daemon with fallback to subprocess
 */
async function executeCrawl(url, options = {}) {
  if (!url || typeof url !== 'string') {
    return createCrawlErrorResult(url, 'Invalid URL provided', 400);
  }

  // Validate URL protocol
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return createCrawlErrorResult(url, 'Only HTTP and HTTPS URLs are supported', 400);
    }
  } catch {
    return createCrawlErrorResult(url, 'Malformed URL structure', 400);
  }

  const cssSelector = options.cssSelector || options.extractCss || null;
  const schema = options.schema || null;

  // 1. Attempt ultra-fast persistent FastAPI daemon
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const isExtractEndpoint = Boolean(schema || (cssSelector && options.isExtract));
    const endpointUrl = isExtractEndpoint ? `${DAEMON_URL}/extract` : `${DAEMON_URL}/crawl`;
    const requestBody = isExtractEndpoint
      ? { url, cssSelector, schema }
      : {
          url,
          extractCss: cssSelector,
          schema,
          bypassCache: options.bypassCache !== false,
          wordLimit: options.wordLimit
        };

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch {
    // Daemon offline or unreachable; fall back to subprocess gracefully
  }

  // 2. Subprocess Fallback
  return new Promise((resolve) => {
    const pyCmd = getPythonCommand() || 'py';
    const args = [SERVICE_SCRIPT, '--url', url];

    if (cssSelector) {
      args.push('--extract-css', cssSelector);
    }
    if (schema) {
      const schemaStr = typeof schema === 'string' ? schema : JSON.stringify(schema);
      args.push('--schema', schemaStr);
    }
    if (options.bypassCache !== false) {
      args.push('--bypass-cache');
    }
    if (options.wordLimit && Number.isInteger(Number(options.wordLimit))) {
      args.push('--word-limit', String(options.wordLimit));
    }

    execFile(pyCmd, args, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        return resolve(
          createCrawlErrorResult(
            url,
            error.message || 'Crawl process execution timed out or failed',
            500,
            'error'
          )
        );
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        resolve(
          createCrawlErrorResult(
            url,
            stderr || 'Failed to parse JSON response from crawler service',
            500,
            'raw',
            stdout || ''
          )
        );
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
  } catch {
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
      } catch {
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

/**
 * Tool definition for ReAct agent function calling loops
 */
function getCrawl4AIToolDefinition() {
  return {
    name: 'crawl_web_page',
    description: 'Crawl a webpage using Crawl4AI to obtain clean Markdown, page metadata, links, and structured extractions.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The absolute target web URL to crawl' },
        extractCss: { type: 'string', description: 'Optional CSS selector for targeted element extraction' },
        schema: { type: 'object', description: 'Optional JSON schema definition for structured data extraction' }
      },
      required: ['url']
    }
  };
}

async function crawlWebPage(url, options = {}) {
  return await executeCrawl(url, options);
}

// Router Endpoints
router.get('/status', async (req, res) => {
  const status = await getCrawlStatus();
  res.json(status);
});

router.post('/', async (req, res) => {
  const { url, extractCss, cssSelector, schema, bypassCache } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const result = await executeCrawl(url, { extractCss: cssSelector || extractCss, schema, bypassCache });
  res.json(result);
});

router.post('/extract', async (req, res) => {
  const { url, schema, cssSelector, extractCss, bypassCache } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const result = await executeCrawl(url, {
    schema,
    cssSelector: cssSelector || extractCss,
    bypassCache,
    isExtract: true
  });
  res.json(result);
});

module.exports = {
  router,
  executeCrawl,
  getCrawlStatus,
  getCrawl4AIToolDefinition,
  crawlWebPage,
  createCrawlErrorResult
};
