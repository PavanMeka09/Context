import { generateTextCompletion } from './api';
import type { Message, Settings } from './storage';

export interface SearxngResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/**
 * Searches the web using a SearXNG instance.
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

    if (!response.ok) {
      throw new Error(`SearXNG request failed: ${response.statusText}`);
    }

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
      return uniqueResults;
    }
  } catch (error) {
    console.error('Error fetching from SearXNG:', error);
    throw error;
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

  // Common greetings and pleasantries
  const greetingPatterns = [
    /^(hello|hi|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|yo|sup|hola|bonjour)(\s+|$)/i,
    /^(thank\s+you|thanks|much\s+obliged|appreciate\s+it|great\s+thanks)(\s+|$)/i,
    /^(how\s+are\s+you|how's\s+it\s+going|how\s+do\s+you\s+do|howdy)(\s+|$)/i,
    /^(goodbye|bye|see\s+you\s+later|see\s+ya|farewell)(\s+|$)/i
  ];

  for (const pattern of greetingPatterns) {
    if (pattern.test(q)) {
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

/**
 * Intelligent, context-aware query classification and optimization.
 * Analyzes conversation history and latest query to decide if search is needed,
 * and rewrites the query for optimal keyword search (resolving pronouns contextually).
 */
export async function classifyAndOptimizeSearchQuery(
  settings: Settings,
  messages: Message[]
): Promise<{ shouldSearch: boolean; searchQuery: string }> {
  if (messages.length === 0) {
    return { shouldSearch: false, searchQuery: '' };
  }

  const latestMessage = messages[messages.length - 1];
  const queryText = latestMessage.content || '';

  // 1. Check local fast regex heuristics first
  const heuristic = classifySearchHeuristically(queryText);
  if (!heuristic.shouldSearch) {
    return heuristic;
  }

  // 2. If API Key is not configured yet (e.g. initial setup), fall back immediately to clean heuristic
  const hasApiKey = settings.apiKey || settings.provider === 'ollama';
  if (!hasApiKey) {
    return heuristic;
  }

  // 3. Ask the LLM to classify intent & optimize the keywords based on history
  const systemInstruction = `You are an expert search query classifier and optimizer. Your task is to analyze the conversation history and the latest user message, and decide if a real-time web search is necessary or highly beneficial to answer the user's latest query accurately.

Examples of queries requiring search:
- Current events, news, weather, or real-time sports results ("who won the match yesterday?", "what is the weather in New York today?")
- Dynamic information, stock prices, exchange rates, or local business info ("Tesla stock price today", "best sushi restaurants in Seattle")
- Technical questions requiring up-to-date documentation or library updates released after 2024 ("how to use the latest next.js App router features", "what is the latest react version?")
- Fact-verification about people, companies, or events ("Who is the CEO of Nvidia?", "When is the next solar eclipse?")

Examples of queries NOT requiring search:
- Basic conversation, greetings, pleasantries, or simple gratitude ("hello", "how are you?", "thank you", "that works")
- Static coding tasks, algorithm design, standard math, or general logic questions ("write a fibonacci function in python", "what is 2 + 2?")
- Questions about your identity, capabilities, or rules ("who are you?", "can you write an email for me?")
- Follow-ups that discuss concepts already in the conversation history without requiring new external facts ("explain the code you just wrote in simpler terms", "add error handling to it")

Respond in the following EXACT format and nothing else. Do not include markdown code block formatting:
SEARCH: YES/NO
QUERY: <optimized search query keywords, clean of conversational clutter, search syntax, or punctuation. Reconstruct the query if it is a contextual follow-up like "Who is his wife?" into "Jensen Huang wife". If SEARCH is NO, leave this blank.>`;

  try {
    const rawResult = await generateTextCompletion(settings, messages, systemInstruction);
    const lines = rawResult.trim().split('\n');
    let shouldSearch = false;
    let searchQuery = '';

    for (const line of lines) {
      const upper = line.toUpperCase().trim();
      if (upper.startsWith('SEARCH:')) {
        const value = line.substring(7).trim().toUpperCase();
        shouldSearch = value === 'YES';
      } else if (upper.startsWith('QUERY:')) {
        searchQuery = line.substring(6).trim();
      }
    }

    // Double check we have a query if shouldSearch is true
    if (shouldSearch && !searchQuery) {
      searchQuery = heuristic.searchQuery;
    }

    return { shouldSearch, searchQuery };
  } catch (error) {
    console.error('LLM search classification failed, falling back to heuristic:', error);
    return heuristic;
  }
}
