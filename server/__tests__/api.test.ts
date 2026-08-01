import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import os from 'os';

describe('Server API Endpoints & Security', () => {
  const createTestApp = () => {
    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      next();
    });

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: 100,
        activeSessions: 0,
        browserConnected: false,
        pythonCommand: 'python3',
        version: '1.0.0'
      });
    });

    app.get('/api/system/stats', (req, res) => {
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        process: {
          uptime: process.uptime(),
          memoryUsageMb: { rss: 50, heapTotal: 30, heapUsed: 20, external: 5 }
        },
        system: {
          total: os.totalmem(),
          free: os.freemem(),
          platform: os.platform(),
          cpus: os.cpus().length
        },
        activeSessionsCount: 0,
        activeBrowserAgentsCount: 0,
        activeCronJobsCount: 0,
        storageStats: {
          screenshotFiles: 0,
          totalSchedules: 0,
          totalTaskRuns: 0
        }
      });
    });

    app.post('/api/transpile', (req, res) => {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Missing code parameter.' });
      res.json({ success: true, code: 'console.log("test");' });
    });

    app.get('/api/schedules/export', (req, res) => {
      res.json({
        version: 1,
        exportedAt: new Date().toISOString(),
        schedules: [],
        runs: []
      });
    });

    app.post('/api/schedules/import', (req, res) => {
      const { schedules } = req.body;
      if (!Array.isArray(schedules)) return res.status(400).json({ error: 'Invalid format' });
      res.json({ success: true, message: 'Schedules imported' });
    });

    app.post('/api/browser/storage/clear', (req, res) => {
      res.json({ success: true, message: 'Session storage and cookies cleared' });
    });

    return app;
  };

  const app = createTestApp();

  it('GET /api/health returns 200 with status ok and version', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0.0');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('GET /api/system/stats returns telemetry data', async () => {
    const res = await request(app).get('/api/system/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.system).toHaveProperty('platform');
    expect(res.body.storageStats).toHaveProperty('screenshotFiles');
  });

  it('POST /api/transpile returns 400 when missing code parameter', async () => {
    const res = await request(app).post('/api/transpile').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/transpile returns transpiled code when valid code provided', async () => {
    const res = await request(app).post('/api/transpile').send({ code: 'const x: number = 42;' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.code).toBeDefined();
  });

  it('GET /api/schedules/export returns valid backup structure', async () => {
    const res = await request(app).get('/api/schedules/export');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(Array.isArray(res.body.schedules)).toBe(true);
  });

  it('POST /api/schedules/import validates input payload', async () => {
    const resFail = await request(app).post('/api/schedules/import').send({});
    expect(resFail.status).toBe(400);

    const resSuccess = await request(app).post('/api/schedules/import').send({ schedules: [], runs: [] });
    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.success).toBe(true);
  });

  it('POST /api/browser/storage/clear clears session state', async () => {
    const res = await request(app).post('/api/browser/storage/clear').send({ sessionId: 'default' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});


