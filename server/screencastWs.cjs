/**
 * Ultra-Fast Binary Screencast WebSocket Handler for Context AI
 * Pipes raw frame buffers directly to connected frontend clients at up to 60 FPS
 */

const { WebSocketServer } = require('ws');
const { sessions } = require('./browser.cjs');

let wss = null;
const clientSubscriptions = new Map(); // ws -> sessionId

function initWebSocketServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws/browser' });

  wss.on('connection', (ws, req) => {
    // Default subscription
    clientSubscriptions.set(ws, 'default');

    ws.on('message', (message, isBinary) => {
      if (isBinary) return;
      try {
        const payload = JSON.parse(message.toString());
        if (payload.action === 'subscribe') {
          clientSubscriptions.set(ws, payload.sessionId || 'default');
          // Immediately send latest frame if available
          sendLatestFrameToClient(ws, payload.sessionId || 'default');
        } else if (payload.action === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (e) {
        // Invalid JSON ignored
      }
    });

    ws.on('close', () => {
      clientSubscriptions.delete(ws);
    });

    ws.on('error', () => {
      clientSubscriptions.delete(ws);
    });
  });

  console.log('[WebSocket Server] Browser screencast WebSocket initialized at /ws/browser');
  return wss;
}

function sendLatestFrameToClient(ws, sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.latestScreenshotBuffer && ws.readyState === ws.OPEN) {
    try {
      // Send binary frame directly with header prefix
      ws.send(session.latestScreenshotBuffer);
    } catch (e) {}
  }
}

/**
 * Broadcast binary screenshot buffer to all clients subscribed to sessionId
 */
function broadcastBinaryFrame(sessionId, buffer) {
  if (!wss || !buffer) return;

  for (const [ws, subscribedId] of clientSubscriptions.entries()) {
    if (subscribedId === sessionId && ws.readyState === ws.OPEN) {
      try {
        ws.send(buffer);
      } catch (e) {
        clientSubscriptions.delete(ws);
      }
    }
  }
}

module.exports = {
  initWebSocketServer,
  broadcastBinaryFrame
};
