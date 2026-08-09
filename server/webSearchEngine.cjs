/**
 * WebSearchEngine - Deep module for web search intelligence
 * Encapsulates query intent classification, multi-tier search execution (SearXNG -> Wikipedia fallback),
 * snippet cleaning, deduplication, and context formatting.
 */

function getFaviconUrl(targetUrl) {
  try {
    const domain = new URL(targetUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

function isImageUrl(url) {
  if (!url) return false;
  return /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(url);
}

function cleanSnippetText(str) {
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
 * Fast, local regex heuristic to classify search intent.
 */
function classifyQuery(query) {
  const q = (query || '').trim().toLowerCase();
  
  if (!q || q.length < 3) {
    return { shouldSearch: false, searchQuery: '' };
  }

  const cleanPatternTarget = q.replace(/^[.,/#!$%^&*;:{}=\-_`~()?]+|[.,/#!$%^&*;:{}=\-_`~()?]+$/g, '').trim();

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

  const basicCommandPatterns = [
    /^write\s+a\s+function/i,
    /^write\s+a\s+program/i,
    /^implement\s+a/i,
    /^write\s+an\s+email/i,
    /^draft\s+a\s+letter/i,
    /^give\s+me\s+a\s+recipe/i,
    /^tell\s+me\s+a\s+joke/i,
    /^solve\s+this/i,
    /^what\s+is\s+(\d+\s*[+\-*/]\s*\d+)/i
  ];

  for (const pattern of basicCommandPatterns) {
    if (pattern.test(q)) {
      return { shouldSearch: false, searchQuery: '' };
    }
  }

  const cleanQuery = (query || '').replace(/[?!\s]+$/g, '').replace(/^\s+/, '');
  return { shouldSearch: true, searchQuery: cleanQuery.replace(/\s+/g, ' ').trim() };
}

/**
 * Format search results into a clean context snippet for system prompt injection.
 */
function formatContextText(results) {
  if (!results || results.length === 0) {
    return '[REAL-TIME WEB SEARCH CONTEXT]\nNo web search results found.';
  }

  const formattedHits = results
    .map((r, idx) => {
      let text = `[Web Result #${idx + 1}]\nTitle: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.snippet}`;
      if (r.img_src) {
        text += `\nDirect Image URL: ${r.img_src}`;
      }
      return text;
    })
    .join('\n\n');

  return `[REAL-TIME WEB SEARCH CONTEXT]\nUse the following real-time web search results to answer the user's prompt. Rely on these search results to provide accurate, up-to-date information. If the user asked for an image/photo and a "Direct Image URL" is provided, render it directly using markdown image syntax: ![Title](Direct Image URL):\n${formattedHits}`;
}

/**
 * Primary interface for WebSearchEngine.
 * Handles intent classification, SearXNG queries, Wikipedia fallback, and output formatting.
 */
async function searchAndFormat(query, options = {}) {
  const { forceSearch = false, customUrl = '', abortSignal = null } = options;

  let searchQuery = query;
  if (!forceSearch) {
    const classification = classifyQuery(query);
    if (!classification.shouldSearch) {
      return {
        shouldSearch: false,
        query: query,
        contextText: '',
        results: [],
        source: 'bypassed'
      };
    }
    searchQuery = classification.searchQuery || query;
  }

  let baseUrl = customUrl?.trim() || process.env.SEARXNG_URL || 'http://localhost:8082';
  baseUrl = baseUrl.replace(/\/+$/, '');

  const isImageQuery = /\b(image|images|photo|photos|picture|pictures|wallpaper|pic|pics)\b/i.test(searchQuery);
  const categoryParam = isImageQuery ? '&categories=images' : '';
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(searchQuery)}${categoryParam}&format=json`;

  // Tier 1: SearXNG Primary Search
  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: abortSignal || undefined
    });

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.results)) {
        const seenUrls = new Set();
        const uniqueResults = [];

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
            snippet: snippet,
            favicon: getFaviconUrl(targetUrl),
            score: r.score,
            img_src: directImg
          });

          if (uniqueResults.length >= 15) break;
        }
        if (uniqueResults.length > 0) {
          return {
            shouldSearch: true,
            query: searchQuery,
            contextText: formatContextText(uniqueResults),
            results: uniqueResults,
            source: 'searxng'
          };
        }
      }
    }
  } catch (error) {
    if (abortSignal?.aborted) {
      throw new Error('Search cancelled by user.');
    }
    console.warn('SearXNG search unavailable or offline, attempting Wikipedia fallback:', error.message);
  }

  // Tier 2: Wikipedia Fallback Search
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&origin=*`;
    const response = await fetch(wikiUrl, { signal: abortSignal || undefined });

    if (response.ok) {
      const data = await response.json();
      if (data && data.query && Array.isArray(data.query.search)) {
        const seenUrls = new Set();
        const wikiResults = [];
        for (const item of data.query.search) {
          const wikiPageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`;
          const cleanUrl = wikiPageUrl.replace(/\/+$/, '').split('#')[0];
          if (seenUrls.has(cleanUrl)) continue;
          seenUrls.add(cleanUrl);

          wikiResults.push({
            title: item.title,
            url: wikiPageUrl,
            snippet: cleanSnippetText(item.snippet),
            favicon: getFaviconUrl(wikiPageUrl)
          });
          if (wikiResults.length >= 15) break;
        }
        if (wikiResults.length > 0) {
          return {
            shouldSearch: true,
            query: searchQuery,
            contextText: formatContextText(wikiResults),
            results: wikiResults,
            source: 'wikipedia'
          };
        }
      }
    }
  } catch (fallbackError) {
    if (abortSignal?.aborted) {
      throw new Error('Search cancelled by user.');
    }
    console.error('Wikipedia search fallback failed:', fallbackError.message);
  }

  return {
    shouldSearch: true,
    query: searchQuery,
    contextText: formatContextText([]),
    results: [],
    source: 'none',
    error: 'Web search returned no results from any provider.'
  };
}

/**
 * Ping check to verify if the search instance is reachable.
 */
async function testConnection(customUrl = '') {
  const res = await searchAndFormat('ping', { forceSearch: true, customUrl });
  const isSearxngActive = res.source === 'searxng';
  return {
    success: isSearxngActive,
    count: isSearxngActive ? res.results.length : 0,
    source: res.source,
    error: isSearxngActive ? undefined : (res.error || 'SearXNG service unreachable or returning invalid responses.')
  };
}

module.exports = {
  searchAndFormat,
  testConnection,
  classifyQuery,
  formatContextText
};
