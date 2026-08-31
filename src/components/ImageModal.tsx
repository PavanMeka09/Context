import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, Copy, Check, ExternalLink, Image as ImageIcon } from 'lucide-react';

export interface ImagePreviewItem {
  src: string;
  alt?: string;
  title?: string;
}

export interface ImageModalProps {
  isOpen: boolean;
  image?: ImagePreviewItem | null;
  src?: string | null;
  alt?: string;
  title?: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  image,
  src: legacySrc,
  alt: legacyAlt,
  title: legacyTitle,
  onClose
}) => {
  const activeSrc = image?.src || legacySrc || null;
  const activeAlt = image?.alt ?? legacyAlt;
  const activeTitle = image?.title ?? legacyTitle;

  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const prevSrcRef = useRef<string | null>(null);

  // Track image src changes to reset state
  if (activeSrc !== prevSrcRef.current) {
    prevSrcRef.current = activeSrc;
    if (activeSrc) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsLoading(true);
      setHasError(false);
      setCopied(false);
    }
  }

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(Number((prev + 0.25).toFixed(2)), 3.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const next = Math.max(Number((prev - 0.25).toFixed(2)), 0.5);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleToggleZoom = useCallback(() => {
    setZoom(prev => (prev === 1 ? 2 : 1));
    setPosition({ x: 0, y: 0 });
  }, []);

  // Handle keyboard events (Escape to close, +/- to zoom, 0/r to reset)
  useEffect(() => {
    if (!isOpen || !activeSrc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0' || e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeSrc, onClose, handleZoomIn, handleZoomOut, handleResetZoom]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen && activeSrc) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, activeSrc]);

  // Mouse wheel zoom support
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }, [handleZoomIn, handleZoomOut]);

  // Drag / pan support when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = () => {
    if (!activeSrc) return;
    try {
      const a = document.createElement('a');
      a.href = activeSrc;
      const fileName = activeTitle || activeAlt || 'image.png';
      a.download = fileName.includes('.') ? fileName : `${fileName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download image', err);
    }
  };

  const handleCopy = async () => {
    if (!activeSrc) return;
    try {
      if (activeSrc.startsWith('data:image/')) {
        // For base64 data URL, convert to Blob and write to clipboard
        const res = await fetch(activeSrc);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
      } else {
        await navigator.clipboard.writeText(activeSrc);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(activeSrc);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy image', err);
      }
    }
  };

  const handleOpenNewTab = () => {
    if (!activeSrc) return;
    window.open(activeSrc, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen || !activeSrc) return null;

  const displayTitle = activeTitle || activeAlt || 'Image Preview';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background/85 backdrop-blur-md p-3 sm:p-6 animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Clickable Backdrop overlay */}
      <div
        className="fixed inset-0 -z-10 cursor-zoom-out"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Top Header Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between gap-3 bg-card/90 border border-border px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-sm z-10">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
            <ImageIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-foreground truncate max-w-xs sm:max-w-md md:max-w-lg leading-tight">
              {displayTitle}
            </span>
            {activeAlt && activeTitle && activeAlt !== activeTitle && (
              <span className="text-[10px] text-muted-foreground truncate max-w-xs sm:max-w-md">
                {activeAlt}
              </span>
            )}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Zoom Controls */}
          <div className="flex items-center rounded-lg bg-muted/60 border border-border p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Reset zoom (0)"
              aria-label="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 3.5}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {zoom !== 1 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
              title="Fit to screen (R)"
              aria-label="Fit to screen"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}

          <div className="h-4 w-[1px] bg-border mx-0.5" />

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-border bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            title="Copy image or link"
            aria-label="Copy image"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-primary font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-[11px]">Copy</span>
              </>
            )}
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-border bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            title="Download image"
            aria-label="Download image"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[11px]">Save</span>
          </button>

          {/* Open in New Tab Button */}
          {!activeSrc.startsWith('data:') && (
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
              title="Open in new tab"
              aria-label="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}

          <div className="h-4 w-[1px] bg-border mx-0.5" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
            title="Close modal (Esc)"
            aria-label="Close image modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Image Viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative my-auto flex items-center justify-center w-full max-w-5xl h-[72vh] sm:h-[78vh] overflow-hidden select-none rounded-2xl border border-border/80 bg-card/60 shadow-2xl backdrop-blur-sm ${
          zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
      >
        {/* Loading Spinner */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50 backdrop-blur-xs">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-xs font-medium text-muted-foreground">Loading image...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {hasError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 text-muted-foreground/50 mb-1" />
            <span className="text-sm font-semibold text-foreground">Unable to load image</span>
            <span className="text-xs text-muted-foreground max-w-sm">
              The image source could not be resolved or displayed.
            </span>
          </div>
        ) : (
          <img
            src={activeSrc}
            alt={activeAlt || activeTitle || 'Enlarged Preview'}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            onDoubleClick={handleToggleZoom}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
            className="max-w-full max-h-full object-contain rounded-lg pointer-events-auto"
            draggable={false}
          />
        )}
      </div>

      {/* Bottom Information & Shortcut Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between text-[11px] text-muted-foreground px-2 pt-1">
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline font-mono text-[10px]">
            Double-click to {zoom === 1 ? 'zoom in' : 'reset'}
          </span>
          {zoom > 1 && (
            <span className="text-primary font-medium text-[10px]">
              Drag to pan
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/60 text-foreground text-[9px]">Esc</kbd>
          <span>to close</span>
        </div>
      </div>
    </div>
  );
};
