import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceRecording } from '../useVoiceRecording';
import type { Settings } from '../../utils/storage';
import * as audioModule from '../../utils/audio';

describe('useVoiceRecording Hook', () => {
  const mockSettings: Settings = {
    provider: 'gemini',
    apiKey: 'test-gemini-key',
    model: 'gemini-2.5-flash',
    speechInputMode: 'auto'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default idle state', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({
        settings: mockSettings,
        onTranscript: vi.fn(),
        onError: vi.fn()
      })
    );

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
    expect(result.current.recordingSeconds).toBe(0);
  });

  it('triggers AI voice recording when speechInputMode is ai', async () => {
    const mockStart = vi.fn().mockResolvedValue(undefined);
    const mockStop = vi.fn().mockResolvedValue(new Blob(['fake audio'], { type: 'audio/webm' }));
    const mockCancel = vi.fn();

    vi.spyOn(audioModule, 'isMediaRecorderSupported').mockReturnValue(true);
    vi.spyOn(audioModule, 'createAudioRecorder').mockReturnValue({
      start: mockStart,
      stop: mockStop,
      cancel: mockCancel,
      isRecording: () => true,
      getDurationSeconds: () => 5
    });

    vi.spyOn(audioModule, 'transcribeAudioWithAi').mockResolvedValue('Transcribed AI text');

    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecording({
        settings: { ...mockSettings, speechInputMode: 'ai' },
        onTranscript,
        onError: vi.fn()
      })
    );

    // Start recording
    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordingMode).toBe('ai');
    expect(mockStart).toHaveBeenCalledTimes(1);

    // Stop recording and transcribe
    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith('Transcribed AI text');
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
  });

  it('cancels AI voice recording cleanly', async () => {
    const mockStart = vi.fn().mockResolvedValue(undefined);
    const mockCancel = vi.fn();

    vi.spyOn(audioModule, 'isMediaRecorderSupported').mockReturnValue(true);
    vi.spyOn(audioModule, 'createAudioRecorder').mockReturnValue({
      start: mockStart,
      stop: vi.fn(),
      cancel: mockCancel,
      isRecording: () => true,
      getDurationSeconds: () => 3
    });

    const { result } = renderHook(() =>
      useVoiceRecording({
        settings: { ...mockSettings, speechInputMode: 'ai' },
        onTranscript: vi.fn(),
        onError: vi.fn()
      })
    );

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.isRecording).toBe(true);

    act(() => {
      result.current.cancelRecording();
    });

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording).toBe(false);
  });

  it('automatically falls back to AI Voice recording when Web Speech encounters a network error in auto mode', async () => {
    let capturedOnError: ((event: any) => void) | null = null;
    class MockSpeechRecognition {
      continuous = true;
      interimResults = true;
      lang = 'en-US';
      onresult = vi.fn();
      onerror = vi.fn();
      onend = vi.fn();
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        // capture onerror handler
        setTimeout(() => {
          capturedOnError = this.onerror;
        }, 0);
      }
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;

    const mockStartAi = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(audioModule, 'isMediaRecorderSupported').mockReturnValue(true);
    vi.spyOn(audioModule, 'createAudioRecorder').mockReturnValue({
      start: mockStartAi,
      stop: vi.fn(),
      cancel: vi.fn(),
      isRecording: () => true,
      getDurationSeconds: () => 0
    });

    const onError = vi.fn();
    renderHook(() =>
      useVoiceRecording({
        settings: { ...mockSettings, speechInputMode: 'auto' },
        onTranscript: vi.fn(),
        onError
      })
    );

    // Wait a tick for recognition constructor to capture
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    // Simulate async network error event from browser
    await act(async () => {
      if (capturedOnError) {
        capturedOnError({ error: 'network' });
      }
    });

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('Switched to AI Voice Recording')
    );
    expect(mockStartAi).toHaveBeenCalledTimes(1);

    delete (window as any).SpeechRecognition;
  });
});
