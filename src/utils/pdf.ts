/**
 * Utility to extract text content from a PDF file client-side using PDF.js.
 * Loads the library dynamically from CDN to keep initial bundle size small.
 */

interface PdfJsTextItem {
  str: string;
}

interface PdfJsPage {
  getTextContent: () => Promise<{
    items: PdfJsTextItem[];
  }>;
}

interface PdfJsDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
}

interface PdfJsLib {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (args: { data: ArrayBuffer }) => {
    promise: Promise<PdfJsDocument>;
  };
}

type WindowWithPdfJs = typeof window & {
  pdfjsLib?: PdfJsLib;
  'pdfjs-dist/build/pdf'?: PdfJsLib;
};

export async function extractTextFromPdf(
  file: File,
  onProgress?: (message: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfjsVersion = '3.4.120';
    const scriptId = 'pdfjs-lib-cdn';

    const win = window as unknown as WindowWithPdfJs;

    const performExtraction = async () => {
      try {
        const pdfjsLib = win.pdfjsLib || win['pdfjs-dist/build/pdf'];
        if (!pdfjsLib) {
          throw new Error('PDF.js library was not loaded correctly.');
        }

        // Configure worker src from CDN matching the core library version
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

        onProgress?.('Reading PDF file structure...');
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

        const pdf = await loadingTask.promise;
        const maxPages = pdf.numPages;
        let extractedText = '';

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          onProgress?.(`Parsing PDF: Page ${pageNum} of ${maxPages}...`);
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          // Join text items on the page
          const pageText = (textContent.items as PdfJsTextItem[])
            .map((item) => item.str)
            .join(' ');
            
          extractedText += pageText + '\n';
        }

        resolve(extractedText.trim());
      } catch (err) {
        console.error('PDF extraction error:', err);
        reject(err instanceof Error ? err : new Error('Failed to extract text from PDF.'));
      }
    };

    // If already loaded, use it
    if (win.pdfjsLib || win['pdfjs-dist/build/pdf']) {
      performExtraction();
      return;
    }

    // Load PDF.js dynamically
    onProgress?.('Loading PDF parsing library (PDF.js)...');
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.min.js`;
      script.async = true;
      document.head.appendChild(script);
    }

    const handleLoad = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      performExtraction();
    };

    const handleError = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      reject(new Error('Failed to load PDF.js library from CDN. Please check your network connection.'));
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
  });
}

