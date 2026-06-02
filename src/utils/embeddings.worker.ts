/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers';

// Disable local models to fetch from HuggingFace Hub
env.allowLocalModels = false;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
let extractor: any = null;

async function getExtractor(progress_callback?: (progress: number) => void) {
  if (extractor) return extractor;

  extractor = await pipeline('feature-extraction', MODEL_NAME, {
    progress_callback: (data: any) => {
      if (data.status === 'progress') {
        progress_callback?.(data.progress);
      }
    }
  });

  return extractor;
}

self.addEventListener('message', async (event) => {
  const { type, text, id } = event.data;

  if (type === 'load') {
    try {
      self.postMessage({ type: 'status', status: 'loading' });
      await getExtractor((progress) => {
        self.postMessage({ type: 'progress', progress });
      });
      self.postMessage({ type: 'status', status: 'ready' });
    } catch (err: any) {
      console.error('Embeddings worker error loading model:', err);
      self.postMessage({ type: 'error', error: err.message || 'Failed to load embeddings model.' });
    }
  }

  if (type === 'embed') {
    try {
      if (!extractor) {
        self.postMessage({ type: 'status', status: 'loading' });
        await getExtractor((progress) => {
          self.postMessage({ type: 'progress', progress });
        });
      }

      self.postMessage({ type: 'status', status: 'embedding' });

      // Generate embedding with mean pooling and unit-length normalization
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);

      self.postMessage({ type: 'result', id, embedding });
    } catch (err: any) {
      console.error('Embeddings worker error during extraction:', err);
      self.postMessage({ type: 'error', id, error: err.message || 'Failed to generate embedding.' });
    }
  }
});
