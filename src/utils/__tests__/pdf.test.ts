import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTextFromPdf } from '../pdf';

describe('src/utils/pdf.ts', () => {
  beforeEach(() => {
    // Reset global pdfjsLib
    const win = window as unknown as Record<string, unknown>;
    delete win.pdfjsLib;
    delete win['pdfjs-dist/build/pdf'];
    const existingScript = document.getElementById('pdfjs-lib-cdn');
    if (existingScript) existingScript.remove();
  });

  it('extracts text using existing window.pdfjsLib', async () => {
    const mockFile = new File(['fake pdf content'], 'test.pdf', { type: 'application/pdf' });
    mockFile.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));

    const mockPdfDocument = {
      numPages: 2,
      getPage: vi.fn().mockImplementation(async (pageNum: number) => ({
        getTextContent: async () => ({
          items: [{ str: `Page ${pageNum} line 1` }, { str: `Page ${pageNum} line 2` }]
        })
      }))
    };

    (window as unknown as Record<string, unknown>).pdfjsLib = {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: vi.fn().mockReturnValue({
        promise: Promise.resolve(mockPdfDocument)
      })
    };

    const progressLogs: string[] = [];
    const text = await extractTextFromPdf(mockFile, msg => progressLogs.push(msg));

    expect(text).toContain('Page 1 line 1 Page 1 line 2');
    expect(text).toContain('Page 2 line 1 Page 2 line 2');
    expect(progressLogs.length).toBeGreaterThan(0);
  });

  it('handles script load error gracefully when PDF.js fails to load', async () => {
    const mockFile = new File(['fake content'], 'test.pdf', { type: 'application/pdf' });

    const promise = extractTextFromPdf(mockFile);

    // Simulate script error
    const script = document.getElementById('pdfjs-lib-cdn') as HTMLScriptElement;
    expect(script).toBeDefined();

    const event = new Event('error');
    script.dispatchEvent(event);

    await expect(promise).rejects.toThrow('Failed to load PDF.js library');
  });
});
