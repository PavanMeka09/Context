const path = require('path');
const os = require('os');
const fs = require('fs');
const { db, scheduleDao, runDao, settingsDao } = require('./db.cjs');

const DATA_DIR = path.join(os.homedir(), '.context-ai');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PATHS = {
  schedules: path.join(DATA_DIR, 'schedules.json'),
  runs: path.join(DATA_DIR, 'runs.json'),
  syncQueue: path.join(DATA_DIR, 'sync_queue.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  db: path.join(DATA_DIR, 'context.db')
};

const sseClients = new Set();

function broadcastLiveEvent(type, data) {
  const eventString = `data: ${JSON.stringify({ type, data })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(eventString);
    } catch (e) {
      console.error('[SSE] Failed to write to client, removing client.', e);
      sseClients.delete(client);
    }
  }
}

const DAO_HANDLERS = {
  [PATHS.schedules]: {
    read: () => scheduleDao.getAll(),
    write: (data) => scheduleDao.saveAll(data)
  },
  [PATHS.runs]: {
    read: () => runDao.getAll(),
    write: (data) => runDao.saveAll(data)
  },
  [PATHS.settings]: {
    read: () => settingsDao.get('global_settings'),
    write: (data) => settingsDao.set('global_settings', data)
  }
};

function readJSON(file, defaultVal = []) {
  try {
    if (db && DAO_HANDLERS[file]) {
      const val = DAO_HANDLERS[file].read();
      if (val !== null && val !== undefined) return val;
    }

    // Fallback to disk read / cache
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`Error reading database file: ${file}`, e);
  }
  return defaultVal;
}

function writeJSON(file, data) {
  try {
    // 1. Instant SQLite WAL persistence via DAO handlers
    if (db && DAO_HANDLERS[file]) {
      DAO_HANDLERS[file].write(data);
    }

    // 2. File sync backup
    const tempFile = file + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, file);
  } catch (e) {
    console.error(`Error writing database file: ${file}`, e);
  }
}

function safeJsonParse(text) {
  if (!text) throw new Error('Empty response');
  let cleaned = text.trim();
  if (!cleaned) throw new Error('Empty response');

  // Strip markdown code block markers
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/, '');
  cleaned = cleaned.trim();
  if (!cleaned) throw new Error('Empty response');

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (innerErr) {
        let dynamicJson = candidate
          .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
          .replace(/,\s*([\]}])/g, '$1');
        
        try {
          return JSON.parse(dynamicJson);
        } catch (deepErr) {
          throw new Error(`Failed to parse LLM JSON: ${e.message}. Dynamic cleanup failed: ${deepErr.message}. Raw text: ${text}`);
        }
      }
    }
    throw e;
  }
}

module.exports = {
  DATA_DIR,
  PATHS,
  sseClients,
  broadcastLiveEvent,
  readJSON,
  writeJSON,
  safeJsonParse,
  db,
  scheduleDao,
  runDao,
  settingsDao
};
