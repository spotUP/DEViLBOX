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
 * EXPRESS always owns port 4003 in SERVER mode.
 * MCP subprocess always calls connectAsClient() — never startRelay() — so
 * there is no port race. If Express restarts the client auto-reconnects via
 * the 'close' handler's attempt(2000) loop.
 */

import { randomUUID } from 'crypto';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { BridgeRequest, BridgeResponse } from './protocol';

const PORT = Number(process.env.MCP_BRIDGE_PORT ?? 4003);
const TIMEOUT_MS = 900_000;

type PendingResolve = (response: BridgeResponse) => void;

let browserSocket: WebSocket | null = null;
const pending = new Map<string, PendingResolve>();

// Track MCP subprocess clients and their pending requests
const mcpClients = new Set<WebSocket>();
const mcpPending = new Map<string, WebSocket>();

// Track controller clients (iPhone remote) and their pending requests
const controllerClients = new Set<WebSocket>();
const controllerPending = new Map<string, WebSocket>();

let server: http.Server;
let wss: WebSocketServer;
let mode: 'server' | 'client' | 'none' = 'none';

export function startRelay(): void {
  server = http.createServer();
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const isMcpClient = req.url?.startsWith('/mcp');
    const isController = req.url?.startsWith('/controller');

    if (isController) {
      // iPhone controller connection — forward requests to browser, route responses back
      controllerClients.add(ws);
      console.error('[mcp-bridge] Controller connected');

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

        controllerPending.set(msg.id, ws);
        browserSocket.send(data.toString());
      });

      ws.on('close', () => {
        console.error('[mcp-bridge] Controller disconnected');
        controllerClients.delete(ws);
        for (const [id, client] of controllerPending) {
          if (client === ws) controllerPending.delete(id);
        }
      });

      ws.on('error', (err) => {
        console.error('[mcp-bridge] Controller error:', err.message);
      });
    } else if (isMcpClient) {
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

        // Check if this response belongs to a controller request
        const ctrlClient = controllerPending.get(msg.id);
        if (ctrlClient && ctrlClient.readyState === WebSocket.OPEN) {
          controllerPending.delete(msg.id);
          ctrlClient.send(data.toString());
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
        // Reject all pending controller requests
        for (const [id, client] of controllerPending) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ id, type: 'error', error: 'Browser disconnected' }));
          }
        }
        controllerPending.clear();
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
 * when Express already owns port 4003). Auto-reconnects if the relay restarts.
 */
export function connectAsClient(): void {
  mode = 'client';

  let retries = 0;

  function attempt(): void {
    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s, capped at 10s.
    // Starts fast so a fresh Express boot is picked up immediately.
    const delay = retries === 0 ? 500 : Math.min(500 * 2 ** retries, 10_000);
    setTimeout(() => {
      const ws = new WebSocket(`ws://localhost:${PORT}/mcp`);

      ws.on('open', () => {
        retries = 0;
        browserSocket = ws;
        console.error('[mcp-bridge] Connected to relay as MCP client');
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const resolve = pending.get(msg.id);
          if (resolve) {
            pending.delete(msg.id);
            resolve(msg as BridgeResponse);
          }
        } catch { /* ignore */ }
      });

      ws.on('close', () => {
        browserSocket = null;
        retries++;
        console.error(`[mcp-bridge] Relay disconnected — retry ${retries} in ${Math.min(500 * 2 ** retries, 10_000)}ms`);
        attempt();
      });

      ws.on('error', () => {
        // 'close' fires immediately after 'error', reconnect handled there
      });
    }, delay);
  }

  attempt();
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
