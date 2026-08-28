/**
 * Shared utility for generating secure, responsive HTML/SVG live previews in iframes.
 */

export const IFRAME_SANDBOX_PERMISSIONS =
  'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-modals';

export const IFRAME_ALLOW_FEATURES =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';

/**
 * Wraps raw HTML or SVG code snippets in a complete HTML document structure
 * with dark mode support, responsive sizing, and viewport settings if needed.
 */
export function wrapHtmlPreview(code: string): string {
  if (!code) return '';
  const trimmed = code.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('<svg')) {
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#090d16;}svg{max-width:100%;height:auto;}</style></head><body>${trimmed}</body></html>`;
  }

  if (!lower.startsWith('<!doctype') && !lower.startsWith('<html')) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #333;
      background: #fff;
    }
    @media (prefers-color-scheme: dark) {
      body {
        color: #e4e4e7;
        background: #09090b;
      }
    }
    img, video, canvas { max-width: 100%; height: auto; }
    iframe { max-width: 100%; }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
  }

  return code;
}
