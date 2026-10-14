/**
 * The row-preview host: what runs inside the row-preview worker (and in-process in tests). One RowPreviewStream per
 * engine key; requests are served latest-wins (D5); a prepared row (cursor prefetch, D12) is the stream's last clip, so
 * Enter on it answers without touching the player again.
 *
 * Messages: RowPreviewIn from the client, RowPreviewOut back (rowPreviewProtocol.ts). `handle` is the whole worker
 * glue: src/workers/rowPreview.worker.ts only wires it to postMessage.
 */
import { RowPreviewStream, type RowRenderAdapter, type RowPreviewStreamOptions, type RowRequestSignal } from './rowPreviewStream';
import { cloneClip, clipTransferables, type RowResult } from './rowClip';
import type { RowPreviewIn, RowPreviewOut, RowPreviewRequest } from './rowPreviewProtocol';

export type AdapterLoaders = Record<string, (sampleRate: number) => Promise<RowRenderAdapter>>;

interface Entry { stream: RowPreviewStream; adapter: RowRenderAdapter; sampleRate: number }
interface Job { signal: RowRequestSignal; prepare: boolean }

export interface RowPreviewHost {
  request(req: RowPreviewRequest): Promise<RowResult>;
  /** Render the row ahead of an Enter. 'skipped' when a real request is pending. */
  prepare(req: RowPreviewRequest): Promise<RowResult | { kind: 'skipped' }>;
  handle(msg: RowPreviewIn, reply: (out: RowPreviewOut, transfer?: Transferable[]) => void): void;
}

export function createRowPreviewHost(loaders: AdapterLoaders, opts: RowPreviewStreamOptions = {}): RowPreviewHost {
  const entries = new Map<string, Entry>();
  let chain: Promise<unknown> = Promise.resolve();
  let current: Job | null = null;
  let realPending = 0;

  async function streamFor(req: RowPreviewRequest): Promise<RowPreviewStream> {
    let e = entries.get(req.engineKey);
    if (!e || e.sampleRate !== req.sampleRate) {
      const load = loaders[req.engineKey];
      if (!load) throw new Error(`row preview: no adapter for engine ${req.engineKey}`);
      const adapter = await load(req.sampleRate);
      e = { stream: new RowPreviewStream(adapter, opts), adapter, sampleRate: req.sampleRate };
      entries.set(req.engineKey, e);
    }
    await e.adapter.prepare?.(req.args, req.data);
    e.stream.ensureOpen(req.data, req.args);
    return e.stream;
  }

  function run(req: RowPreviewRequest, prepare: boolean): Promise<RowResult | { kind: 'skipped' }> {
    if (prepare && realPending > 0) return Promise.resolve({ kind: 'skipped' });
    // Latest wins: whatever is rendering now, real or prefetch, is told to stop at its next slice.
    if (current) current.signal.cancelled = true;
    const job: Job = { signal: { cancelled: false }, prepare };
    current = job;
    if (!prepare) realPending++;
    const result = chain.then(async (): Promise<RowResult | { kind: 'skipped' }> => {
      if (job.signal.cancelled) return { kind: 'cancelled' };
      const stream = await streamFor(req);
      const r = await stream.request(req.target, req.mask, job.signal);
      return r.kind === 'clip' ? { kind: 'clip', clip: cloneClip(r.clip) } : r;
    });
    chain = result.catch(() => undefined).finally(() => { if (!prepare) realPending--; if (current === job) current = null; });
    return result;
  }

  return {
    request: (req) => run(req, false) as Promise<RowResult>,
    prepare: (req) => run(req, true),
    handle(msg, reply) {
      const send = (r: RowResult | { kind: 'skipped' }) => {
        if (r.kind === 'clip') reply({ type: 'result', id: msg.id, result: r }, clipTransferables(r.clip));
        else reply({ type: 'result', id: msg.id, result: r });
      };
      const fail = (e: unknown) => reply({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) });
      (msg.type === 'prepare' ? run(msg.req, true) : run(msg.req, false)).then(send, fail);
    },
  };
}
