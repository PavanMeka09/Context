export interface VectorDocument {
  id: string;
  name: string;
  size: number;
  addedAt: string;
  content: string;
  chunksCount: number;
}

export interface VectorChunk {
  id: string;
  docId: string;
  docName: string;
  text: string;
  embedding: number[];
}

let worker: Worker | null = null;
const statusListeners = new Set<(status: string) => void>();
const progressListeners = new Set<(progress: number) => void>();
let currentStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'embedding' | 'error'
let currentProgress = 0;

const pendingPromises = new Map<string, { resolve: (embedding: number[]) => void; reject: (err: any) => void }>();

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(
    new URL('./embeddings.worker.ts', import.meta.url),
    { type: 'module' }
  );

  worker.onmessage = (event) => {
    const { type, status, progress, id, embedding, error } = event.data;

    if (type === 'status') {
      currentStatus = status;
      statusListeners.forEach(l => l(status));
    } else if (type === 'progress') {
      currentProgress = progress;
      progressListeners.forEach(l => l(progress));
    } else if (type === 'result') {
      currentStatus = 'ready';
      statusListeners.forEach(l => l('ready'));
      const promise = pendingPromises.get(id);
      if (promise) {
        promise.resolve(embedding);
        pendingPromises.delete(id);
      }
    } else if (type === 'error') {
      currentStatus = 'error';
      statusListeners.forEach(l => l('error'));
      if (id) {
        const promise = pendingPromises.get(id);
        if (promise) {
          promise.reject(new Error(error));
          pendingPromises.delete(id);
        }
      }
    }
  };

  return worker;
}

// Simple browser IndexedDB manager for local vector storage
const DB_NAME = 'context_rag_db';
const DB_VERSION = 1;

function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Simple chunking utility (splits by paragraphs, with overlap)
function chunkText(text: string, maxChunkLength = 600): string[] {
  const paragraphs = text.split(/\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const cleanPara = para.trim();
    if (!cleanPara) continue;

    if ((currentChunk + ' ' + cleanPara).length <= maxChunkLength) {
      currentChunk = currentChunk ? currentChunk + '\n' + cleanPara : cleanPara;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      // Handle very long paragraphs by splitting by sentences
      if (cleanPara.length > maxChunkLength) {
        const sentences = cleanPara.match(/[^.!?]+[.!?]+(\s|$)/g) || [cleanPara];
        let subChunk = '';
        for (const sentence of sentences) {
          if ((subChunk + ' ' + sentence).length <= maxChunkLength) {
            subChunk = subChunk ? subChunk + ' ' + sentence : sentence;
          } else {
            if (subChunk) chunks.push(subChunk);
            // standard overlap logic
            subChunk = sentence;
          }
        }
        currentChunk = subChunk;
      } else {
        currentChunk = cleanPara;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

export const vectorDb = {
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

  async embedText(text: string): Promise<number[]> {
    const w = getWorker();
    const id = `embed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return new Promise((resolve, reject) => {
      pendingPromises.set(id, { resolve, reject });
      w.postMessage({ type: 'embed', text, id });
    });
  },

  async addDocument(name: string, content: string): Promise<void> {
    const db = await getDb();
    const docId = `doc-${Date.now()}`;
    const chunks = chunkText(content);
    
    // 1. Create document entry
    const doc: VectorDocument = {
      id: docId,
      name,
      size: content.length,
      addedAt: new Date().toISOString(),
      content,
      chunksCount: chunks.length
    };

    // Save Document metadata
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 2. Generate embeddings & save chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      try {
        const embedding = await this.embedText(chunkText);
        const chunk: VectorChunk = {
          id: `${docId}-chunk-${i}`,
          docId,
          docName: name,
          text: chunkText,
          embedding
        };

        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('chunks', 'readwrite');
          tx.objectStore('chunks').put(chunk);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.error(`Failed to index chunk ${i} of document ${name}:`, err);
      }
    }
  },

  async getDocuments(): Promise<VectorDocument[]> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteDocument(docId: string): Promise<void> {
    const db = await getDb();
    
    // Delete Document metadata
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Delete associated chunks
    const chunks = await new Promise<VectorChunk[]>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const store = tx.objectStore('chunks');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    for (const chunk of chunks) {
      if (chunk.docId === docId) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('chunks', 'readwrite');
          tx.objectStore('chunks').delete(chunk.id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
  },

  async deleteAllData(): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['documents', 'chunks'], 'readwrite');
      tx.objectStore('documents').clear();
      tx.objectStore('chunks').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Perform Similarity Search over all chunks
  async searchSimilarChunks(query: string, limit = 4): Promise<Array<{ chunk: VectorChunk; score: number }>> {
    const db = await getDb();
    
    // 1. Get query embedding
    const queryEmbedding = await this.embedText(query);

    // 2. Fetch all chunks
    const chunks = await new Promise<VectorChunk[]>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const store = tx.objectStore('chunks');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    if (chunks.length === 0) return [];

    // 3. Compute Cosine Similarity (Dot product because embeddings are unit normalized)
    const results = chunks.map(chunk => {
      let dotProduct = 0;
      for (let i = 0; i < queryEmbedding.length; i++) {
        dotProduct += queryEmbedding[i] * chunk.embedding[i];
      }
      return { chunk, score: dotProduct };
    });

    // 4. Sort and return top matches
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
};
