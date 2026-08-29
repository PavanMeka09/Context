import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isMediaRecorderSupported,
  isWebSpeechSupported,
  blobToBase64,
  transcribeAudioWithAi,
  createAudioRecorder
} from '../audio';
import type { Settings } from '../storage';

describe('src/utils/audio.ts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Feature detection', () => {
    it('isMediaRecorderSupported returns boolean based on window and navigator', () => {
      const supported = isMediaRecorderSupported();
      expect(typeof supported).toBe('boolean');
    });

    it('isWebSpeechSupported returns boolean based on window speech APIs', () => {
      const supported = isWebSpeechSupported();
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('blobToBase64', () => {
    it('converts a Blob to base64 string', async () => {
      const blob = new Blob(['hello speech audio'], { type: 'text/plain' });
      const base64 = await blobToBase64(blob);
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
    });
  });

  describe('transcribeAudioWithAi', () => {
    it('transcribes audio via Gemini when provider is gemini', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello, this is a test voice message.' }]
            }
          }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const blob = new Blob(['fake audio content'], { type: 'audio/webm' });
      const settings: Settings = {
        provider: 'gemini',
        apiKey: 'test-gemini-key',
        model: 'gemini-2.5-flash'
      };

      const result = await transcribeAudioWithAi(blob, settings);

      expect(result).toBe('Hello, this is a test voice message.');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('transcribes audio via OpenAI Whisper when provider is openai', async () => {
      const mockResponse = {
        text: 'Transcribed from OpenAI Whisper.'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const blob = new Blob(['fake audio content'], { type: 'audio/webm' });
      const settings: Settings = {
        provider: 'openai',
        apiKey: 'sk-test-openai-key',
        model: 'gpt-4o'
      };

      const result = await transcribeAudioWithAi(blob, settings);

      expect(result).toBe('Transcribed from OpenAI Whisper.');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer sk-test-openai-key'
          }
        })
      );
    });

    it('transcribes audio via Groq Whisper when apiKey starts with gsk_', async () => {
      const mockResponse = {
        text: 'Transcribed from Groq Whisper.'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const blob = new Blob(['fake audio content'], { type: 'audio/webm' });
      const settings: Settings = {
        provider: 'openai',
        apiKey: 'gsk_test_groq_key',
        model: 'whisper-large-v3'
      };

      const result = await transcribeAudioWithAi(blob, settings);

      expect(result).toBe('Transcribed from Groq Whisper.');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer gsk_test_groq_key'
          }
        })
      );
    });

    it('falls back to Gemini profile if active provider is anthropic but Gemini key is available', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Transcription from fallback Gemini profile.' }]
            }
          }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const blob = new Blob(['fake audio content'], { type: 'audio/webm' });
      const settings: Settings = {
        provider: 'anthropic',
        apiKey: 'ant-key',
        model: 'claude-3-7-sonnet-20250219',
        profiles: [
          {
            id: 'p-gemini',
            name: 'Gemini Profile',
            provider: 'gemini',
            apiKey: 'gemini-fallback-key',
            model: 'gemini-2.5-flash'
          }
        ]
      };

      const result = await transcribeAudioWithAi(blob, settings);

      expect(result).toBe('Transcription from fallback Gemini profile.');
    });

    it('throws descriptive error if no Gemini or OpenAI key is configured', async () => {
      const blob = new Blob(['fake audio content'], { type: 'audio/webm' });
      const settings: Settings = {
        provider: 'ollama',
        apiKey: '',
        model: 'llama3.2'
      };

      await expect(transcribeAudioWithAi(blob, settings)).rejects.toThrow(
        /AI Voice Transcription requires an active Gemini or OpenAI API key/i
      );
    });

    it('throws error if Gemini API returns an error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid API key provided' } })
      } as Response);

      const blob = new Blob(['fake audio content'], { type: 'audio/webm' });
      const settings: Settings = {
        provider: 'gemini',
        apiKey: 'bad-key',
        model: 'gemini-2.5-flash'
      };

      await expect(transcribeAudioWithAi(blob, settings)).rejects.toThrow(
        /AI Transcription failed: Invalid API key provided/i
      );
    });
  });

  describe('createAudioRecorder', () => {
    it('creates an audio recorder instance with expected methods', () => {
      const recorder = createAudioRecorder();
      expect(recorder).toBeDefined();
      expect(typeof recorder.start).toBe('function');
      expect(typeof recorder.stop).toBe('function');
      expect(typeof recorder.cancel).toBe('function');
      expect(typeof recorder.isRecording).toBe('function');
      expect(typeof recorder.getDurationSeconds).toBe('function');
      expect(recorder.isRecording()).toBe(false);
      expect(recorder.getDurationSeconds()).toBe(0);
    });
  });
});
