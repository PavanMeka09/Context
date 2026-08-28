/**
 * Ultra-Fast Embedded SQLite Database Engine with WAL Mode for Context AI
 * Uses Node.js 22/24 native `node:sqlite` with automatic fallback and JSON migration.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const DATA_DIR = path.join(os.homedir(), '.context-ai');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'context.db');

let db = null;

try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);
  
  // Enable high-performance SQLite WAL mode & optimizations
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA cache_size = -64000;'); // 64MB cache
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (err) {
  console.warn('[DB Engine] node:sqlite initialization error:', err.message);
}

// Initialize Tables
function initSchema() {
  if (!db) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron TEXT,
      targetUrl TEXT,
      prompt TEXT,
      enabled INTEGER DEFAULT 1,
      lastRun TEXT,
      lastStatus TEXT,
      nextRun TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      scheduleId TEXT,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      duration REAL DEFAULT 0,
      output TEXT,
      tokens INTEGER DEFAULT 0,
      model TEXT,
      error TEXT,
      steps TEXT,
      summary TEXT,
      FOREIGN KEY (scheduleId) REFERENCES schedules(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_runs_scheduleId ON runs(scheduleId);
    CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      chatId TEXT,
      event TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      activeLeafId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      isPinned INTEGER DEFAULT 0,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      parentId TEXT,
      timestamp TEXT NOT NULL,
      attachments TEXT,
      browserSession TEXT,
      FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId);
  `);
}

// Automatic JSON-to-SQLite Migration on First Boot
function migrateFromLegacyJSON() {
  if (!db) return;

  const schedulesPath = path.join(DATA_DIR, 'schedules.json');
  const runsPath = path.join(DATA_DIR, 'runs.json');
  const syncQueuePath = path.join(DATA_DIR, 'sync_queue.json');
  const settingsPath = path.join(DATA_DIR, 'settings.json');

  // Check if DB is empty
  const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM schedules').get().count;

  if (scheduleCount === 0 && fs.existsSync(schedulesPath)) {
    try {
      const schedules = JSON.parse(fs.readFileSync(schedulesPath, 'utf8'));
      if (Array.isArray(schedules) && schedules.length > 0) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO schedules (id, name, cron, targetUrl, prompt, enabled, lastRun, lastStatus, nextRun, createdAt, updatedAt, config)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of schedules) {
          stmt.run(
            s.id,
            s.name || 'Untitled Schedule',
            s.cron || '',
            s.targetUrl || '',
            s.prompt || '',
            s.enabled ? 1 : 0,
            s.lastRun || null,
            s.lastStatus || null,
            s.nextRun || null,
            s.createdAt || new Date().toISOString(),
            s.updatedAt || new Date().toISOString(),
            JSON.stringify(s)
          );
        }
        console.log(`[DB Migration] Migrated ${schedules.length} schedules from JSON to SQLite.`);
      }
    } catch (e) {
      console.error('[DB Migration] Error migrating schedules:', e);
    }
  }

  const runCount = db.prepare('SELECT COUNT(*) as count FROM runs').get().count;
  if (runCount === 0 && fs.existsSync(runsPath)) {
    try {
      const runs = JSON.parse(fs.readFileSync(runsPath, 'utf8'));
      if (Array.isArray(runs) && runs.length > 0) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO runs (id, scheduleId, timestamp, status, duration, output, tokens, model, error, steps, summary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of runs) {
          stmt.run(
            r.id,
            r.scheduleId || null,
            r.timestamp || new Date().toISOString(),
            r.status || 'completed',
            r.duration || 0,
            r.output || '',
            r.tokens || 0,
            r.model || '',
            r.error || null,
            r.steps ? JSON.stringify(r.steps) : null,
            r.summary || ''
          );
        }
        console.log(`[DB Migration] Migrated ${runs.length} runs from JSON to SQLite.`);
      }
    } catch (e) {
      console.error('[DB Migration] Error migrating runs:', e);
    }
  }
}

// Initialise DB
if (db) {
  initSchema();
  migrateFromLegacyJSON();
}

// Schedule Operations
const scheduleDao = {
  getAll() {
    if (!db) return [];
    const rows = db.prepare('SELECT * FROM schedules ORDER BY createdAt DESC').all();
    return rows.map(r => {
      let config = {};
      try { config = JSON.parse(r.config || '{}'); } catch (_) {}
      return {
        ...config,
        id: r.id,
        name: r.name,
        cron: r.cron,
        targetUrl: r.targetUrl,
        prompt: r.prompt,
        enabled: Boolean(r.enabled),
        lastRun: r.lastRun,
        lastStatus: r.lastStatus,
        nextRun: r.nextRun,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      };
    });
  },

  getById(id) {
    if (!db) return null;
    const r = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    if (!r) return null;
    let config = {};
    try { config = JSON.parse(r.config || '{}'); } catch (_) {}
    return {
      ...config,
      id: r.id,
      name: r.name,
      cron: r.cron,
      targetUrl: r.targetUrl,
      prompt: r.prompt,
      enabled: Boolean(r.enabled),
      lastRun: r.lastRun,
      lastStatus: r.lastStatus,
      nextRun: r.nextRun,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  },

  save(schedule) {
    if (!db) return schedule;
    const existing = this.getById(schedule.id);
    const now = new Date().toISOString();
    const configStr = JSON.stringify(schedule);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO schedules (id, name, cron, targetUrl, prompt, enabled, lastRun, lastStatus, nextRun, createdAt, updatedAt, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      schedule.id,
      schedule.name || 'Untitled Schedule',
      schedule.cron || '',
      schedule.targetUrl || '',
      schedule.prompt || '',
      schedule.enabled ? 1 : 0,
      schedule.lastRun || null,
      schedule.lastStatus || null,
      schedule.nextRun || null,
      existing?.createdAt || schedule.createdAt || now,
      now,
      configStr
    );
    return schedule;
  },

  delete(id) {
    if (!db) return false;
    db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return true;
  },

  clearAll() {
    if (!db) return;
    db.exec('DELETE FROM runs; DELETE FROM schedules;');
  }
};

// Run Operations
const runDao = {
  getAll(limit = 1000) {
    if (!db) return [];
    const rows = db.prepare('SELECT * FROM runs ORDER BY timestamp DESC LIMIT ?').all(limit);
    return rows.map(r => {
      let steps = [];
      try { steps = JSON.parse(r.steps || '[]'); } catch (_) {}
      return {
        id: r.id,
        scheduleId: r.scheduleId,
        timestamp: r.timestamp,
        status: r.status,
        duration: r.duration,
        output: r.output,
        tokens: r.tokens,
        model: r.model,
        error: r.error,
        steps,
        summary: r.summary
      };
    });
  },

  save(run) {
    if (!db) return run;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO runs (id, scheduleId, timestamp, status, duration, output, tokens, model, error, steps, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      run.id,
      run.scheduleId || null,
      run.timestamp || new Date().toISOString(),
      run.status || 'completed',
      run.duration || 0,
      run.output || '',
      run.tokens || 0,
      run.model || '',
      run.error || null,
      run.steps ? JSON.stringify(run.steps) : null,
      run.summary || ''
    );
    return run;
  },

  clearAll() {
    if (!db) return;
    db.exec('DELETE FROM runs;');
  }
};

// Settings Operations
const settingsDao = {
  get(key, defaultValue = null) {
    if (!db) return defaultValue;
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value);
    } catch (_) {
      return row.value;
    }
  },

  set(key, value) {
    if (!db) return;
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updatedAt)
      VALUES (?, ?, ?)
    `).run(key, valStr, new Date().toISOString());
  }
};

module.exports = {
  db,
  scheduleDao,
  runDao,
  settingsDao,
  DATA_DIR,
  DB_PATH
};
