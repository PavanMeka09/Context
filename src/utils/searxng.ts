export interface SearxngResult {
  title: string;
  url: string;
  content: string;
  snippet?: string;
  score?: number;
  img_src?: string;
}

export function isImageUrl(url: string): boolean {
  if (!url) return false;
  return /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(url);
}


/**
 * Cleans snippet text by stripping HTML tags and decoding common HTML entities.
 */
export function cleanSnippetText(str: string): string {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts a favicon URL for a given target webpage URL.
 */
export function getFaviconUrl(targetUrl: string): string {
  try {
    const parsed = new URL(targetUrl);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
  } catch {
    return '';
  }
}

/**
 * Searches the web using a SearXNG instance, falling back to DuckDuckGo/Wikipedia if SearXNG is offline.
 * Supports absolute URLs (e.g. custom public instances) or relative URLs (proxied inside Docker/Vite dev server).
 */
export async function searchSearxng(query: string, customUrl?: string): Promise<SearxngResult[]> {
  let baseUrl = customUrl?.trim() || '';
  if (!baseUrl) {
    // Falls back to proxy path
    baseUrl = '/searxng';
  } else {
    // Strip trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // Construct query URL. Format=json triggers JSON parsing.
  const isImageQuery = /\b(image|images|photo|photos|picture|pictures|wallpaper|pic|pics)\b/i.test(query);
  const categoryParam = isImageQuery ? '&categories=images' : '';
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}${categoryParam}&format=json`;

  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      
      if (data && Array.isArray(data.results)) {
        const seenUrls = new Set<string>();
        const uniqueResults: SearxngResult[] = [];
        
        for (const r of data.results) {
          const directImg = r.img_src || r.thumbnail_src || r.thumbnail || (isImageUrl(r.url) ? r.url : '');
          if (!r.url && !directImg) continue;
          const targetUrl = r.url || directImg;
          const cleanUrl = targetUrl.replace(/\/+$/, '').split('#')[0];
          if (seenUrls.has(cleanUrl)) continue;
          seenUrls.add(cleanUrl);

          const snippet = cleanSnippetText(r.content || r.snippet || r.title || '');
          uniqueResults.push({
            title: r.title || 'Untitled Page',
            url: targetUrl,
            content: snippet,
            snippet: snippet,
            score: r.score,
            img_src: directImg
          });

          if (uniqueResults.length >= 15) break;
        }
        if (uniqueResults.length > 0) {
          return uniqueResults;
        }
      }
    }
  } catch (error) {
    console.warn('SearXNG search unavailable or offline, attempting Wikipedia fallback search:', error);
  }

  // Resilient Wikipedia API fallback search
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const response = await fetch(wikiUrl);
    if (response.ok) {
      const data = await response.json();
      if (data && data.query && Array.isArray(data.query.search)) {
        return data.query.search.slice(0, 15).map((item: { title: string; snippet: string; pageid: number }) => ({
          title: item.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
          content: cleanSnippetText(item.snippet || '')
        }));
      }
    }
  } catch (fallbackError) {
    console.error('Web search fallback failed:', fallbackError);
  }

  return [];
}

/**
 * Simple ping check to verify if the SearXNG instance is reachable and working.
 */
export async function testSearxngConnection(customUrl?: string): Promise<{ success: boolean; count: number; error?: string }> {
  // First try backend test endpoint if available
  try {
    const res = await fetch('/api/search/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customUrl })
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: Boolean(data.success),
        count: data.count || 0,
        error: data.error
      };
    }
  } catch {
    // Backend endpoint unavailable, proceed to client direct check
  }

  // Direct client check strictly for SearXNG without Wikipedia fallback false positives
  let baseUrl = customUrl?.trim() || '';
  if (!baseUrl) {
    baseUrl = '/searxng';
  } else {
    baseUrl = baseUrl.replace(/\/+$/, '');
  }

  const searchUrl = `${baseUrl}/search?q=ping&format=json`;

  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.results)) {
        return {
          success: true,
          count: data.results.length
        };
      }
    }
    return {
      success: false,
      count: 0,
      error: `SearXNG returned HTTP status ${response.status}`
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'SearXNG instance unreachable.';
    return {
      success: false,
      count: 0,
      error: errorMsg
    };
  }
}

/**
 * Formats SearXNG search results into a readable context snippet for the AI model.
 */
export function formatSearxngResults(results: SearxngResult[]): string {
  if (results.length === 0) {
    return 'No web search results found.';
  }

  const formattedHits = results
    .map((r, idx) => {
      let item = `[Web Result #${idx + 1}]\nTitle: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.content}`;
      if (r.img_src) {
        item += `\nDirect Image URL: ${r.img_src}`;
      }
      return item;
    })
    .join('\n\n');

  return `[REAL-TIME WEB SEARCH CONTEXT]\nUse the following real-time web search results to answer the user's prompt. Rely on these search results to provide accurate, up-to-date information. If the user asked for an image/photo and a "Direct Image URL" is provided, render it directly using markdown image syntax: ![Title](Direct Image URL):\n${formattedHits}`;
}

/**
 * Fast, local regex heuristic to instantly bypass search for conversational phrases,
 * greetings, or simple tasks, avoiding unnecessary LLM classification latency.
 */
export function classifySearchHeuristically(query: string): { shouldSearch: boolean; searchQuery: string } {
  const q = query.trim().toLowerCase();
  
  if (!q || q.length < 3) {
    return { shouldSearch: false, searchQuery: '' };
  }

  // Clean trailing/leading punctuation for pattern matching
  const cleanPatternTarget = q.replace(/^[.,/#!$%^&*;:{}=\-_`~()?]+|[.,/#!$%^&*;:{}=\-_`~()?]+$/g, '').trim();

  // Common greetings and pleasantries
  const greetingPatterns = [
    /^(hello|hi|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|yo|sup|hola|bonjour)(\s+|$)/i,
    /^(thank\s+you|thanks|much\s+obliged|appreciate\s+it|great\s+thanks)(\s+|$)/i,
    /^(how\s+are\s+you|how's\s+it\s+going|how\s+do\s+you\s+do|howdy)(\s+|$)/i,
    /^(goodbye|bye|see\s+you\s+later|see\s+ya|farewell)(\s+|$)/i
  ];

  for (const pattern of greetingPatterns) {
    if (pattern.test(cleanPatternTarget)) {
      return { shouldSearch: false, searchQuery: '' };
    }
  }

  // Questions about AI self-identity or capabilities
  const aiSelfPatterns = [
    /who\s+are\s+you/i,
    /what\s+is\s+your\s+name/i,
    /what\s+can\s+you\s+do/i,
    /are\s+you\s+an?\s+ai/i,
    /explain\s+your\s+capabilities/i,
    /how\s+do\s+you\s+work/i
  ];

  for (const pattern of aiSelfPatterns) {
    if (pattern.test(q)) {
      return { shouldSearch: false, searchQuery: '' };
    }
  }

  // Basic commands / programming prompts that are clearly static
  const basicCommandPatterns = [
    /^write\s+a\s+function/i,
    /^write\s+a\s+program/i,
    /^implement\s+a/i,
    /^write\s+an\s+email/i,
    /^draft\s+a\s+letter/i,
    /^give\s+me\s+a\s+recipe/i,
    /^tell\s+me\s+a\s+joke/i,
    /^solve\s+this/i,
    /^what\s+is\s+(\d+\s*[+\-*/]\s*\d+)/i // simple math
  ];

  for (const pattern of basicCommandPatterns) {
    if (pattern.test(q)) {
      return { shouldSearch: false, searchQuery: '' };
    }
  }

  // Preserve symbols (+, #, :, ", etc.), only trim trailing question/exclamation marks & leading/trailing whitespace
  const cleanQuery = (query || '').replace(/[?!\s]+$/g, '').replace(/^\s+/, '');
  return { shouldSearch: true, searchQuery: cleanQuery.replace(/\s+/g, ' ').trim() };
}


