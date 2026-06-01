import { pipeline, env } from '@huggingface/transformers';

// Set environment configurations
env.allowLocalModels = false;

// We use the whisper-tiny.en model for extremely fast and high-quality local English transcription
const MODEL_NAME = 'onnx-community/whisper-tiny.en';
let transcriber: any = null;

async function getTranscriber(progress_callback?: (progress: number) => void) {
  if (transcriber) return transcriber;

  transcriber = await pipeline('automatic-speech-recognition', MODEL_NAME, {
    dtype: 'fp32',
    progress_callback: (data: any) => {
      if (data.status === 'progress') {
        progress_callback?.(data.progress);
      }
    }
  });

  return transcriber;
}

// Listen to message events from the main thread
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  if (type === 'load') {
    try {
      self.postMessage({ type: 'status', status: 'loading' });
      await getTranscriber((progress) => {
        self.postMessage({ type: 'progress', progress });
      });
      self.postMessage({ type: 'status', status: 'ready' });
    } catch (err: any) {
      console.error('Worker error loading model:', err);
      self.postMessage({ type: 'error', error: err.message || 'Failed to load Whisper model.' });
    }
  }

  if (type === 'transcribe') {
    try {
      if (!transcriber) {
        self.postMessage({ type: 'status', status: 'loading' });
        await getTranscriber((progress) => {
          self.postMessage({ type: 'progress', progress });
        });
      }

      self.postMessage({ type: 'status', status: 'transcribing' });
      
      const audioData = data; // This should be a Float32Array containing 16kHz mono audio
      
      const response = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      self.postMessage({ type: 'result', text: response.text });
    } catch (err: any) {
      console.error('Worker error during transcription:', err);
      self.postMessage({ type: 'error', error: err.message || 'Failed to transcribe audio.' });
    }
  }
});
