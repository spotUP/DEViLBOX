/**
 * WebSocket Relay — bridges MCP tool calls to the browser.
 *
 * Starts a WS server on port 4003. The browser connects as a client.
 * Each tool call is sent as a BridgeRequest with a UUID correlation ID,
 * and the relay waits for the matching BridgeResponse (10s timeout).
 */

import { randomUUID } from 'crypto';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { BridgeRequest, BridgeResponse } from './protocol';

const PORT = Number(process.env.MCP_BRIDGE_PORT ?? 4003);
const TIMEOUT_MS = 10_000;

type PendingResolve = (response: BridgeResponse) => void;

let browserSocket: WebSocket | null = null;
const pending = new Map<string, PendingResolve>();

let server: http.Server;
let wss: WebSocketServer;

export function startRelay(): void {
  server = http.createServer();
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    // Only allow one browser connection at a time
    if (browserSocket && browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.close();
    }
    browserSocket = ws;
    console.error('[mcp-bridge] Browser connected');

    ws.on('message', (data) => {
      let msg: BridgeResponse;
      try {
        msg = JSON.parse(data.toString()) as BridgeResponse;
      } catch {
        return;
      }

      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg);
      }
    });

    ws.on('close', () => {
      console.error('[mcp-bridge] Browser disconnected');
      if (browserSocket === ws) browserSocket = null;
      // Reject all pending requests
      for (const [id, resolve] of pending) {
        resolve({ id, type: 'error', error: 'Browser disconnected' });
      }
      pending.clear();
    });

    ws.on('error', (err) => {
      console.error('[mcp-bridge] WebSocket error:', err.message);
    });
  });

  server.listen(PORT, () => {
    console.error(`[mcp-bridge] WebSocket relay listening on ws://localhost:${PORT}`);
  });
}

export function isConnected(): boolean {
  return browserSocket !== null && browserSocket.readyState === WebSocket.OPEN;
}

/**
 * Send a method call to the browser and wait for the response.
 * Throws if no browser is connected or the call times out.
 */
export function callBrowser(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!isConnected()) {
      reject(new Error('No browser connected. Start DEViLBOX and open it in a browser.'));
      return;
    }

    const id = randomUUID();
    const request: BridgeRequest = { id, type: 'call', method, params };

    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Bridge call '${method}' timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    pending.set(id, (response: BridgeResponse) => {
      clearTimeout(timer);
      if (response.type === 'error') {
        reject(new Error(response.error ?? 'Unknown bridge error'));
      } else {
        resolve(response.data);
      }
    });

    browserSocket!.send(JSON.stringify(request));
  });
}
