/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateText, streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import type { ModelMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { Message, Settings, SearchExecutionResult, ProviderType } from './storage';
import { FALLBACK_MODELS, PROVIDERS } from './storage';
import { searchSearxng, classifySearchHeuristically, formatSearxngResults, cleanSnippetText } from './searxng';

export interface ModelOption {
  id: string;
  name: string;
}

// Fetch dynamic models for Gemini
export const webSearchToolParametersSchema = z.object({
  query: z.string().optional().describe('The search query string to search for'),
  queries: z.union([z.string(), z.array(z.string())]).optional().describe('The search query or list of search queries'),
  search_query: z.string().optional().describe('Alternative search query parameter'),
  q: z.string().optional().describe('Short search query parameter'),
});
export type WebSearchArgs = z.infer<typeof webSearchToolParametersSchema>;

export function extractWebSearchQuery(args: WebSearchArgs): string {
  const candidate =
    args?.query ||
    (Array.isArray(args?.queries) ? args.queries[0] : args?.queries) ||
    args?.search_query ||
    args?.q ||
    '';
  return (typeof candidate === 'string' ? candidate : String(candidate || '')).trim();
}

export interface FetchModelsOptions {
  provider?: ProviderType;
  apiKey?: string;
}

interface ProviderFetchConfig {
  url: (key: string) => string;
  headers?: (key: string) => Record<string, string>;
  parse: (data: any) => ModelOption[];
}

const PROVIDER_FETCH_CONFIGS: Record<ProviderType, ProviderFetchConfig> = {
  gemini: {
    url: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    parse: (data) =>
      (data?.models || [])
        .filter((m: any) => {
          if (!m.name || !m.name.includes('gemini')) return false;
          const methods: string[] = m.supportedGenerationMethods || [];
          return methods.length === 0 || methods.includes('generateContent');
        })
        .map((m: any) => {
          const cleanId = m.name.startsWith('models/') ? m.name.slice(7) : m.name;
          return { id: cleanId, name: m.displayName || cleanId };
        }),
  },
  openai: {
    url: () => 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    parse: (data) =>
      (data?.data || [])
        .filter((m: any) => m.id && (m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')))
        .map((m: any) => ({ id: m.id, name: m.id })),
  },
  openrouter: {
    url: () => 'https://openrouter.ai/api/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    parse: (data) => (data?.data || []).map((m: any) => ({ id: m.id, name: m.name || m.id })),
  },
  anthropic: {
    url: () => 'https://api.anthropic.com/v1/models',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    parse: (data) => (data?.data || []).map((m: any) => ({ id: m.id, name: m.display_name || m.id })),
  },
};

export async function fetchModels(
  optionsOrProviderOrKey?: FetchModelsOptions | ProviderType | string,
  apiKeyParam?: string
): Promise<ModelOption[]> {
  let provider: ProviderType = 'gemini';
  let apiKey: string | undefined;

  if (optionsOrProviderOrKey && typeof optionsOrProviderOrKey === 'object') {
    provider = optionsOrProviderOrKey.provider || 'gemini';
    apiKey = optionsOrProviderOrKey.apiKey;
  } else if (
    optionsOrProviderOrKey === 'gemini' ||
    optionsOrProviderOrKey === 'anthropic' ||
    optionsOrProviderOrKey === 'openai' ||
    optionsOrProviderOrKey === 'openrouter'
  ) {
    provider = optionsOrProviderOrKey;
    apiKey = apiKeyParam;
  } else if (typeof optionsOrProviderOrKey === 'string') {
    provider = 'gemini';
    apiKey = optionsOrProviderOrKey;
  } else {
    apiKey = apiKeyParam;
  }

  const fallback = FALLBACK_MODELS[provider] || FALLBACK_MODELS.gemini;
  if (!apiKey) {
    return [...fallback];
  }

  try {
    const config = PROVIDER_FETCH_CONFIGS[provider];
    if (config) {
      const response = await fetch(config.url(apiKey), {
        headers: config.headers ? config.headers(apiKey) : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        const models = config.parse(data).sort((a: ModelOption, b: ModelOption) =>
          a.name.localeCompare(b.name)
        );
        if (models.length > 0) return models;
      }
    }
  } catch (e) {
    console.warn(`Error fetching ${provider} models dynamically, using fallback`, e);
  }

  return [...fallback];
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (errorMsg: string) => void;
  onToolCall?: (toolCall: { toolName: string; query: string }) => void;
  onToolResult?: (toolResult: { toolName: string; query: string; results: any[]; source: string }) => void;
}

// Custom error handling mapping
function getErrorMessage(status: number, defaultMsg: string): string {
  if (status === 401) {
    return 'Authentication failed. Please check that your API key is correct and valid.';
  }
  if (status === 429) {
    return 'Rate limit exceeded. Too many requests. Please try again later.';
  }
  if (status === 403) {
    return 'Authentication failed. Access forbidden. Verify your API key has proper permissions.';
  }
  return defaultMsg;
}
// Helper to inject thinking level instructions into system instruction
function getWrappedSystemInstruction(systemInstruction: string, thinkingLevel?: 'off' | 'low' | 'medium' | 'high'): string {
  if (!thinkingLevel || thinkingLevel === 'off') {
    return systemInstruction;
  }

  const instructions = {
    low: 'Wrap your brief, initial thought process inside <thinking> tags before answering. Be extremely concise and focus only on the core solution path.',
    medium: 'Before answering, outline your step-by-step thinking process inside <thinking> tags. Analyze the question, verify assumptions, and structure your approach.',
    high: 'Conduct an exhaustive, deep step-by-step reasoning process inside <thinking> tags before answering. Explore alternative perspectives, potential pitfalls, and edge cases, and rigorously verify your logical flow before delivering the final response.'
  };

  const instructionText = instructions[thinkingLevel];
  
  if (systemInstruction) {
    return `${systemInstruction}\n\n[REASONING ENGINE COMPONENT]\n${instructionText}`;
  }
  
  return `[REASONING ENGINE COMPONENT]\n${instructionText}`;
}
function cleanMessageContent(content: string): string {
  if (!content) return '';
  return content
    .replace(/<search_status[\s\S]*?<\/search_status>/gi, '')
    .trim();
}

function formatModelMessages(messages: Message[]): ModelMessage[] {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'assistant') {
        const cleaned = cleanMessageContent(m.content);
        return { role: 'assistant', content: cleaned || '...' };
      }

      if (m.attachments && m.attachments.length > 0) {
        const contentParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType: string }> = [
          { type: 'text', text: m.content }
        ];
        for (const att of m.attachments) {
          if (att.type.startsWith('image/')) {
            const base64Data = att.data.split(',')[1] || att.data;
            contentParts.push({
              type: 'image',
              image: base64Data,
              mimeType: att.type
            });
          } else {
            contentParts.push({
              type: 'text',
              text: `\n\n[File Attachment: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\``
            });
          }
        }
        return { role: 'user', content: contentParts };
      }
      return { role: 'user', content: m.content };
    });
}

export function createModelInstance(provider: ProviderType, apiKey: string, model: string) {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({ apiKey });
      return openrouter(model);
    }
    case 'gemini':
    default: {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }
  }
}

function getProviderOptions(provider: ProviderType, thinkingLevel?: Settings['thinkingLevel'], model?: string, hasTools?: boolean) {
  if (hasTools) {
    return undefined;
  }
  if (provider === 'gemini' && thinkingLevel && thinkingLevel !== 'off' && model && model.includes('gemini')) {
    const budgetMap = {
      low: 1024,
      medium: 2048,
      high: 4096
    };
    return {
      google: {
        thinkingConfig: {
          thinkingBudget: budgetMap[thinkingLevel] || 2048
        }
      }
    };
  }
  return undefined;
}

function prepareModelAndMessages(
  settings: Settings,
  messages: Message[],
  systemInstruction: string,
  hasTools: boolean = false
) {
  const provider = settings.provider || 'gemini';
  const apiKey = settings.apiKey;
  const model = settings.model || PROVIDERS[provider]?.defaultModel || 'gemini-3.6-flash';
  const thinkingLevel = settings.thinkingLevel;

  if (!apiKey) {
    throw new Error('API key required. Please configure it in Settings.');
  }

  const effectiveSystemInstruction = getWrappedSystemInstruction(systemInstruction, hasTools ? 'off' : thinkingLevel);
  const formattedMessages = formatModelMessages(messages);

  const modelInstance = createModelInstance(provider, apiKey, model);
  const providerOptions = getProviderOptions(provider, thinkingLevel, model, hasTools);

  return {
    modelInstance,
    formattedMessages,
    effectiveSystemInstruction,
    providerOptions
  };
}

// Main streaming entrypoint using Vercel AI SDK
export async function streamChatCompletion(
  settings: Settings,
  messages: Message[],
  systemInstruction: string,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  const hasTools = Boolean(settings.isWebSearchEnabled);
  let prep;
  try {
    prep = prepareModelAndMessages(settings, messages, systemInstruction, hasTools);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'API key required.';
    callbacks.onError(message);
    return;
  }

  try {
    const webSearchTool = settings.isWebSearchEnabled
      ? {
          web_search: tool({
            description:
              'Search the web using SearXNG for real-time information, current facts, weather, news, or images. Formulate ONE clear, targeted search query per user request. Do NOT execute repeated or redundant web searches; synthesize the returned results directly to answer the user.',
            inputSchema: webSearchToolParametersSchema,
            execute: async (args: WebSearchArgs) => {
              const query = extractWebSearchQuery(args);
              callbacks.onToolCall?.({ toolName: 'web_search', query });
              const searchExec = await searchWeb(query, { customUrl: settings.searxngUrl, forceSearch: true });
              const results = (searchExec.results || []).map((r: { title: string; url: string; snippet?: string; content?: string; img_src?: string }) => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet || r.content || '',
                img_src: r.img_src,
              }));
              callbacks.onToolResult?.({
                toolName: 'web_search',
                query,
                results,
                source: searchExec.source || 'searxng',
              });
              return {
                query,
                results,
                contextText: searchExec.contextText || '',
              };
            },
          }),
        }
      : undefined;

    const result = streamText({
      model: prep.modelInstance,
      messages: prep.formattedMessages,
      system: prep.effectiveSystemInstruction || undefined,
      abortSignal: signal,
      providerOptions: prep.providerOptions,
      ...(webSearchTool
        ? {
            tools: webSearchTool,
            stopWhen: stepCountIs(2),
          }
        : {}),
    });

    if (result) {
      let fullText = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          const delta = ('textDelta' in part && typeof part.textDelta === 'string' ? part.textDelta : 'text' in part && typeof part.text === 'string' ? part.text : '');
          fullText += delta;
          callbacks.onChunk(delta);
        }
      }
      callbacks.onDone(fullText);
    }
  } catch (err: unknown) {
    const errorObj = err as { name?: string; status?: number; message?: string };
    if (errorObj.name === 'AbortError' || signal.aborted) {
      return;
    }
    console.error('Streaming connection error', err);

    const status = errorObj.status || (errorObj.message?.includes('401') ? 401 : errorObj.message?.includes('429') ? 429 : errorObj.message?.includes('403') ? 403 : 500);
    const errMsg = getErrorMessage(status, errorObj.message || 'Connection failed.');
    callbacks.onError(errMsg);
  }
}

// Lightweight non-streaming text completion for query classification & rewriting
export async function generateTextCompletion(
  settings: Settings,
  messages: Message[],
  systemInstruction: string
): Promise<string> {
  const prep = prepareModelAndMessages(settings, messages, systemInstruction);

  const result = await generateText({
    model: prep.modelInstance,
    messages: prep.formattedMessages,
    system: prep.effectiveSystemInstruction || undefined,
    providerOptions: prep.providerOptions as any,
  });

  return result?.text || '';
}

/**
 * Execute web search via the unified backend WebSearchEngine API endpoint,
 * falling back gracefully to client-side search execution if offline.
 */
export async function searchWeb(
  query: string,
  options?: { forceSearch?: boolean; customUrl?: string }
): Promise<SearchExecutionResult> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        forceSearch: options?.forceSearch,
        customUrl: options?.customUrl
      })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Backend WebSearchEngine API endpoint unreachable, attempting client fallback:', e);
  }

  // Client-side fallback
  if (!options?.forceSearch) {
    const classification = classifySearchHeuristically(query);
    if (!classification.shouldSearch) {
      return {
        shouldSearch: false,
        query: query,
        contextText: '',
        results: [],
        source: 'bypassed'
      };
    }
  }

  try {
    const rawHits = await searchSearxng(query, options?.customUrl);
    if (rawHits && rawHits.length > 0) {
      const results = rawHits.map(h => {
        let domain = 'google.com';
        try {
          domain = new URL(h.url).hostname;
        } catch {
          // fallback domain if relative or invalid URL
        }
        return {
          title: h.title,
          url: h.url,
          snippet: h.content,
          favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
          img_src: h.img_src
        };
      });

      return {
        shouldSearch: true,
        query: query,
        contextText: formatSearxngResults(rawHits),
        results: results,
        source: 'searxng'
      };
    }
  } catch (err) {
    console.warn('SearXNG client search failed, trying Wikipedia fallback:', err);
  }

  // Fallback to Wikipedia API
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const response = await fetch(wikiUrl);
    if (response.ok) {
      const data = await response.json();
      if (data && data.query && Array.isArray(data.query.search)) {
        const seenUrls = new Set<string>();
        const wikiResults: Array<{ title: string; url: string; snippet: string; favicon: string }> = [];

        for (const item of data.query.search) {
          const wikiPageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`;
          const cleanUrl = wikiPageUrl.replace(/\/+$/, '').split('#')[0];
          if (seenUrls.has(cleanUrl)) continue;
          seenUrls.add(cleanUrl);

          const cleanSnippet = cleanSnippetText(item.snippet || '');

          wikiResults.push({
            title: item.title,
            url: wikiPageUrl,
            snippet: cleanSnippet,
            favicon: `https://www.google.com/s2/favicons?domain=en.wikipedia.org&sz=32`
          });
          if (wikiResults.length >= 15) break;
        }

        if (wikiResults.length > 0) {
          const searxFormat = wikiResults.map(r => ({ title: r.title, url: r.url, content: r.snippet }));
          return {
            shouldSearch: true,
            query: query,
            contextText: formatSearxngResults(searxFormat),
            results: wikiResults,
            source: 'wikipedia'
          };
        }
      }
    }
  } catch (e) {
    console.error('Client-side Wikipedia search fallback failed:', e);
  }

  return {
    shouldSearch: true,
    query: query,
    contextText: '[REAL-TIME WEB SEARCH CONTEXT]\nNo web search results found.',
    results: [],
    source: 'none',
    error: 'Web search returned no results from any provider.'
  };
}
