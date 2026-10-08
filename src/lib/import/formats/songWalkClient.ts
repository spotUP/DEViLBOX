/**
 * Main-thread side of the import-time walk worker (src/workers/songWalk.worker.ts).
 *
 * An import walks the song with the replayer's own reader to draw the grid:
 * the TFMX decoder for Hippel (97-118 ms; 243 thousand records on lethalxcess-intro.hip7), the Music Assembler player in
 * TypeScript (33-43 ms), the Future Player reader (85-122 ms). Those used to
 * run on the main thread inside the load; they run in the worker now, and the
 * code that walks is the same function either way (the worker calls
 * runHippelWalk / walkMusicAssembler / walkFuturePlayer).
 *
 * Cancel (openSong's Cancel button and signal) ends the worker, because a walk
 * is a synchronous loop nothing inside it can be asked to stop; the next walk
 * starts a fresh one. Where there is no Worker (node) the walk runs inline.
 */
import type { HippelPlayed } from './HippelTfmxWalk';
import type { MaWalk } from './maWalk';
import type { FpWalk } from './fpWalk';
import {
  packMaWalk, unpackMaWalk, packFpWalk, unpackFpWalk, packHippelPlayed, unpackHippelPlayed,
  type PackedMaWalk, type PackedFpWalk,
} from './walkPack';

/** Thrown when a walk is stopped by a Cancel; never swallowed into "no walk". */
export class WalkCancelledError extends Error {
  constructor() { super('Walk cancelled'); this.name = 'WalkCancelledError'; }
}

export type WalkRequest =
  | { kind: 'hippel'; bytes: Uint8Array; subsong: number; ticks: number }
  | { kind: 'ma'; bytes: Uint8Array; subsong: number; maxRows?: number }
  | { kind: 'fp'; code: Uint8Array; subsong: number; maxRows?: number };

export type WalkResult =
  | { kind: 'hippel'; played: HippelPlayed }
  | { kind: 'ma'; walk: MaWalk | null }
  | { kind: 'fp'; walk: FpWalk | null };

/** A walk result as it crosses the thread boundary: typed arrays, transferred (walkPack.ts). */
export type PackedWalkResult =
  | { kind: 'hippel'; played: Int32Array }
  | { kind: 'ma'; walk: PackedMaWalk | null }
  | { kind: 'fp'; walk: PackedFpWalk | null };

export interface WalkWorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

/** Runs one request on the current thread: the worker's body, and the no-Worker fallback. */
export async function runWalk(req: WalkRequest): Promise<WalkResult> {
  if (req.kind === 'hippel') {
    const [{ runHippelWalk }, { hippelPlayedFromRecords }] = await Promise.all([import('./hippelPlayedPitch'), import('./HippelTfmxWalk')]);
    return { kind: 'hippel', played: hippelPlayedFromRecords(await runHippelWalk(req.bytes, req.subsong, req.ticks)) };
  }
  if (req.kind === 'ma') {
    const [{ loadMaModule }, { walkMusicAssembler }] = await Promise.all([import('./maModule'), import('./maWalk')]);
    const m = loadMaModule(req.bytes);
    return { kind: 'ma', walk: m ? walkMusicAssembler(m, req.subsong, { maxRows: req.maxRows }) : null };
  }
  const { walkFuturePlayer } = await import('./fpWalk');
  return { kind: 'fp', walk: walkFuturePlayer(req.code, req.subsong, { maxRows: req.maxRows }) };
}

/** The worker's body: run the walk, pack the result; `transfer` lists the buffers to move, not copy. */
export async function runWalkPacked(req: WalkRequest): Promise<{ result: PackedWalkResult; transfer: Transferable[] }> {
  const r = await runWalk(req);
  if (r.kind === 'hippel') {
    const played = packHippelPlayed(r.played);
    return { result: { kind: 'hippel', played }, transfer: [played.buffer] };
  }
  if (r.kind === 'ma') {
    const walk = r.walk ? packMaWalk(r.walk) : null;
    return { result: { kind: 'ma', walk }, transfer: walk ? [walk.events.buffer, ...walk.writes.map((w) => w.buffer)] : [] };
  }
  const walk = r.walk ? packFpWalk(r.walk) : null;
  return { result: { kind: 'fp', walk }, transfer: walk ? [walk.events.buffer] : [] };
}

function unpackWalkResult(r: PackedWalkResult): WalkResult {
  if (r.kind === 'hippel') return { kind: 'hippel', played: unpackHippelPlayed(r.played) };
  if (r.kind === 'ma') return { kind: 'ma', walk: r.walk ? unpackMaWalk(r.walk) : null };
  return { kind: 'fp', walk: r.walk ? unpackFpWalk(r.walk) : null };
}

export class SongWalkClient {
  /** Replaced in tests. The default spawns the real worker; null (no Worker global, i.e. node) runs the walk inline. */
  static workerFactory: () => WalkWorkerLike | null = () =>
    typeof Worker === 'undefined'
      ? null
      : new Worker(new URL('@/workers/songWalk.worker.ts', import.meta.url), { type: 'module' }) as unknown as WalkWorkerLike;

  /** Walks handed to a worker (reachability sentinel). */
  walksStarted = 0;
  /** Walks run inline on the calling thread because there is no worker (sentinel: 0 in the browser). */
  walksInline = 0;

  private worker: WalkWorkerLike | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (r: WalkResult) => void; reject: (e: Error) => void }>();

  private ensureWorker(): WalkWorkerLike | null {
    if (this.worker) return this.worker;
    const w = SongWalkClient.workerFactory();
    if (!w) return null;
    w.onmessage = (e) => {
      const m = e.data as { type: string; id: number; result?: PackedWalkResult; error?: string };
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === 'walked') p.resolve(unpackWalkResult(m.result as PackedWalkResult));
      else p.reject(new Error(m.error ?? 'Song walk failed'));
    };
    w.onerror = (e) => {
      this.failAll(new Error(`Song walk worker crashed: ${e.message}`));
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private async run(req: WalkRequest): Promise<WalkResult> {
    const worker = this.ensureWorker();
    if (!worker) {
      this.walksInline++;
      return runWalk(req);
    }
    const id = this.nextId++;
    this.walksStarted++;
    return new Promise<WalkResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'walk', id, request: req });
    });
  }

  /** The sound-sequence transposes the TFMX decoder applies (the worker reduces its walk records to them). */
  async hippelPlayed(bytes: Uint8Array, subsong: number, ticks: number): Promise<HippelPlayed> {
    const r = await this.run({ kind: 'hippel', bytes: bytes.slice(), subsong, ticks });
    return (r as Extract<WalkResult, { kind: 'hippel' }>).played;
  }

  /** `maxRows` bounds the walk (the subsong picker only needs the first note); default is the importer's full walk. */
  async musicAssembler(bytes: Uint8Array, subsong = 0, maxRows?: number): Promise<MaWalk | null> {
    const r = await this.run({ kind: 'ma', bytes: bytes.slice(), subsong, maxRows });
    return (r as Extract<WalkResult, { kind: 'ma' }>).walk;
  }

  async futurePlayer(code: Uint8Array, subsong = 0, maxRows?: number): Promise<FpWalk | null> {
    const r = await this.run({ kind: 'fp', code: code.slice(), subsong, maxRows });
    return (r as Extract<WalkResult, { kind: 'fp' }>).walk;
  }

  /** Stop the walks in flight. No-op when none runs. */
  cancel(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.failAll(new WalkCancelledError());
  }
}

/** The one client; openSong's cancel() reaches it. */
export const songWalks = new SongWalkClient();
