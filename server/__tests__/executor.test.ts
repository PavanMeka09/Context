import { describe, it, expect } from 'vitest';
import { executeCode, getPythonCommand, setPythonCommand, getExecutionCapabilities, formatStdoutTable } from '../executor.cjs';

describe('server/executor.cjs', () => {
  it('should return execution capabilities correctly', () => {
    const caps = getExecutionCapabilities();
    expect(caps.node).toBe(true);
    expect(caps.maxTimeoutMs).toBe(10000);
    expect(caps.supportedLanguages).toContain('javascript');
    expect(caps.supportedLanguages).toContain('python');
  });

  it('should block dangerous destructive commands', () => {
    return new Promise<void>((resolve) => {
      executeCode('js', 'rm -rf /', (err, result) => {
        expect(err).toBeNull();
        expect(result.logs[0].type).toBe('error');
        expect(result.logs[0].text).toContain('Safety Block');
        
        executeCode('python', 'import shutil\nshutil.rmtree("/")', (err2, result2) => {
          expect(err2).toBeNull();
          expect(result2.logs[0].type).toBe('error');
          expect(result2.logs[0].text).toContain('Safety Block');
          resolve();
        });
      });
    });
  });

  it('should block PowerShell/CMD command execution patterns', () => {
    return new Promise<void>((resolve) => {
      executeCode('js', 'powershell -Command "Get-Process"', (err, result) => {
        expect(err).toBeNull();
        expect(result.logs[0].type).toBe('error');
        expect(result.logs[0].text).toContain('Safety Block');
        
        executeCode('js', 'cmd.exe /c dir', (err2, result2) => {
          expect(err2).toBeNull();
          expect(result2.logs[0].type).toBe('error');
          expect(result2.logs[0].text).toContain('Safety Block');
          resolve();
        });
      });
    });
  });

  it('should execute JavaScript code successfully', () => {
    return new Promise<void>((resolve) => {
      executeCode('js', 'console.log("Hello Vitest!");', (err, result) => {
        expect(err).toBeNull();
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.logs.some((l: { text: string }) => l.text.includes('Hello Vitest!'))).toBe(true);
        resolve();
      });
    });
  });

  it('should capture runtime execution errors cleanly', () => {
    return new Promise<void>((resolve) => {
      executeCode('js', 'throw new Error("Test Execution Failure")', (err, result) => {
        expect(err).toBeNull();
        expect(result.logs.some((l: { type: string; text: string }) => l.type === 'error' && l.text.includes('Test Execution Failure'))).toBe(true);
        resolve();
      });
    });
  });

  it('should allow setting and getting python command interpreter', () => {
    const original = getPythonCommand();
    setPythonCommand('python3');
    expect(getPythonCommand()).toBe('python3');
    setPythonCommand(original);
  });

  it('should format JSON array stdout into Markdown table', () => {
    const jsonOutput = JSON.stringify([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
    const table = formatStdoutTable(jsonOutput);
    expect(table).toContain('| id | name |');
    expect(table).toContain('| 1 | Alice |');
    expect(table).toContain('| 2 | Bob |');
  });
});




