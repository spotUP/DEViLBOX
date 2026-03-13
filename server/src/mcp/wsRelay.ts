/**
 * WebSocket Relay — bridges MCP tool calls to the browser.
 *
 * Three-party message broker:
 * 1. EXPRESS (server mode): Starts WS server on port 4003. Can call browser
 *    directly via callBrowser() for its own MCP tools.
 * 2. BROWSER: Connects as WS client to port 4003 (no path). Receives
 *    BridgeRequests, executes handlers, sends back BridgeResponses.
 * 3. MCP SUBPROCESS: Claude CLI spawns an MCP server subprocess which
 *    connects to ws://localhost:4003/mcp. Its BridgeRequests are forwarded
 *    to the browser, and responses are routed back.
 *
 * CLIENT mode: If port 4003 is already taken, connects as a WS client
 * (used by MCP subprocess when Express already owns the port).
 *
 * ⚠️  RACE CONDITION: Both Express (server/src/index.ts) and the MCP
 * subprocess (server/src/mcp/index.ts) call startRelay(). Whichever starts
 * first owns port 4003 in SERVER mode; the other falls back to CLIENT mode.
 * CORRECT order: Express starts first (owns 4003), MCP subprocess starts
 * second (client mode). If Express restarts (Vite HMR, crash), it reclaims
 * port 4003 and the MCP subprocess loses its connection with NO auto-reconnect.
 * Fix: kill the MCP subprocess PID; Claude Code will restart it in client mode.
 */

import { randomUUID } from 'crypto';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { BridgeRequest, BridgeResponse } from './protocol';

const PORT = Number(process.env.MCP_BRIDGE_PORT ?? 4003);
const TIMEOUT_MS = 30_000;

type PendingResolve = (response: BridgeResponse) => void;

let browserSocket: WebSocket | null = null;
const pending = new Map<string, PendingResolve>();

// Track MCP subprocess clients and their pending requests
const mcpClients = new Set<WebSocket>();
const mcpPending = new Map<string, WebSocket>();

let server: http.Server;
let wss: WebSocketServer;
let mode: 'server' | 'client' | 'none' = 'none';

export function startRelay(): void {
  server = http.createServer();
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const isMcpClient = req.url?.startsWith('/mcp');

    if (isMcpClient) {
      // MCP subprocess connection — forward its requests to browser
      mcpClients.add(ws);
      console.error('[mcp-bridge] MCP subprocess connected');

      ws.on('message', (data) => {
        let msg: BridgeRequest;
        try {
          msg = JSON.parse(data.toString()) as BridgeRequest;
        } catch {
          return;
        }

        if (msg.type !== 'call') return;

        if (!browserSocket || browserSocket.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({
            id: msg.id,
            type: 'error',
            error: 'No browser connected. Open DEViLBOX in a browser.',
          }));
          return;
        }

        // Track which MCP client owns this request, then forward to browser
        mcpPending.set(msg.id, ws);
        browserSocket.send(data.toString());
      });

      ws.on('close', () => {
        console.error('[mcp-bridge] MCP subprocess disconnected');
        mcpClients.delete(ws);
        // Clean up pending requests from this client
        for (const [id, client] of mcpPending) {
          if (client === ws) mcpPending.delete(id);
        }
      });

      ws.on('error', (err) => {
        console.error('[mcp-bridge] MCP client error:', err.message);
      });
    } else {
      // Browser connection
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

        // Check if this response belongs to an MCP subprocess request
        const mcpClient = mcpPending.get(msg.id);
        if (mcpClient && mcpClient.readyState === WebSocket.OPEN) {
          mcpPending.delete(msg.id);
          mcpClient.send(data.toString());
          return;
        }

        // Otherwise it's a response to a local callBrowser() request
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      });

      ws.on('close', () => {
        console.error('[mcp-bridge] Browser disconnected');
        if (browserSocket === ws) browserSocket = null;
        // Reject all pending local requests
        for (const [id, resolve] of pending) {
          resolve({ id, type: 'error', error: 'Browser disconnected' });
        }
        pending.clear();
        // Reject all pending MCP requests
        for (const [id, client] of mcpPending) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ id, type: 'error', error: 'Browser disconnected' }));
          }
        }
        mcpPending.clear();
      });

      ws.on('error', (err) => {
        console.error('[mcp-bridge] Browser WebSocket error:', err.message);
      });
    }
  });

  wss.on('error', (err: Error) => {
    console.error('[mcp-bridge] WSS error:', err.message);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[mcp-bridge] Port ${PORT} in use, connecting as client instead`);
      connectAsClient();
    } else {
      console.error('[mcp-bridge] Server error:', err.message);
    }
  });

  server.listen(PORT, () => {
    mode = 'server';
    console.error(`[mcp-bridge] WebSocket relay listening on ws://localhost:${PORT}`);
  });
}

/**
 * Connect to an existing relay as an MCP client (used by MCP subprocess
 * when Express already owns port 4003).
 */
function connectAsClient(): void {
  mode = 'client';
  // Connect to /mcp path so the relay knows we're an MCP client, not a browser
  const ws = new WebSocket(`ws://localhost:${PORT}/mcp`);

  ws.on('open', () => {
    browserSocket = ws;
    console.error('[mcp-bridge] Connected to existing relay as MCP client');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg as BridgeResponse);
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    console.error('[mcp-bridge] MCP client connection closed');
    browserSocket = null;
  });

  ws.on('error', (err) => {
    console.error('[mcp-bridge] MCP client error:', err.message);
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
