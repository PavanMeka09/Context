/* eslint-disable @typescript-eslint/no-explicit-any */
let worker: Worker | null = null;
const statusListeners = new Set<(status: string) => void>();
const progressListeners = new Set<(progress: number) => void>();
let currentStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'transcribing' | 'error'
let currentProgress = 0;

let activeResolve: ((text: string) => void) | null = null;
let activeReject: ((err: any) => void) | null = null;

// Audio capture states
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

function getWorker(): Worker {
  if (worker) return worker;

  // Initialize worker using Vite's native module URL support
  worker = new Worker(
    new URL('./whisper.worker.ts', import.meta.url),
    { type: 'module' }
  );

  worker.onmessage = (event) => {
    const { type, status, progress, text, error } = event.data;

    if (type === 'status') {
      currentStatus = status;
      statusListeners.forEach(listener => listener(status));
    } else if (type === 'progress') {
      currentProgress = progress;
      progressListeners.forEach(listener => listener(progress));
    } else if (type === 'result') {
      currentStatus = 'ready';
      statusListeners.forEach(listener => listener('ready'));
      if (activeResolve) {
        activeResolve(text);
        activeResolve = null;
        activeReject = null;
      }
    } else if (type === 'error') {
      currentStatus = 'error';
      statusListeners.forEach(listener => listener('error'));
      if (activeReject) {
        activeReject(new Error(error));
        activeResolve = null;
        activeReject = null;
      }
    }
  };

  return worker;
}

async function convertBlobTo16kHzFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  // Resample to 16000Hz mono using OfflineAudioContext
  const targetSampleRate = 16000;
  const numberOfChannels = 1; // mono
  const duration = audioBuffer.duration;
  
  const offlineCtx = new OfflineAudioContext(
    numberOfChannels,
    Math.ceil(duration * targetSampleRate),
    targetSampleRate
  );

  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start();

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0);
}

export const localSpeech = {
  getStatus(): string {
    return currentStatus;
  },

  getProgress(): number {
    return currentProgress;
  },

  subscribeStatus(listener: (status: string) => void): () => void {
    statusListeners.add(listener);
    listener(currentStatus);
    return () => {
      statusListeners.delete(listener);
    };
  },

  subscribeProgress(listener: (progress: number) => void): () => void {
    progressListeners.add(listener);
    listener(currentProgress);
    return () => {
      progressListeners.delete(listener);
    };
  },

  preloadModel(): void {
    const w = getWorker();
    w.postMessage({ type: 'load' });
  },

  async transcribe(audioBuffer: Float32Array): Promise<string> {
    const w = getWorker();
    return new Promise((resolve, reject) => {
      activeResolve = resolve;
      activeReject = reject;
      w.postMessage({ type: 'transcribe', data: audioBuffer });
    });
  },

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Fallback to default options if audio/webm is not supported
    const options = MediaRecorder.isTypeSupported('audio/webm')
      ? { mimeType: 'audio/webm' }
      : undefined;

    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start();
  },

  async stopRecording(): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder) {
        reject(new Error('No active recording found. Did you start recording?'));
        return;
      }

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
          
          // Release microphone hardware resources immediately
          if (mediaRecorder?.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
          }
          mediaRecorder = null;
          
          const float32Audio = await convertBlobTo16kHzFloat32(audioBlob);
          resolve(float32Audio);
        } catch (err) {
          reject(err);
        }
      };

      mediaRecorder.stop();
    });
  }
};
