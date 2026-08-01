
export interface SearxngResult {
  title: string;
  url: string;
  content: string;
  score?: number;
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
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;

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
          if (!r.url) continue;
          // Clean URL to normalize duplicates (remove trailing slashes, trailing hash etc.)
          const cleanUrl = r.url.replace(/\/+$/, '').split('#')[0];
          if (seenUrls.has(cleanUrl)) continue;
          seenUrls.add(cleanUrl);

          uniqueResults.push({
            title: r.title || 'Untitled Page',
            url: r.url,
            content: (r.content || r.snippet || '').replace(/<[^>]*>/g, '').trim(), // Strip HTML tags
            score: r.score
          });

          if (uniqueResults.length >= 5) break;
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
        return data.query.search.slice(0, 5).map((item: { title: string; snippet: string; pageid: number }) => ({
          title: item.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
          content: (item.snippet || '').replace(/<[^>]*>/g, '').trim()
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
  try {
    const results = await searchSearxng('ping', customUrl);
    return {
      success: true,
      count: results.length
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Instance unreachable or returned an invalid response.';
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

  return results
    .map((r, idx) => {
      return `[Web Result #${idx + 1}]
Title: ${r.title}
URL: ${r.url}
Excerpt: ${r.content}`;
    })
    .join('\n\n');
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

  // Default: strip common punctuation to clean up query keywords
  const cleanQuery = query.replace(new RegExp('[.,/#!$%^&*;:{}=\\-_`~()?]', 'g'), '');
  return { shouldSearch: true, searchQuery: cleanQuery.replace(/\s+/g, ' ').trim() };
}


