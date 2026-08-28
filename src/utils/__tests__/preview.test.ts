import { describe, it, expect } from 'vitest';
import { wrapHtmlPreview, IFRAME_SANDBOX_PERMISSIONS, IFRAME_ALLOW_FEATURES } from '../preview';

describe('preview utility', () => {
  it('exports valid iframe security constants', () => {
    expect(IFRAME_SANDBOX_PERMISSIONS).toContain('allow-scripts');
    expect(IFRAME_SANDBOX_PERMISSIONS).toContain('allow-same-origin');
    expect(IFRAME_ALLOW_FEATURES).toContain('fullscreen');
  });

  it('returns empty string for empty input', () => {
    expect(wrapHtmlPreview('')).toBe('');
  });

  it('wraps SVG markup in responsive viewport document', () => {
    const svg = '<svg width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>';
    const result = wrapHtmlPreview(svg);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<meta name="viewport"');
    expect(result).toContain(svg);
    expect(result).toContain('svg{max-width:100%;height:auto;}');
  });

  it('wraps raw HTML snippet in full document with styling and dark mode support', () => {
    const htmlSnippet = '<div class="card">Hello World</div>';
    const result = wrapHtmlPreview(htmlSnippet);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<meta name="viewport"');
    expect(result).toContain('prefers-color-scheme: dark');
    expect(result).toContain(htmlSnippet);
  });

  it('returns original code if already a full HTML document', () => {
    const fullHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hi</h1></body></html>';
    expect(wrapHtmlPreview(fullHtml)).toBe(fullHtml);

    const htmlTagOnly = '<html><body><h1>Hi</h1></body></html>';
    expect(wrapHtmlPreview(htmlTagOnly)).toBe(htmlTagOnly);
  });
});
