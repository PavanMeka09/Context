import { describe, it, expect } from 'vitest';
import { generateText } from 'ai';
import { createModelInstance } from '../api';

describe('OpenRouter model compatibility', () => {
  it('should create an OpenRouter model instance compatible with AI SDK generateText without unsupported model version errors', async () => {
    const model = createModelInstance('openrouter', 'fake-key', 'openai/gpt-oss-20b:free');

    let error: Error | null = null;
    try {
      await generateText({
        model: model as unknown as Parameters<typeof generateText>[0]['model'],
        prompt: 'hello',
      });
    } catch (err) {
      error = err as Error;
    }

    // Should NOT fail with UnsupportedModelVersionError
    expect(error?.name).not.toBe('AI_UnsupportedModelVersionError');
    expect(error?.message || '').not.toContain('Unsupported model version');
  });

  it('should create OpenAI, Anthropic, and Gemini model instances without specification version errors', async () => {
    const providers = [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219' },
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'ollama', model: 'llama3.2' },
    ] as const;

    for (const { provider, model: modelId } of providers) {
      const model = createModelInstance(provider, 'fake-key', modelId);
      let error: Error | null = null;
      try {
        await generateText({
          model: model as unknown as Parameters<typeof generateText>[0]['model'],
          prompt: 'hello',
        });
      } catch (err) {
        error = err as Error;
      }
      expect(error?.name).not.toBe('AI_UnsupportedModelVersionError');
      expect(error?.message || '').not.toContain('Unsupported model version');
    }
  }, 15000);
});
