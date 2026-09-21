/**
 * WS relay driver for the DEViLBOX MCP bridge on :4003.
 *
 * Extracted from `tools/dub-untested-sweep.ts` so the sweeps that drive the
 * running browser share one implementation of the protocol rather than each
 * carrying a copy of it.
 *
 * Prereq: `npm run dev:fullstack` and a browser tab open on the app, audio
 * unlocked. The relay dies with the dev server.
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

export const WS_URL = 'ws://localhost:4003/mcp';

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

let ws: WebSocket | null = null;
const pending = new Map<string, Pending>();

export function connect(url = WS_URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url);
    ws = sock;
    sock.on('open', () => resolve());
    sock.on('error', reject);
    sock.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.error || 'bridge error'));
      else p.resolve(msg.data);
    });
  });
}

export function call(
  method: string,
  params: Record<string, any> = {},
  timeoutMs = 15000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ws) { reject(new Error('relay not connected')); return; }
    const id = randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout: ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v); },
      reject: (e) => { clearTimeout(timeout); reject(e); },
    });
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

export function close(): void {
  try { ws?.close(); } catch { /* ok */ }
  ws = null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
