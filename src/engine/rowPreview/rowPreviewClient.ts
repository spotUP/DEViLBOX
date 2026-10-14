/**
 * The row-preview client: one worker for the app (D11), created on the first preview. `request` resolves with the
 * clip (or why there is none); a newer request resolves the older one 'cancelled' (the host does it, D5).
 *
 * Tests build the client over a host in-process with `createRowPreviewClient(transportOverHost(host))`.
 */
import type { RowResult } from './rowClip';
import type { RowPreviewIn, RowPreviewOut, RowPreviewRequest } from './rowPreviewProtocol';
import type { RowPreviewHost } from './rowPreviewHost';

export interface RowPreviewTransport {
  post(msg: RowPreviewIn): void;
  onMessage(cb: (out: RowPreviewOut) => void): void;
}

export interface RowPreviewClient {
  request(req: RowPreviewRequest): Promise<RowResult>;
  /** Render the row ahead of an Enter (cursor prefetch). */
  prepare(req: RowPreviewRequest): Promise<RowResult | { kind: 'skipped' }>;
}

export function createRowPreviewClient(transport: RowPreviewTransport): RowPreviewClient {
  let nextId = 1;
  const waiting = new Map<number, { resolve: (r: RowResult | { kind: 'skipped' }) => void; reject: (e: Error) => void }>();
  transport.onMessage((out) => {
    const w = waiting.get(out.id);
    if (!w) return;
    waiting.delete(out.id);
    if (out.type === 'error') w.reject(new Error(out.message));
    else w.resolve(out.result);
  });
  const send = (type: 'request' | 'prepare', req: RowPreviewRequest) =>
    new Promise<RowResult | { kind: 'skipped' }>((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      transport.post({ type, id, req });
    });
  return {
    request: (req) => send('request', req) as Promise<RowResult>,
    prepare: (req) => send('prepare', req),
  };
}

/** A transport that talks to a host in this thread (tests). Clip buffers are copied, as a worker hop would. */
export function transportOverHost(host: RowPreviewHost): RowPreviewTransport {
  let cb: ((out: RowPreviewOut) => void) | null = null;
  return {
    onMessage: (c) => { cb = c; },
    post: (msg) => host.handle(structuredClone(msg), (out) => cb?.(out)),
  };
}

let shared: RowPreviewClient | null = null;

/** The app's client over the row-preview worker. */
export function getRowPreviewClient(): RowPreviewClient {
  if (shared) return shared;
  const worker = new Worker(new URL('@/workers/rowPreview.worker.ts', import.meta.url), { type: 'module' });
  shared = createRowPreviewClient({
    post: (msg) => worker.postMessage(msg),
    onMessage: (cb) => { worker.onmessage = (e: MessageEvent<RowPreviewOut>) => cb(e.data); },
  });
  return shared;
}

/** For tests: replace or drop the shared client. */
export function setRowPreviewClient(client: RowPreviewClient | null): void { shared = client; }
