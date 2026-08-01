/* eslint-disable @typescript-eslint/no-explicit-any */
export interface VectorDocument {
  id: string;
  name: string;
  category?: string;
  size: number;
  addedAt: string;
  content: string;
  chunksCount: number;
}

export interface VectorChunk {
  id: string;
  docId: string;
  docName: string;
  category?: string;
  text: string;
  embedding: number[];
}

let worker: Worker | null = null;
const statusListeners = new Set<(status: string) => void>();
const progressListeners = new Set<(progress: number) => void>();
let currentStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'embedding' | 'error'
let currentProgress = 0;

const pendingPromises = new Map<string, { resolve: (embedding: any) => void; reject: (err: any) => void }>();

// Reactive in-memory vector cache
let cachedChunks: VectorChunk[] | null = null;

async function ensureChunksCached(): Promise<VectorChunk[]> {
  if (cachedChunks !== null) {
    return cachedChunks;
  }
  const db = await getDb();
  cachedChunks = await new Promise<VectorChunk[]>((resolve, reject) => {
    const tx = db.transaction('chunks', 'readonly');
    const store = tx.objectStore('chunks');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  return cachedChunks!;
}

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
export function chunkText(text: string, maxChunkLength = 600): string[] {
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

// Lightweight BM25 / keyword term overlap scoring utility
export function computeKeywordScore(query: string, text: string): number {
  const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, ' ');
  const queryTerms = normalize(query).split(/\s+/).filter(t => t.length > 1);
  if (queryTerms.length === 0) return 0;
  
  const docText = normalize(text);
  const docWords = docText.split(/\s+/);
  const totalWords = docWords.length || 1;
  
  let totalScore = 0;
  for (const term of queryTerms) {
    const matches = docWords.filter(w => w === term || w.includes(term)).length;
    if (matches > 0) {
      totalScore += (matches / totalWords) * (term.length > 4 ? 1.5 : 1.0);
    }
  }
  return totalScore;
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

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const w = getWorker();
    const id = `embed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return new Promise((resolve, reject) => {
      pendingPromises.set(id, { resolve, reject });
      w.postMessage({ type: 'embed', text: texts, id });
    });
  },

  async addDocument(name: string, content: string, category: string = 'General'): Promise<void> {
    const db = await getDb();
    const docId = `doc-${Date.now()}`;
    const chunks = chunkText(content);
    
    // 1. Create document entry
    const doc: VectorDocument = {
      id: docId,
      name,
      category,
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

    // 2. Generate embeddings in parallel batches
    const computedChunks: VectorChunk[] = [];
    const batchSize = 16;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      try {
        const embeddings = await this.embedTexts(batch);
        for (let index = 0; index < batch.length; index++) {
          const chunkIndex = i + index;
          if (embeddings[index]) {
            computedChunks.push({
              id: `${docId}-chunk-${chunkIndex}`,
              docId,
              docName: name,
              category,
              text: batch[index],
              embedding: embeddings[index]
            });
          }
        }
      } catch (err) {
        console.error(`Failed to index batch starting at ${i} of document ${name}:`, err);
      }
    }

    // 3. Save all computed chunks to IndexedDB in a single readwrite transaction
    if (computedChunks.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chunks', 'readwrite');
        const store = tx.objectStore('chunks');
        
        for (const chunk of computedChunks) {
          store.put(chunk);
        }
        
        tx.oncomplete = () => {
          if (cachedChunks !== null) {
            cachedChunks.push(...computedChunks);
          }
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
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
    const chunks = await ensureChunksCached();

    // Open a single readwrite transaction to batch delete matching chunks
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    for (const chunk of chunks) {
      if (chunk.docId === docId) {
        store.delete(chunk.id);
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Update cache
    if (cachedChunks !== null) {
      cachedChunks = cachedChunks.filter(c => c.docId !== docId);
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
    cachedChunks = [];
  },

  // Perform Hybrid (Vector + BM25 Keyword via RRF) Search
  async searchHybridChunks(
    query: string,
    options: { limit?: number; minScore?: number; category?: string; mode?: 'hybrid' | 'vector' | 'keyword' } = {}
  ): Promise<Array<{ chunk: VectorChunk; score: number; matchType?: string }>> {
    const { limit = 4, minScore = 0.0, category, mode = 'hybrid' } = options;
    const allChunks = await ensureChunksCached();

    if (allChunks.length === 0) return [];

    let chunks = allChunks;
    if (category && category !== 'All') {
      chunks = chunks.filter(c => c.category === category);
    }

    if (chunks.length === 0) return [];

    // Vector Similarity
    let queryEmbedding: number[] = [];
    if (mode !== 'keyword') {
      try {
        queryEmbedding = await this.embedText(query);
      } catch (err) {
        console.warn('Vector embedding failed for query, falling back to keyword search', err);
      }
    }

    const vectorScores: Array<{ chunk: VectorChunk; score: number }> = [];
    const keywordScores: Array<{ chunk: VectorChunk; score: number }> = [];

    for (const chunk of chunks) {
      if (queryEmbedding.length > 0) {
        let dotProduct = 0;
        for (let i = 0; i < queryEmbedding.length; i++) {
          dotProduct += queryEmbedding[i] * chunk.embedding[i];
        }
        vectorScores.push({ chunk, score: dotProduct });
      }
      if (mode !== 'vector') {
        const kwScore = computeKeywordScore(query, chunk.text + ' ' + chunk.docName);
        keywordScores.push({ chunk, score: kwScore });
      }
    }

    if (mode === 'vector' || (mode === 'hybrid' && keywordScores.length === 0)) {
      return vectorScores
        .sort((a, b) => b.score - a.score)
        .filter(r => r.score >= minScore)
        .slice(0, limit)
        .map(r => ({ ...r, matchType: 'vector' }));
    }

    if (mode === 'keyword') {
      return keywordScores
        .sort((a, b) => b.score - a.score)
        .filter(r => r.score >= minScore)
        .slice(0, limit)
        .map(r => ({ ...r, matchType: 'keyword' }));
    }

    // Hybrid Reciprocal Rank Fusion (RRF)
    const vectorRankMap = new Map<string, number>();
    vectorScores.sort((a, b) => b.score - a.score).forEach((item, idx) => {
      vectorRankMap.set(item.chunk.id, idx + 1);
    });

    const keywordRankMap = new Map<string, number>();
    keywordScores.sort((a, b) => b.score - a.score).forEach((item, idx) => {
      keywordRankMap.set(item.chunk.id, idx + 1);
    });

    const combined = chunks.map(chunk => {
      const vRank = vectorRankMap.get(chunk.id) || 1000;
      const kRank = keywordRankMap.get(chunk.id) || 1000;
      const vScore = vectorScores.find(s => s.chunk.id === chunk.id)?.score || 0;
      const rrfScore = (1 / (60 + vRank)) + (1 / (60 + kRank));
      // Blend RRF score and raw cosine similarity
      const finalScore = Math.min(1.0, (rrfScore * 25) + (vScore * 0.5));
      return { chunk, score: finalScore, matchType: 'hybrid' };
    });

    return combined
      .sort((a, b) => b.score - a.score)
      .filter(r => r.score >= minScore)
      .slice(0, limit);
  },

  // Perform Similarity Search over all chunks
  async searchSimilarChunks(query: string, limit = 4): Promise<Array<{ chunk: VectorChunk; score: number }>> {
    return this.searchHybridChunks(query, { limit, mode: 'hybrid' });
  },

  async exportDatabaseJSON(): Promise<{ version: number; documents: VectorDocument[]; chunks: VectorChunk[] }> {
    const docs = await this.getDocuments();
    const chunks = await ensureChunksCached();
    return {
      version: 1,
      documents: docs,
      chunks
    };
  },

  async importDatabaseJSON(data: { version?: number; documents?: VectorDocument[]; chunks?: VectorChunk[] }): Promise<void> {
    if (!data || !Array.isArray(data.documents) || !Array.isArray(data.chunks)) {
      throw new Error('Invalid database backup format. Must contain documents and chunks arrays.');
    }
    const db = await getDb();
    const tx = db.transaction(['documents', 'chunks'], 'readwrite');
    const docStore = tx.objectStore('documents');
    const chunkStore = tx.objectStore('chunks');

    for (const doc of data.documents) {
      if (doc && doc.id) docStore.put(doc);
    }
    for (const chunk of data.chunks) {
      if (chunk && chunk.id && chunk.docId) chunkStore.put(chunk);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    cachedChunks = null; // Invalidate cache to reload from DB
    await ensureChunksCached();
  }
};

