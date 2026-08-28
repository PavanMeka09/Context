import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { router as crawlRouter, executeCrawl, getCrawlStatus } from '../crawl4ai.cjs';

describe('Crawl4AI Module & API Endpoints', () => {
  const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/crawl', crawlRouter);
    return app;
  };

  const app = createTestApp();

  it('getCrawlStatus returns status object with engine mode', async () => {
    const status = await getCrawlStatus();
    expect(status).toHaveProperty('crawl4ai_installed');
    expect(status).toHaveProperty('playwright_installed');
    expect(status).toHaveProperty('mode');
    expect(typeof status.mode).toBe('string');
  });

  it('GET /api/crawl/status returns 200 with environment status', async () => {
    const res = await request(app).get('/api/crawl/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mode');
  });

  it('executeCrawl returns error for invalid or non-http URLs', async () => {
    const result = await executeCrawl('ftp://invalid-protocol.com');
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP');
  });

  it('executeCrawl returns error for malformed URLs', async () => {
    const result = await executeCrawl('not-a-valid-url');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('POST /api/crawl without url parameter returns 400', async () => {
    const res = await request(app).post('/api/crawl').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL parameter is required');
  });

  it('POST /api/crawl/extract without url parameter returns 400', async () => {
    const res = await request(app).post('/api/crawl/extract').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL parameter is required');
  });

  it('executeCrawl crawls a valid http endpoint and produces structured output', async () => {
    const result = await executeCrawl('https://example.com');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('markdown');
    expect(result).toHaveProperty('stats');
    if (result.success) {
      expect(result.stats).toHaveProperty('tokens_saved_pct');
      expect(typeof result.stats.tokens_saved_pct).toBe('number');
    }
  }, 15000);
});
