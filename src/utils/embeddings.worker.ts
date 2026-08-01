/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers';

// Disable local models to fetch from HuggingFace Hub
env.allowLocalModels = false;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
let extractor: any = null;
let extractorPromise: Promise<any> | null = null;

async function getExtractor(progress_callback?: (progress: number) => void) {
  if (extractor) return extractor;
  if (extractorPromise) return extractorPromise;

  extractorPromise = pipeline('feature-extraction', MODEL_NAME, {
    progress_callback: (data: any) => {
      if (data.status === 'progress') {
        progress_callback?.(data.progress);
      }
    }
  }).then((loadedExtractor) => {
    extractor = loadedExtractor;
    return extractor;
  }).catch((err) => {
    extractorPromise = null;
    throw err;
  });

  return extractorPromise;
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
      
      let embedding;
      if (Array.isArray(text)) {
        const dims = output.dims; // e.g. [batchSize, embeddingSize]
        const batchSize = dims[0];
        const embeddingSize = dims[1];
        const data = output.data;
        const embeddings = [];
        for (let i = 0; i < batchSize; i++) {
          const start = i * embeddingSize;
          const end = start + embeddingSize;
          embeddings.push(Array.from(data.subarray(start, end)));
        }
        embedding = embeddings;
      } else {
        embedding = Array.from(output.data);
      }

      self.postMessage({ type: 'result', id, embedding });
    } catch (err: any) {
      console.error('Embeddings worker error during extraction:', err);
      self.postMessage({ type: 'error', id, error: err.message || 'Failed to generate embedding.' });
    }
  }
});
