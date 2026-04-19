/**
 * Minimal MCP WebSocket bridge client for ui-smoke tests.
 *
 * The browser SPA connects to the Express dev server at port 4003 and
 * registers handlers for ~130 MCP tools. This client speaks the same
 * JSON envelope the browser expects and forwards tool calls through the
 * relay.
 *
 * The full smoke-test suite uses a richer client in
 * `tools/playback-smoke-test.ts` — kept separate here so ui-smoke stays
 * self-contained and the two test harnesses can evolve independently.
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

const DEFAULT_WS_URL = process.env.MCP_BRIDGE_URL ?? 'ws://localhost:4003/mcp';
const DEFAULT_CONNECT_TIMEOUT_MS = 3000;
const DEFAULT_CALL_TIMEOUT_MS = 15000;

interface CallEnvelope {
  id: string;
  type: 'call';
  method: string;
  params: Record<string, unknown>;
}

interface ResponseEnvelope {
  id: string;
  type: string;
  data?: unknown;
  error?: string;
}

export class MCPBridgeClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (resp: ResponseEnvelope) => void>();
  private connectPromise: Promise<void>;

  constructor(private url: string = DEFAULT_WS_URL, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS) {
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`connect timeout after ${connectTimeoutMs}ms on ${url}`));
      }, connectTimeoutMs);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      ws.on('message', (data) => this.handleMessage(data.toString()));
      ws.on('close', () => {
        for (const [, fn] of this.pending) {
          fn({ id: '', type: 'error', error: 'connection closed' });
        }
        this.pending.clear();
      });
      this.ws = ws;
    });
  }

  ready(): Promise<void> { return this.connectPromise; }

  private handleMessage(text: string): void {
    let msg: ResponseEnvelope;
    try { msg = JSON.parse(text); } catch { return; }
    const fn = this.pending.get(msg.id);
    if (fn) {
      this.pending.delete(msg.id);
      fn(msg);
    }
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('bridge not connected'));
    }
    return new Promise<T>((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`call('${method}') timed out after ${DEFAULT_CALL_TIMEOUT_MS}ms`));
      }, DEFAULT_CALL_TIMEOUT_MS);
      this.pending.set(id, (resp) => {
        clearTimeout(timer);
        if (resp.type === 'error') reject(new Error(resp.error ?? 'unknown error'));
        else resolve(resp.data as T);
      });
      const envelope: CallEnvelope = { id, type: 'call', method, params };
      this.ws!.send(JSON.stringify(envelope));
    });
  }

  close(): void { this.ws?.close(); }
}

/**
 * Try to connect to the bridge, returning null if the dev server isn't up.
 * Tests use this to skip cleanly when infrastructure isn't available.
 */
export async function tryConnect(
  url: string = DEFAULT_WS_URL,
): Promise<MCPBridgeClient | null> {
  try {
    const client = new MCPBridgeClient(url);
    await client.ready();
    return client;
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
