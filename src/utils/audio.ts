import type { Settings } from './storage';

export interface AudioRecorder {
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
  cancel: () => void;
  isRecording: () => boolean;
  getDurationSeconds: () => number;
}

/**
 * Checks if browser MediaRecorder and getUserMedia are supported
 */
export function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

/**
 * Checks if browser native Web Speech Recognition is available
 */
export function isWebSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
}

/**
 * Convert Blob to Base64 data string (raw base64 or data URL)
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Pick optimal audio MIME type supported by the client browser
 */
export function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/wav'
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

/**
 * Factory to create an AudioRecorder instance using MediaRecorder
 */
export function createAudioRecorder(): AudioRecorder {
  let mediaRecorder: MediaRecorder | null = null;
  let audioStream: MediaStream | null = null;
  let audioChunks: Blob[] = [];
  let startTime = 0;
  let recording = false;

  const cleanup = () => {
    recording = false;
    if (audioStream) {
      audioStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      audioStream = null;
    }
    mediaRecorder = null;
    audioChunks = [];
  };

  return {
    isRecording: () => recording,
    getDurationSeconds: () => (startTime > 0 && recording ? Math.floor((Date.now() - startTime) / 1000) : 0),

    start: async () => {
      if (recording) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser environment.');
      }

      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (err: unknown) {
        const errorName = (err as { name?: string })?.name;
        if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
          throw new Error('Microphone permission was denied. Please allow microphone access in your browser settings.');
        } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
          throw new Error('No microphone device found. Please connect a microphone and try again.');
        }
        throw new Error(`Failed to access microphone: ${(err as Error)?.message || 'Unknown error'}`);
      }

      audioChunks = [];
      const mimeType = getSupportedAudioMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

      try {
        mediaRecorder = new MediaRecorder(audioStream, options);
      } catch {
        mediaRecorder = new MediaRecorder(audioStream);
      }

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.start(250);
      recording = true;
      startTime = Date.now();
    },

    stop: (): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        if (!mediaRecorder || !recording) {
          cleanup();
          return reject(new Error('Recorder is not active.'));
        }

        const currentStream = audioStream;
        const currentRecorder = mediaRecorder;
        const recordMimeType = currentRecorder.mimeType || getSupportedAudioMimeType() || 'audio/webm';

        currentRecorder.onstop = () => {
          try {
            const audioBlob = new Blob(audioChunks, { type: recordMimeType });
            cleanup();
            if (audioBlob.size === 0) {
              reject(new Error('No audio data was recorded.'));
            } else {
              resolve(audioBlob);
            }
          } catch (e) {
            cleanup();
            reject(e);
          }
        };

        try {
          if (currentRecorder.state !== 'inactive') {
            currentRecorder.stop();
          }
          if (currentStream) {
            currentStream.getTracks().forEach(t => t.stop());
          }
        } catch (e) {
          cleanup();
          reject(e);
        }
      });
    },

    cancel: () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch {
          // Ignore stop errors on cancel
        }
      }
      cleanup();
    }
  };
}

/**
 * Transcribe recorded audio Blob using configured AI provider (Gemini multimodal audio or OpenAI Whisper)
 */
export async function transcribeAudioWithAi(
  audioBlob: Blob,
  settings: Settings
): Promise<string> {
  const provider = settings.provider || 'gemini';
  const apiKey = settings.apiKey;

  // 1. Google Gemini Transcription (Multimodal Audio)
  if (provider === 'gemini' && apiKey) {
    const base64Data = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type.split(';')[0] || 'audio/webm';
    const model = settings.model && settings.model.includes('gemini') ? settings.model : 'gemini-2.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            },
            {
              text: 'Transcribe the spoken words in this audio verbatim into clear text. Return ONLY the transcribed words. Do not include introductory notes, timestamps, explanations, or quotes. If no clear speech is heard, return an empty response.'
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.error?.message || `Gemini API returned HTTP ${res.status}`;
      throw new Error(`AI Transcription failed: ${msg}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return candidate.trim();
  }

  // 2. OpenAI / Whisper API & Compatible Endpoints (e.g. OpenAI, Groq)
  if (provider === 'openai' && apiKey) {
    const formData = new FormData();
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('wav') ? 'wav' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
    formData.append('file', audioBlob, `audio.${ext}`);
    const isGroqKey = apiKey.startsWith('gsk_');
    const endpoint = isGroqKey
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions';
    const whisperModel = isGroqKey ? 'whisper-large-v3' : 'whisper-1';
    formData.append('model', whisperModel);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.error?.message || `Whisper API returned HTTP ${res.status}`;
      throw new Error(`AI Transcription failed: ${msg}`);
    }

    const data = await res.json();
    return (data.text || '').trim();
  }

  // 3. Fallback across all configured profiles for audio-capable providers
  if (settings.profiles && settings.profiles.length > 0) {
    const supportedProviders = ['gemini', 'openai'] as const;
    for (const targetProvider of supportedProviders) {
      const matchedProfile = settings.profiles.find(p => p.provider === targetProvider && p.apiKey);
      if (matchedProfile) {
        return transcribeAudioWithAi(audioBlob, {
          ...settings,
          provider: targetProvider,
          apiKey: matchedProfile.apiKey,
          model: matchedProfile.model || (targetProvider === 'gemini' ? 'gemini-2.5-flash' : 'whisper-1')
        });
      }
    }
  }

  throw new Error(
    `AI Voice Transcription requires an active Gemini or OpenAI API key. Please add your API key in Settings, or configure browser speech recognition.`
  );
}
