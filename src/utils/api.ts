/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateText, streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { Message, Settings } from './storage';

export interface ModelOption {
  id: string;
  name: string;
}

// Fetch dynamic models for OpenRouter, or return presets for Gemini/Anthropic
export async function fetchModels(provider: 'gemini' | 'openrouter' | 'ollama' | 'openai', apiKey?: string, localUrl?: string): Promise<ModelOption[]> {

  if (provider === 'openai') {
    const url = localUrl || 'https://api.openai.com/v1';
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const response = await fetch(`${url}/models`, {
        method: 'GET',
        headers
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.data)) {
          return data.data
            .map((m: any) => ({
              id: m.id,
              name: m.id
            }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));
        }
      }
    } catch (e) {
      console.warn('Error fetching OpenAI models dynamically, using fallbacks', e);
    }
    return [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Default)' },
      { id: 'gpt-4o', name: 'GPT-4o (High Quality)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'o1-mini', name: 'o1-mini' }
    ];
  }

  if (provider === 'ollama') {
    const url = localUrl || 'http://localhost:11434/v1';
    try {
      const response = await fetch(`${url}/models`);
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.data)) {
          return data.data.map((m: any) => ({
            id: m.id,
            name: m.id
          }));
        }
      }
    } catch (e) {
      console.warn('Error fetching Ollama models dynamically, using fallbacks', e);
    }
    return [
      { id: 'llama3', name: 'Llama 3 (Local Fallback)' },
      { id: 'qwen2.5', name: 'Qwen 2.5 (Local Fallback)' },
      { id: 'mistral', name: 'Mistral (Local Fallback)' }
    ];
  }

  if (provider === 'gemini') {
    if (!apiKey) {
      return [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Default)' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (High Quality)' }
      ];
    }
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      if (data && Array.isArray(data.models)) {
        return data.models
          .filter((m: any) => m.name && m.name.includes('gemini'))
          .map((m: any) => {
            const cleanId = m.name.startsWith('models/') ? m.name.slice(7) : m.name;
            return {
              id: cleanId,
              name: m.displayName || cleanId
            };
          });
      }
    } catch (e) {
      console.warn('Error fetching Gemini models dynamically, using fallback', e);
    }
    return [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Default)' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (High Quality)' }
    ];
  }

  if (provider === 'openrouter') {
    try {
      const headers: Record<string, string> = {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Context AI Chat'
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && Array.isArray(data.data)) {
        return data.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.id
        }));
      }
    } catch (e) {
      console.error('Error fetching OpenRouter models dynamically, using fallback', e);
    }
  }

  return [];
}

interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (errorMsg: string) => void;
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

// Main streaming entrypoint using Vercel AI SDK
export async function streamChatCompletion(
  settings: Settings,
  messages: Message[],
  systemInstruction: string,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  const { provider, apiKey, model } = settings;

  if (!apiKey && provider !== 'ollama' && provider !== 'openai') {
    callbacks.onError('API key required. Please configure it in Settings.');
    return;
  }

  try {
    let result;
    const effectiveSystemInstruction = getWrappedSystemInstruction(systemInstruction, settings.thinkingLevel);

    if (provider === 'ollama') {
      const ollama = createOpenAI({
        baseURL: settings.localUrl || 'http://localhost:11434/v1',
        apiKey: apiKey || 'ollama',
      });

      // Format messages into Vercel AI SDK ModelMessages
      const formattedMessages: ModelMessage[] = messages
        .filter(m => m.role !== 'system')
        .map(m => {
          const role = m.role === 'assistant' ? 'assistant' : 'user';

          if (m.attachments && m.attachments.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: m.content }];
            for (const att of m.attachments) {
              if (att.type.startsWith('image/')) {
                contentParts.push({
                  type: 'image',
                  image: att.data,
                  mimeType: att.type
                });
              } else {
                contentParts.push({
                  type: 'text',
                  text: `\n\n[File Attachment: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\``
                });
              }
            }
            return { role, content: contentParts };
          }

          return { role, content: m.content };
        });

      result = streamText({
        model: ollama(model),
        messages: formattedMessages,
        system: effectiveSystemInstruction || undefined,
        abortSignal: signal,
      });
    } else if (provider === 'gemini') {
      const google = createGoogleGenerativeAI({
        apiKey,
      });

      // Format messages into Vercel AI SDK ModelMessages
      const formattedMessages: ModelMessage[] = messages
        .filter(m => m.role !== 'system')
        .map(m => {
          const role = m.role === 'assistant' ? 'assistant' : 'user';

          if (m.attachments && m.attachments.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: m.content }];
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
            return { role, content: contentParts };
          }

          return { role, content: m.content };
        });

      let providerOptions: any = undefined;
      if (settings.thinkingLevel && settings.thinkingLevel !== 'off' && model.includes('gemini')) {
        const budgetMap = {
          low: 1024,
          medium: 2048,
          high: 4096
        };
        providerOptions = {
          google: {
            thinkingConfig: {
              thinkingBudget: budgetMap[settings.thinkingLevel as 'low' | 'medium' | 'high'] || 2048
            }
          }
        };
      }

      result = streamText({
        model: google(model),
        messages: formattedMessages,
        system: effectiveSystemInstruction || undefined,
        abortSignal: signal,
        providerOptions,
      });
    } else if (provider === 'openrouter') {
      const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
        headers: {
          'HTTP-Referer': window.location.origin || 'https://context.ai',
          'X-Title': 'Context AI Chat',
        }
      });

      // Format messages into Vercel AI SDK ModelMessages
      const formattedMessages: ModelMessage[] = messages
        .filter(m => m.role !== 'system')
        .map(m => {
          const role = m.role === 'assistant' ? 'assistant' : 'user';

          if (m.attachments && m.attachments.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: m.content }];
            for (const att of m.attachments) {
              if (att.type.startsWith('image/')) {
                contentParts.push({
                  type: 'image',
                  image: att.data, // OpenRouter handles base64 data URLs natively
                  mimeType: att.type
                });
              } else {
                contentParts.push({
                  type: 'text',
                  text: `\n\n[File Attachment: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\``
                });
              }
            }
            return { role, content: contentParts };
          }

          return { role, content: m.content };
        });

      result = streamText({
        model: openrouter(model),
        messages: formattedMessages,
        system: effectiveSystemInstruction || undefined,
        abortSignal: signal,
      });
    } else if (provider === 'openai') {
      const openaiInstance = createOpenAI({
        baseURL: settings.localUrl || 'https://api.openai.com/v1',
        apiKey: apiKey || 'empty',
      });

      // Format messages into Vercel AI SDK ModelMessages
      const formattedMessages: ModelMessage[] = messages
        .filter(m => m.role !== 'system')
        .map(m => {
          const role = m.role === 'assistant' ? 'assistant' : 'user';

          if (m.attachments && m.attachments.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: m.content }];
            for (const att of m.attachments) {
              if (att.type.startsWith('image/')) {
                contentParts.push({
                  type: 'image',
                  image: att.data,
                  mimeType: att.type
                });
              } else {
                contentParts.push({
                  type: 'text',
                  text: `\n\n[File Attachment: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\``
                });
              }
            }
            return { role, content: contentParts };
          }

          return { role, content: m.content };
        });

      result = streamText({
        model: openaiInstance(model),
        messages: formattedMessages,
        system: effectiveSystemInstruction || undefined,
        abortSignal: signal,
      });
    }

    if (result) {
      let fullText = '';
      for await (const textPart of result.textStream) {
        fullText += textPart;
        callbacks.onChunk(textPart);
      }
      callbacks.onDone(fullText);
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || signal.aborted) {
      // Abort is a normal flow when user stops generating, handled in callback/handle
      return;
    }
    console.error('Streaming connection error', err);
    
    // Map standard HTTP status codes/error messages using our custom mapper
    const status = err.status || (err.message?.includes('401') ? 401 : err.message?.includes('429') ? 429 : err.message?.includes('403') ? 403 : 500);
    const errMsg = getErrorMessage(status, err.message || 'Connection failed.');
    callbacks.onError(errMsg);
  }
}

// Lightweight non-streaming text completion for query classification & rewriting
export async function generateTextCompletion(
  settings: Settings,
  messages: Message[],
  systemInstruction: string
): Promise<string> {
  const { provider, apiKey, model } = settings;

  if (!apiKey && provider !== 'ollama' && provider !== 'openai') {
    throw new Error('API key required. Please configure it in Settings.');
  }

  const effectiveSystemInstruction = getWrappedSystemInstruction(systemInstruction, settings.thinkingLevel);
  let result;

  const formattedMessages: ModelMessage[] = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';

      if (m.attachments && m.attachments.length > 0) {
        const contentParts: any[] = [{ type: 'text', text: m.content }];
        for (const att of m.attachments) {
          if (att.type.startsWith('image/')) {
            if (provider === 'gemini') {
              const base64Data = att.data.split(',')[1] || att.data;
              contentParts.push({
                type: 'image',
                image: base64Data,
                mimeType: att.type
              });
            } else {
              contentParts.push({
                type: 'image',
                image: att.data,
                mimeType: att.type
              });
            }
          } else {
            contentParts.push({
              type: 'text',
              text: `\n\n[File Attachment: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\``
            });
          }
        }
        return { role, content: contentParts };
      }

      return { role, content: m.content };
    });

  if (provider === 'ollama') {
    const ollama = createOpenAI({
      baseURL: settings.localUrl || 'http://localhost:11434/v1',
      apiKey: apiKey || 'ollama',
    });

    result = await generateText({
      model: ollama(model),
      messages: formattedMessages,
      system: effectiveSystemInstruction || undefined,
    });
  } else if (provider === 'gemini') {
    const google = createGoogleGenerativeAI({
      apiKey,
    });

    let providerOptions: any = undefined;
    if (settings.thinkingLevel && settings.thinkingLevel !== 'off' && model.includes('gemini')) {
      const budgetMap = {
        low: 1024,
        medium: 2048,
        high: 4096
      };
      providerOptions = {
        google: {
          thinkingConfig: {
            thinkingBudget: budgetMap[settings.thinkingLevel as 'low' | 'medium' | 'high'] || 2048
          }
        }
      };
    }

    result = await generateText({
      model: google(model),
      messages: formattedMessages,
      system: effectiveSystemInstruction || undefined,
      providerOptions,
    });
  } else if (provider === 'openrouter') {
    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      headers: {
        'HTTP-Referer': window.location.origin || 'https://context.ai',
        'X-Title': 'Context AI Chat',
      }
    });

    result = await generateText({
      model: openrouter(model),
      messages: formattedMessages,
      system: effectiveSystemInstruction || undefined,
    });
  } else if (provider === 'openai') {
    const openaiInstance = createOpenAI({
      baseURL: settings.localUrl || 'https://api.openai.com/v1',
      apiKey: apiKey || 'empty',
    });

    result = await generateText({
      model: openaiInstance(model),
      messages: formattedMessages,
      system: effectiveSystemInstruction || undefined,
    });
  }

  return result?.text || '';
}
