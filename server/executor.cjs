const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DATA_DIR } = require('./utils.cjs');

let pythonCommand = 'python';

function getPythonCommand() {
  return pythonCommand;
}

function setPythonCommand(cmd) {
  pythonCommand = cmd;
}

function detectPythonCommand() {
  exec('python --version', (error) => {
    if (error) {
      exec('python3 --version', (error3) => {
        if (!error3) {
          pythonCommand = 'python3';
          console.log('[System] Detected python3 as Python interpreter');
        } else {
          exec('py --version', (errorPy) => {
            if (!errorPy) {
              pythonCommand = 'py';
              console.log('[System] Detected py as Python interpreter');
            } else {
              console.log('[System] Neither python, python3, nor py detected in PATH. Python execution might fail.');
            }
          });
        }
      });
    } else {
      console.log('[System] Detected python as Python interpreter');
    }
  });
}

function getExecutionCapabilities() {
  return {
    node: true,
    python: Boolean(pythonCommand),
    pythonInterpreter: pythonCommand,
    maxTimeoutMs: 10000,
    supportedLanguages: ['javascript', 'js', 'python', 'py']
  };
}

const dangerousPatterns = [
  /rm[^a-zA-Z0-9]+-rf/i,
  /rmdir[^a-zA-Z0-9]+\/s/i,
  /rd[^a-zA-Z0-9]+\/s/i,
  /del[^a-zA-Z0-9]+\/f[^a-zA-Z0-9]+\/s/i,
  /format\s+[c-z]:/i,
  /mkfs/i,
  /shutdown\s+(-[h|r|s]|[\/\-]s|[\/\-]r)/i,
  /:(\s*)\{(\s*):\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /powershell(\.exe)?\s+[\/\-](e|enc|encodedcommand|c|command)/i,
  /cmd(\.exe)?\s+[\/\-]c/i,
  /(curl|wget)\s+.*\|\s*(sh|bash|powershell|cmd)/i,
  /dd\s+if=/i,
  /shutil\.rmtree/i,
  /os\.system\s*\(\s*['"]\s*(rm|del|rd|format)/i,
  /subprocess\.(call|Popen|run)\s*\([^)]*shell\s*=\s*True/i,
  /base64\s+-d\s*\|\s*(sh|bash)/i
];

function sanitizeEnv() {
  const safeEnv = { ...process.env };
  // Redact API keys, tokens, and secrets from execution sandbox child process environment
  for (const key of Object.keys(safeEnv)) {
    if (/(api_key|token|secret|password|private_key|auth)/i.test(key)) {
      delete safeEnv[key];
    }
  }
  return safeEnv;
}

function formatStdoutTable(stdout) {
  if (!stdout) return null;
  const trimmed = stdout.trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      if (items.length > 0 && typeof items[0] === 'object' && items[0] !== null) {
        const keys = Object.keys(items[0]);
        if (keys.length > 0 && keys.length <= 15) {
          const header = `| ${keys.join(' | ')} |`;
          const separator = `| ${keys.map(() => '---').join(' | ')} |`;
          const rows = items.map(item => `| ${keys.map(k => String(item[k] ?? '')).join(' | ')} |`);
          return [header, separator, ...rows].join('\n');
        }
      }
    } catch (e) {}
  }
  return null;
}

function executeCode(language, code, callback) {
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return callback(null, {
        duration: 0,
        logs: [
          { type: 'error', text: 'Safety Block: Code execution was blocked because it contains potentially destructive commands (e.g. file deletion or partitioning).' }
        ]
      });
    }
  }

  const tempDir = path.join(os.tmpdir(), 'context-exec');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let fileExt = 'js';
  if (language === 'python' || language === 'py') {
    fileExt = 'py';
  } else if (code.includes('import ') || code.includes('import(') || code.includes('export ')) {
    fileExt = 'mjs';
  }
  const tempFile = path.join(tempDir, `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`);

  fs.writeFileSync(tempFile, code);

  const start = performance.now();
  let cmd = '';
  if (language === 'python' || language === 'py') {
    cmd = `${pythonCommand} "${tempFile}"`;
  } else {
    cmd = `node "${tempFile}"`;
  }

  const MAX_LOG_LENGTH = 500000;

  exec(cmd, { timeout: 10000, cwd: DATA_DIR, env: sanitizeEnv() }, (error, stdout, stderr) => {
    const end = performance.now();
    
    // Clean up temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (e) {
      console.error('Failed to delete temp file', e);
    }

    const duration = end - start;
    const logs = [];
    const formattedTable = formatStdoutTable(stdout);

    if (stdout) {
      let trimmedStdout = stdout.trim();
      if (trimmedStdout.length > MAX_LOG_LENGTH) {
        trimmedStdout = trimmedStdout.slice(0, MAX_LOG_LENGTH) + '\n... [Output truncated due to size limit]';
      }
      logs.push({ type: 'log', text: trimmedStdout });
    }
    if (stderr) {
      let trimmedStderr = stderr.trim();
      if (trimmedStderr.length > MAX_LOG_LENGTH) {
        trimmedStderr = trimmedStderr.slice(0, MAX_LOG_LENGTH) + '\n... [Stderr truncated due to size limit]';
      }
      logs.push({ type: 'error', text: trimmedStderr });
    }

    if (error) {
      if (error.killed) {
        logs.push({ type: 'error', text: 'Execution Timeout: Script took longer than 10000ms.' });
      } else if (!stderr) {
        logs.push({ type: 'error', text: error.message || 'Execution error.' });
      }
    }

    callback(null, { duration, logs, formattedTable });
  });
}

module.exports = {
  getPythonCommand,
  setPythonCommand,
  detectPythonCommand,
  getExecutionCapabilities,
  executeCode,
  formatStdoutTable
};


