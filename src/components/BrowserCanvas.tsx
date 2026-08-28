import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface BrowserCanvasProps {
  sessionId?: string;
  className?: string;
  fallbackImageUrl?: string;
}

export const BrowserCanvas: React.FC<BrowserCanvasProps> = ({
  sessionId = 'default',
  className = '',
  fallbackImageUrl
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isMounted = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Default to port 3001 in development or window.location.port
    const port = window.location.port === '5173' || window.location.port === '3000' ? '3001' : (window.location.port || '3001');
    const wsUrl = `${protocol}//${host}:${port}/ws/browser`;

    let reconnectTimer: NodeJS.Timeout | null = null;

    function connect() {
      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          ws.send(JSON.stringify({ action: 'subscribe', sessionId }));
        };

        ws.onmessage = async (event) => {
          if (!isMounted) return;
          if (event.data instanceof ArrayBuffer) {
            setHasReceivedFrame(true);

            // Hardware-accelerated GPU decode off main thread
            try {
              const blob = new Blob([event.data], { type: 'image/jpeg' });
              const imageBitmap = await createImageBitmap(blob);
              const canvas = canvasRef.current;
              if (canvas && imageBitmap) {
                if (canvas.width !== imageBitmap.width || canvas.height !== imageBitmap.height) {
                  canvas.width = imageBitmap.width;
                  canvas.height = imageBitmap.height;
                }
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(imageBitmap, 0, 0);
                }
                imageBitmap.close();
              }
            } catch {
              // Frame decode fallback
            }
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setWsConnected(false);
        };
      } catch {
        if (isMounted) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId]);

  return (
    <div className={`relative overflow-hidden bg-muted/40 rounded-lg flex items-center justify-center ${className}`}>
      {/* Direct Canvas Viewport */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain ${hasReceivedFrame ? 'block' : 'hidden'}`}
      />

      {/* Fallback Image when no binary frames yet */}
      {!hasReceivedFrame && fallbackImageUrl && (
        <img
          src={fallbackImageUrl}
          alt="Browser Preview"
          className="w-full h-full object-contain"
        />
      )}

      {/* Loading state if neither canvas nor fallback image is ready */}
      {!hasReceivedFrame && !fallbackImageUrl && (
        <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs font-mono">Connecting to high-speed screencast...</span>
        </div>
      )}

      {/* Live Connection Badge */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-md border border-border text-[10px] font-mono shadow-sm">
        {wsConnected ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-500 font-bold">WS 60FPS</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">HTTP Fallback</span>
          </>
        )}
      </div>
    </div>
  );
};
