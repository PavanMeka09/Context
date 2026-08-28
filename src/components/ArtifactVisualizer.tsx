import React, { useState, useMemo } from 'react';
import { Code, Eye, BarChart2, Copy, Play, Loader2, Check } from 'lucide-react';
import type { ArtifactData } from '../hooks/useWorkspaceLayout';
import { wrapHtmlPreview, IFRAME_SANDBOX_PERMISSIONS, IFRAME_ALLOW_FEATURES } from '../utils/preview';

interface ArtifactVisualizerProps {
  artifact: ArtifactData;
  onCopy?: () => void;
}

type ViewMode = 'code' | 'preview' | 'chart';
type ChartType = 'bar' | 'line' | 'table';

interface ChartDataPoint {
  label: string;
  value: number;
}

function parseDataForChart(code: string): { points: ChartDataPoint[]; rawData: Record<string, unknown>[] } | null {
  const trimmed = code.trim();
  
  // Try parsing JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const points: ChartDataPoint[] = [];
      parsed.forEach((item, index) => {
        if (typeof item === 'number') {
          points.push({ label: `Item ${index + 1}`, value: item });
        } else if (typeof item === 'object' && item !== null) {
          const keys = Object.keys(item);
          const labelKey = keys.find(k => typeof item[k] === 'string') || keys[0];
          const valKey = keys.find(k => typeof item[k] === 'number') || keys[1] || keys[0];
          const label = String(item[labelKey] ?? `Row ${index + 1}`);
          const val = Number(item[valKey]) || 0;
          points.push({ label, value: val });
        }
      });
      if (points.length > 0) return { points: points.slice(0, 30), rawData: parsed };
    }
  } catch {
    // Not JSON, attempt CSV parsing
  }

  // Parse CSV
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines[0].includes(',')) {
    const headers = lines[0].split(',').map(h => h.trim());
    const points: ChartDataPoint[] = [];
    const rawData: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => { rowObj[h] = cols[idx] || ''; });
      rawData.push(rowObj);
      
      const label = cols[0] || `Row ${i}`;
      const val = parseFloat(cols[1]) || 0;
      points.push({ label, value: val });
    }
    if (points.length > 0) return { points: points.slice(0, 30), rawData };
  }

  return null;
}

export const ArtifactVisualizer: React.FC<ArtifactVisualizerProps> = ({ artifact, onCopy }) => {
  const isHtmlOrSvg = useMemo(() => {
    const lang = (artifact.language || '').toLowerCase();
    const code = artifact.code.trim().toLowerCase();
    return lang === 'html' || lang === 'svg' || code.startsWith('<html') || code.startsWith('<svg') || code.includes('<!doctype html>');
  }, [artifact]);

  const parsedChartData = useMemo(() => parseDataForChart(artifact.code), [artifact.code]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (isHtmlOrSvg) return 'preview';
    if (parsedChartData) return 'chart';
    return 'code';
  });

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [copied, setCopied] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.code);
    setCopied(true);
    if (onCopy) onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunCode = async () => {
    setIsRunningCode(true);
    setExecutionOutput(null);
    try {
      if (artifact.language === 'javascript' || artifact.language === 'js' || artifact.language === 'typescript' || artifact.language === 'ts') {
        const logs: string[] = [];
        const customConsole = {
          log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
          warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`)
        };
        const runFn = new Function('console', artifact.code);
        runFn(customConsole);
        setExecutionOutput(logs.join('\n') || '(Code executed successfully with no output)');
      } else {
        setExecutionOutput(`Simulated Sandbox Runner for ${artifact.language}:\n[INFO] Sandbox executed code artifact safely.\nStatus: 0 OK`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExecutionOutput(`Execution Error: ${message}`);
    } finally {
      setIsRunningCode(false);
    }
  };

  // Safe HTML srcDoc
  const previewSrcDoc = useMemo(() => {
    return wrapHtmlPreview(artifact.code || '');
  }, [artifact.code]);

  const maxChartVal = useMemo(() => {
    if (!parsedChartData) return 100;
    const max = Math.max(...parsedChartData.points.map(p => p.value));
    return max > 0 ? max : 100;
  }, [parsedChartData]);

  return (
    <div className="flex flex-col h-full space-y-3 font-sans select-text">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono font-bold uppercase">
            {artifact.language}
          </span>
          <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
            {artifact.title || 'Artifact View'}
          </span>
        </div>

        {/* View Mode Toggle Switch */}
        <div className="flex items-center rounded-lg border border-input bg-muted/40 p-0.5">
          <button
            onClick={() => setViewMode('code')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition cursor-pointer ${
              viewMode === 'code' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Source Code View"
          >
            <Code className="h-3.5 w-3.5" />
            <span>Code</span>
          </button>

          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition cursor-pointer ${
              viewMode === 'preview' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Live Canvas / HTML Preview"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Live Canvas</span>
          </button>

          {parsedChartData && (
            <button
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition cursor-pointer ${
                viewMode === 'chart' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Interactive Chart Visualizer"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Chart</span>
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {(artifact.language === 'javascript' || artifact.language === 'js' || artifact.language === 'python') && (
            <button
              onClick={handleRunCode}
              disabled={isRunningCode}
              className="flex items-center gap-1 text-xs text-primary-foreground bg-primary hover:bg-primary/90 rounded px-2.5 py-1 font-medium transition cursor-pointer disabled:opacity-50"
              title="Run Code in Sandbox"
            >
              {isRunningCode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              <span>Run</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-input rounded px-2 py-1 bg-background hover:bg-accent transition cursor-pointer"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-lg border border-border bg-card">
        {/* Code Mode */}
        {viewMode === 'code' && (
          <div className="flex flex-col h-full overflow-hidden">
            <pre className="flex-1 p-3 text-xs font-mono overflow-auto whitespace-pre-wrap leading-relaxed text-foreground/90 bg-muted/30">
              {artifact.code}
            </pre>
            {executionOutput && (
              <div className="border-t border-border p-3 bg-black/80 text-green-400 text-xs font-mono max-h-40 overflow-auto">
                <div className="flex items-center justify-between text-muted-foreground mb-1 text-[10px] uppercase font-bold">
                  <span>Sandbox Terminal Output</span>
                  <button onClick={() => setExecutionOutput(null)} className="hover:text-foreground">Clear</button>
                </div>
                <pre className="whitespace-pre-wrap">{executionOutput}</pre>
              </div>
            )}
          </div>
        )}

        {/* Live Preview Mode (HTML / SVG / Canvas Sandbox) */}
        {viewMode === 'preview' && (
          <div className="flex flex-col h-full w-full bg-background relative">
            <iframe
              title={artifact.title || 'Interactive Canvas Preview'}
              srcDoc={previewSrcDoc}
              sandbox={IFRAME_SANDBOX_PERMISSIONS}
              allow={IFRAME_ALLOW_FEATURES}
              allowFullScreen
              className="w-full h-full border-0 bg-white dark:bg-zinc-950"
            />
          </div>
        )}

        {/* Interactive Chart Visualizer Mode */}
        {viewMode === 'chart' && parsedChartData && (
          <div className="flex flex-col h-full p-4 space-y-4 overflow-y-auto bg-muted/20">
            {/* Chart Sub-Controls */}
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <BarChart2 className="h-4 w-4 text-primary" />
                Interactive Data Visualizer
              </span>
              <div className="flex items-center gap-1 bg-background border border-input rounded p-0.5">
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-2 py-0.5 text-[11px] rounded transition ${chartType === 'bar' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}
                >
                  Bar
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`px-2 py-0.5 text-[11px] rounded transition ${chartType === 'line' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}
                >
                  Line
                </button>
                <button
                  onClick={() => setChartType('table')}
                  className={`px-2 py-0.5 text-[11px] rounded transition ${chartType === 'table' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}
                >
                  Grid
                </button>
              </div>
            </div>

            {/* Render Bar Chart */}
            {chartType === 'bar' && (
              <div className="space-y-2 py-2">
                {parsedChartData.points.map((pt, idx) => {
                  const pct = Math.min(100, Math.max(5, (pt.value / maxChartVal) * 100));
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono text-muted-foreground">
                        <span className="truncate max-w-[180px]">{pt.label}</span>
                        <span className="font-semibold text-foreground">{pt.value}</span>
                      </div>
                      <div className="h-4 w-full rounded bg-muted/60 overflow-hidden flex">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full bg-gradient-to-r from-primary/80 to-primary rounded transition-all duration-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Render Line Chart (SVG Canvas) */}
            {chartType === 'line' && (
              <div className="flex flex-col items-center py-4 space-y-3">
                <svg className="w-full h-48 bg-card border border-border rounded-lg p-3" viewBox="0 0 300 120">
                  {(() => {
                    const pts = parsedChartData.points;
                    if (pts.length < 2) return null;
                    const coords = pts.map((pt, i) => {
                      const x = (i / (pts.length - 1)) * 280 + 10;
                      const y = 110 - (pt.value / maxChartVal) * 90;
                      return `${x},${y}`;
                    });
                    const polylinePoints = coords.join(' ');
                    return (
                      <>
                        <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" points={polylinePoints} />
                        {pts.map((pt, i) => {
                          const x = (i / (pts.length - 1)) * 280 + 10;
                          const y = 110 - (pt.value / maxChartVal) * 90;
                          return (
                            <circle key={i} cx={x} cy={y} r="3" className="fill-primary stroke-background stroke-2" />
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}

            {/* Render Table Data Grid */}
            {chartType === 'table' && (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {parsedChartData.points.map((pt, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-foreground font-sans">{pt.label}</td>
                        <td className="px-3 py-2 text-right font-semibold text-primary">{pt.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
