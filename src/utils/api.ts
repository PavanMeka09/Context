import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { Message, Settings } from './storage';

export interface ModelOption {
  id: string;
  name: string;
}

// Fetch dynamic models for OpenRouter, or return presets for Gemini/Mock/Anthropic
export async function fetchModels(provider: 'gemini' | 'openrouter' | 'mock' | 'ollama', apiKey?: string, localUrl?: string): Promise<ModelOption[]> {
  if (provider === 'mock') {
    return [
      { id: 'mock-speedy', name: 'Mock Speedy (Fast)' },
      { id: 'mock-smart', name: 'Mock Smart (Complex)' }
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
      console.error('Error fetching Ollama models dynamically, using fallbacks', e);
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
      console.error('Error fetching Gemini models dynamically, using fallback', e);
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

// Generate streaming responses for Mock Provider
function handleMockStream(
  settings: Settings,
  messages: Message[],
  systemInstruction: string,
  callbacks: StreamCallbacks,
  signal: AbortSignal
) {
  const model = settings.model;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || 'Hello';
  const isCodeRequest = lastUserMsg.toLowerCase().includes('code') || lastUserMsg.toLowerCase().includes('write a function') || lastUserMsg.toLowerCase().includes('typescript');
  
  let responseText = '';
  if (isCodeRequest) {
    responseText = `Here is an elegant TypeScript implementation to solve your request.

\`\`\`typescript
interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

/**
 * Filter and map users matching active administrative roles.
 */
export function getActiveAdmins(users: User[]): string[] {
  return users
    .filter(user => user.role === 'admin')
    .map(user => user.name.toUpperCase());
}

// Example usage:
const sampleUsers: User[] = [
  { id: '1', name: 'Alice', role: 'admin' },
  { id: '2', name: 'Bob', role: 'user' },
  { id: '3', name: 'Charlie', role: 'admin' }
];

console.log(getActiveAdmins(sampleUsers));
// Output: ["ALICE", "CHARLIE"]
\`\`\`

### Explanation:
1. **Strong Typing**: We define a clean \`User\` interface specifying type safety for roles.
2. **Functional Pipeline**: Using \`filter\` and \`map\` makes the code readable and declarative.
3. **No Side-Effects**: Pure logic that is fully testable.

Let me know if you would like me to write a comprehensive test suite using Vitest or Jest for this utility!`;
  } else {
    responseText = `Hello! I am **Context**, your lightweight, privacy-first AI companion. 

I am currently streaming in **Mock Mode** because you haven't saved a live API key yet, or chose the Mock provider. This demonstrates my premium capabilities:

* **Sleek Streaming Pacing**: Notice how smoothly tokens flow, emulating live network throughput.
* **Fully Formatted Markdown**: I support **bold styling**, *italics*, and lists.
* **Tables**:
  | Feature | Supported in v1 | Details |
  | :--- | :---: | :--- |
  | Local Storage | Yes | No server backend is required |
  | Custom Prompts | Yes | Fully customizable presets |
  | Streaming | Yes | Stop generation anytime |

### System prompt in use:
> *"${systemInstruction || 'No custom prompt provided.'}"*

You can open **Settings** (bottom-left gear icon) to enter your own API key for **Google Gemini** or **OpenRouter** and select any dynamic model!`;
  }

  // Prepend simulated thinking if active
  if (settings.thinkingLevel && settings.thinkingLevel !== 'off') {
    const levelName = settings.thinkingLevel.toUpperCase();
    responseText = `<thinking>
[SIMULATED THOUGHT PROCESS - LEVEL: ${levelName}]
- Analyzed prompt context length: ${lastUserMsg.length} characters.
- Extracted key intent: ${isCodeRequest ? 'Code Generation' : 'General Conversational Query'}.
- Synthesizing accurate answer using ${model}...
- Verified markdown formatting correctness.
- Ready to stream content output to standard interface.
</thinking>\n\n` + responseText;
  }

  const tokens = responseText.split(/(\s+)/);
  let currentIndex = 0;
  let accumulated = '';

  const intervalTime = model.includes('speedy') ? 20 : 40;

  const intervalId = setInterval(() => {
    if (signal.aborted) {
      clearInterval(intervalId);
      callbacks.onDone(accumulated);
      return;
    }

  if (currentIndex >= tokens.length) {
      clearInterval(intervalId);
      callbacks.onDone(accumulated);
      return;
    }

    const nextToken = tokens[currentIndex];
    accumulated += nextToken;
    callbacks.onChunk(nextToken);
    currentIndex++;
  }, intervalTime);

  signal.addEventListener('abort', () => {
    clearInterval(intervalId);
  });
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

  if (provider === 'mock') {
    handleMockStream(settings, messages, systemInstruction, callbacks, signal);
    return;
  }

  if (!apiKey && provider !== 'ollama') {
    callbacks.onError('API key required. Please configure it in Settings.');
    return;
  }

  try {
    let result;

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
        system: systemInstruction || undefined,
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

      result = streamText({
        model: google(model),
        messages: formattedMessages,
        system: systemInstruction || undefined,
        abortSignal: signal,
      });
    } else if (provider === 'openrouter') {
      const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
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
        system: systemInstruction || undefined,
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
