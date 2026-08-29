import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Settings } from '../utils/storage';
import {
  createAudioRecorder,
  transcribeAudioWithAi,
  isMediaRecorderSupported,
  isWebSpeechSupported,
  type AudioRecorder
} from '../utils/audio';

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export interface UseVoiceRecordingOptions {
  settings: Settings;
  onTranscript: (transcript: string) => void;
  onError?: (message: React.ReactNode) => void;
}

export function useVoiceRecording({
  settings,
  onTranscript,
  onError
}: UseVoiceRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'webspeech' | 'ai'>('webspeech');
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const speechSupported = isWebSpeechSupported();
  const mediaSupported = isMediaRecorderSupported();
  const isSpeechSupported = speechSupported || mediaSupported;

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const stopTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setRecordingSeconds(0);
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds(prev => prev + 1);
    }, 1000);
  }, [stopTimer]);

  const startAiRecording = useCallback(async () => {
    try {
      const recorder = createAudioRecorder();
      audioRecorderRef.current = recorder;
      await recorder.start();
      setIsRecording(true);
      setRecordingMode('ai');
      startTimer();
    } catch (err: unknown) {
      setIsRecording(false);
      onErrorRef.current?.(err instanceof Error ? err.message : 'Failed to start microphone recording.');
    }
  }, [startTimer]);

  const stopAiRecording = useCallback(async () => {
    stopTimer();
    const recorder = audioRecorderRef.current;
    if (!recorder) {
      setIsRecording(false);
      return;
    }

    setIsRecording(false);
    setIsTranscribing(true);

    try {
      const audioBlob = await recorder.stop();
      audioRecorderRef.current = null;

      const transcription = await transcribeAudioWithAi(audioBlob, settingsRef.current);
      if (transcription) {
        onTranscriptRef.current(transcription);
      } else {
        onErrorRef.current?.('No spoken words were recognized in the recorded audio.');
      }
    } catch (err: unknown) {
      console.error('AI Voice Transcription error:', err);
      onErrorRef.current?.(err instanceof Error ? err.message : 'AI Voice Transcription failed.');
    } finally {
      setIsTranscribing(false);
      setRecordingSeconds(0);
    }
  }, [stopTimer]);

  const cancelAiRecording = useCallback(() => {
    stopTimer();
    if (audioRecorderRef.current) {
      audioRecorderRef.current.cancel();
      audioRecorderRef.current = null;
    }
    setIsRecording(false);
    setIsTranscribing(false);
    setRecordingSeconds(0);
  }, [stopTimer]);

  // Clean up timers & active media on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (audioRecorderRef.current) {
        audioRecorderRef.current.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort?.();
        } catch {
          // ignore
        }
      }
    };
  }, [stopTimer]);

  // Speech recognition API initial setup with automatic async network fallback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => ISpeechRecognition; webkitSpeechRecognition?: new () => ISpeechRecognition }).SpeechRecognition || 
      (window as unknown as { SpeechRecognition?: new () => ISpeechRecognition; webkitSpeechRecognition?: new () => ISpeechRecognition }).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript) {
            onTranscriptRef.current(finalTranscript);
          }
        };

        rec.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error', event);
          setIsRecording(false);

          const currentMode = settingsRef.current.speechInputMode || 'auto';
          const canFallbackToAi = currentMode === 'auto' && isMediaRecorderSupported();

          if (event.error === 'network' || event.error === 'service-not-allowed') {
            if (canFallbackToAi) {
              // Asynchronous Auto Fallback to AI Recording
              onErrorRef.current?.(
                'Native browser speech service unavailable (network error). Switched to AI Voice Recording.'
              );
              startAiRecording();
              return;
            }

            onErrorRef.current?.(
              <div>
                <p className="font-semibold">Browser speech recognition failed with a network error.</p>
                <p className="text-xs mt-1 opacity-90">
                  Google cloud speech services are unreachable. (Brave Browser blocks Google speech services by default; firewalls, ad blockers, or VPNs can also block it).
                </p>
                <p className="text-xs mt-1 text-primary font-medium">
                  {settingsRef.current.apiKey
                    ? 'Tip: You can use AI Voice Mode (Gemini & Whisper) for reliable speech transcription.'
                    : 'Tip: Add a Gemini/OpenAI API key in Settings to use universal AI Voice Transcription.'}
                </p>
              </div>
            );
            return;
          }

          if (event.error === 'not-allowed') {
            onErrorRef.current?.('Microphone access is blocked. Please enable microphone permissions in your browser address bar.');
          } else if (event.error === 'no-speech') {
            onErrorRef.current?.('No speech was detected. Please check your mic and try again.');
          } else if (event.error !== 'aborted') {
            onErrorRef.current?.('Speech recognition failed.');
          }
        };

        rec.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = rec;
      } catch (err) {
        console.warn('Could not initialize SpeechRecognition:', err);
      }
    }
  }, [startAiRecording]);

  const toggleRecording = useCallback(async () => {
    if (isTranscribing) return;

    if (isRecording) {
      if (recordingMode === 'ai') {
        await stopAiRecording();
      } else {
        try {
          recognitionRef.current?.stop();
        } catch {
          // ignore
        }
        setIsRecording(false);
      }
      return;
    }

    const preferredMode = settings.speechInputMode || 'auto';

    // 1. Explicit AI Voice mode
    if (preferredMode === 'ai') {
      if (!mediaSupported) {
        onErrorRef.current?.('Microphone recording is not supported in this browser.');
        return;
      }
      await startAiRecording();
      return;
    }

    // 2. Explicit Browser Native mode
    if (preferredMode === 'browser') {
      if (!speechSupported || !recognitionRef.current) {
        onErrorRef.current?.('Browser speech recognition is not supported in this browser.');
        return;
      }
      try {
        setRecordingMode('webspeech');
        setIsRecording(true);
        recognitionRef.current.start();
      } catch (e) {
        setIsRecording(false);
        onErrorRef.current?.('Failed to start speech recognition: ' + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }

    // 3. Auto mode: Use Web Speech if available, otherwise AI Voice
    if (speechSupported && recognitionRef.current) {
      try {
        setRecordingMode('webspeech');
        setIsRecording(true);
        recognitionRef.current.start();
      } catch {
        if (mediaSupported) {
          await startAiRecording();
        } else {
          setIsRecording(false);
          onErrorRef.current?.('Speech recognition could not be started.');
        }
      }
    } else if (mediaSupported) {
      await startAiRecording();
    } else {
      onErrorRef.current?.('Voice typing is not supported in this browser.');
    }
  }, [isRecording, isTranscribing, mediaSupported, recordingMode, speechSupported, startAiRecording, stopAiRecording, settings.speechInputMode]);

  const cancelRecording = useCallback(() => {
    if (recordingMode === 'ai') {
      cancelAiRecording();
    } else {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
    }
  }, [cancelAiRecording, recordingMode]);

  return {
    isRecording,
    isTranscribing,
    recordingMode,
    recordingSeconds,
    isSpeechSupported,
    toggleRecording,
    cancelRecording,
    startAiRecording,
    stopAiRecording
  };
}
