import React, { useState, useEffect, useRef } from 'react';
import { vectorDb } from '../utils/vectorDb';
import type { VectorDocument } from '../utils/vectorDb';
import { X, Trash2, Plus, Download, Loader2, FileText, Database } from 'lucide-react';

interface RAGPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isRagEnabled: boolean;
  onToggleRag: (enabled: boolean) => void;
  onError: (msg: string) => void;
}

export const RAGPanel: React.FC<RAGPanelProps> = ({
  isOpen,
  onClose,
  isRagEnabled,
  onToggleRag,
  onError
}) => {
  const [documents, setDocuments] = useState<VectorDocument[]>([]);
  const [modelStatus, setModelStatus] = useState<string>('idle');
  const [modelProgress, setModelProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
      const unsubStatus = vectorDb.subscribeStatus(setModelStatus);
      const unsubProgress = vectorDb.subscribeProgress(setModelProgress);
      return () => {
        unsubStatus();
        unsubProgress();
      };
    }
  }, [isOpen]);

  const loadDocuments = async () => {
    try {
      const docs = await vectorDb.getDocuments();
      setDocuments(docs);
    } catch (e) {
      console.error('Failed to load local docs', e);
      onError('Failed to load local document registry.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    // Auto preload model when user selects a file
    if (modelStatus === 'idle') {
      vectorDb.preloadModel();
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Exclude unsupported large binary file extensions
        if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
          throw new Error('Only text-based formats (like .txt, .md, .json) are supported for semantic indexing.');
        }

        const content = await file.text();
        await vectorDb.addDocument(file.name, content);
      }
      
      await loadDocuments();
    } catch (err: any) {
      console.error('File index failed', err);
      onError(err.message || 'Failed to index target document.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await vectorDb.deleteDocument(id);
      await loadDocuments();
    } catch (e) {
      onError('Failed to delete target document.');
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to permanently erase all locally indexed documents?')) {
      try {
        await vectorDb.deleteAllData();
        await loadDocuments();
      } catch (e) {
        onError('Failed to clear database.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md animate-fade-in select-none">
      <div className="glass-panel flex h-[500px] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.015] px-5 py-3.5 bg-slate-950/10">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-brand-500" />
            <h2 className="font-display text-sm font-semibold tracking-wide text-white">Local Semantic Memory (RAG)</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
            aria-label="Close RAG panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Controls */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.03] bg-white/[0.01] p-3">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white">Enable Semantic Context</span>
              <p className="text-[10px] text-slate-500">Inject matching document segments into prompt system prompts automatically.</p>
            </div>
            <button
              onClick={() => onToggleRag(!isRagEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isRagEnabled ? 'bg-brand-500' : 'bg-slate-800'
              }`}
              role="switch"
              aria-checked={isRagEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isRagEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Model Status Section */}
          <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-3 space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-slate-400 uppercase tracking-wider">Embeddings Model Weight</span>
              <span className={`font-bold px-2 py-0.5 rounded-full ${
                modelStatus === 'ready' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : modelStatus === 'loading'
                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                    : modelStatus === 'error'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-slate-800 text-slate-400 border border-white/[0.03]'
              }`}>
                {modelStatus === 'idle' && 'Not Loaded'}
                {modelStatus === 'loading' && 'Downloading...'}
                {modelStatus === 'ready' && 'Ready / Cached'}
                {modelStatus === 'error' && 'Load Failed'}
                {modelStatus === 'embedding' && 'Indexing...'}
              </span>
            </div>

            {modelStatus === 'loading' && (
              <div className="space-y-1">
                <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div 
                    className="h-full bg-brand-500 transition-all duration-300" 
                    style={{ width: `${modelProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] font-bold text-brand-400">
                  <span>DOWNLOADING LOCAL EMBEDDINGS MODEL (~23MB)</span>
                  <span>{modelProgress.toFixed(0)}%</span>
                </div>
              </div>
            )}

            {modelStatus === 'idle' && (
              <button
                type="button"
                onClick={() => vectorDb.preloadModel()}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-brand-500/30 hover:border-brand-500 bg-brand-500/5 hover:bg-brand-500/10 text-[10px] font-semibold text-brand-400 hover:text-brand-300 py-1.5 transition active:scale-98 cursor-pointer select-none"
              >
                <Download className="h-3 w-3" />
                <span>Pre-load local Embeddings Model</span>
              </button>
            )}

            {modelStatus === 'ready' && (
              <p className="text-[9px] text-slate-500 italic text-center font-medium">
                Embeddings model cached in browser memory. Calculations run 100% locally.
              </p>
            )}
          </div>

          {/* Upload Area */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] hover:border-brand-500/30 bg-slate-950/30 p-6 transition duration-300 cursor-pointer"
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            {isUploading ? (
              <div className="text-center space-y-2">
                <Loader2 className="h-5 w-5 text-brand-500 animate-spin mx-auto" />
                <span className="text-[10px] font-semibold text-slate-300 block">Processing & Indexing...</span>
                <span className="text-[8px] text-slate-500 block">Chunking and embedding document on CPU/GPU</span>
              </div>
            ) : (
              <div className="text-center space-y-1.5">
                <Plus className="h-4 w-4 text-slate-500 mx-auto" />
                <span className="text-[10px] font-semibold text-slate-300 block">Upload Documents to Memory</span>
                <span className="text-[8px] text-slate-500 block">Supports .txt, .md, .json up to 5MB</span>
              </div>
            )}
          </div>

          {/* Document list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500 px-1">
              <span>Indexed Documents ({documents.length})</span>
              {documents.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-red-500 hover:text-red-400 hover:underline transition font-bold"
                >
                  Clear All
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="rounded-xl border border-white/[0.02] bg-white/[0.005] p-6 text-center select-none">
                <FileText className="h-5 w-5 text-slate-700 mx-auto mb-1.5" />
                <p className="text-[10px] text-slate-500 italic">No local documents indexed in memory yet.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border border-white/[0.03] bg-white/[0.01] px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0 pr-4">
                      <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <div className="truncate">
                        <span className="font-semibold text-white text-[11px] block truncate">{doc.name}</span>
                        <span className="text-slate-500 text-[8px] block mt-0.5 select-none font-medium">
                          {(doc.size / 1024).toFixed(1)} KB • {doc.chunksCount} chunks
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-red-400 transition"
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
