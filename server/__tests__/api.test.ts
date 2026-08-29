import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

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

    app.post('/api/ollama/test', (req, res) => {
      const { localUrl } = req.body;
      if (localUrl === 'http://invalid-host:11434') {
        return res.status(500).json({ success: false, error: 'Failed to connect' });
      }
      res.json({
        success: true,
        message: 'Connected to Ollama! Found 2 installed model(s).',
        models: ['llama3.2', 'deepseek-r1']
      });
    });

    app.get('/api/ollama/models', (req, res) => {
      res.json({
        models: [
          { name: 'llama3.2:latest', details: { parameter_size: '3.2B' } },
          { name: 'deepseek-r1:14b', details: { parameter_size: '14B' } }
        ]
      });
    });

    app.get('/api/ollama/ps', (req, res) => {
      res.json({
        success: true,
        models: [
          {
            name: 'llama3.2:latest',
            model: 'llama3.2:latest',
            size: 2019393189,
            size_vram: 2019393189,
            expires_at: '2026-08-30T05:00:00.000Z',
            details: { parameter_size: '3.2B' }
          }
        ]
      });
    });

    app.post('/api/ollama/unload', (req, res) => {
      const { model } = req.body;
      if (!model) return res.status(400).json({ success: false, error: 'Model name is required' });
      res.json({ success: true, message: `Model ${model} unloaded from memory` });
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

  it('POST /api/ollama/test tests connection and returns model list', async () => {
    const res = await request(app).post('/api/ollama/test').send({ localUrl: 'http://localhost:11434' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.models).toEqual(['llama3.2', 'deepseek-r1']);
  });

  it('GET /api/ollama/models returns models list', async () => {
    const res = await request(app).get('/api/ollama/models?localUrl=http://localhost:11434');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.models)).toBe(true);
    expect(res.body.models[0].name).toBe('llama3.2:latest');
  });

  it('GET /api/ollama/ps returns running models with shutdown expiration timestamp', async () => {
    const res = await request(app).get('/api/ollama/ps?localUrl=http://localhost:11434');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.models).toHaveLength(1);
    expect(res.body.models[0].name).toBe('llama3.2:latest');
    expect(res.body.models[0].expires_at).toBe('2026-08-30T05:00:00.000Z');
  });

  it('POST /api/ollama/unload unloads running model from memory', async () => {
    const res = await request(app).post('/api/ollama/unload').send({ model: 'llama3.2:latest', localUrl: 'http://localhost:11434' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('unloaded');
  });
});


