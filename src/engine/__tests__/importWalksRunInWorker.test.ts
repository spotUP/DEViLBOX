/**
 * Import-time walks run in the walk worker, not on the main thread (U2.8).
 *
 * Measured on the main thread per load: Hippel 7V decoder walk 97-118 ms,
 * Future Player walk 85-122 ms, Music Assembler walk 33-43 ms (baseheads.ma).
 * Now the import path (parseModuleToSong, the entry openSong parses through)
 * hands each walk to src/workers/songWalk.worker.ts through songWalkClient.
 *
 * The worker here is the real worker body (runWalkPacked) behind a structured-clone
 * message boundary. Reachability (once per format): the song opens through
 * parseModuleToSong, the client started a walk, and the walking function ran
 * while the worker was running it - never outside it. Equality (per format):
 * the grid built from the worker's walk equals the grid the parser builds
 * walking the song itself, over every corpus song of the format.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ inWorker: false, calls: { ma: [] as boolean[], fp: [] as boolean[], hippel: [] as boolean[] } }));

vi.mock('@/lib/import/formats/maWalk', async (orig) => {
  const m = await orig<typeof import('@/lib/import/formats/maWalk')>();
  return { ...m, walkMusicAssembler: (...a: Parameters<typeof m.walkMusicAssembler>) => { state.calls.ma.push(state.inWorker); return m.walkMusicAssembler(...a); } };
});
vi.mock('@/lib/import/formats/fpWalk', async (orig) => {
  const m = await orig<typeof import('@/lib/import/formats/fpWalk')>();
  return { ...m, walkFuturePlayer: (...a: Parameters<typeof m.walkFuturePlayer>) => { state.calls.fp.push(state.inWorker); return m.walkFuturePlayer(...a); } };
});

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { SongWalkClient, songWalks, runWalkPacked, WalkCancelledError, type WalkWorkerLike, type WalkRequest } from '@/lib/import/formats/songWalkClient';
import { hippelPlayedPitch, runHippelWalk } from '@/lib/import/formats/hippelPlayedPitch';
import { parseMusicAssemblerFile } from '@/lib/import/formats/MusicAssemblerParser';
import { parseFuturePlayerFile } from '@/lib/import/formats/FuturePlayerParser';
import { parseJochenHippel7VFile } from '@/lib/import/formats/JochenHippel7VParser';
import { parseJochenHippelAmigaSogFile } from '@/lib/import/formats/JochenHippelSTParser';
import { fpCodeSection } from '@/lib/import/formats/fpWalk';

const ROOT = join(process.cwd(), 'public/data/songs');
const read = (rel: string) => new Uint8Array(readFileSync(join(ROOT, rel)));
const MA = ['formats/baseheads.ma', 'music-assembler/thanatos.ma'];
const FP = ['formats/imploder_drums.fp', 'formats/hybris.fp'];
const HIP7 = ['hippel-7v/lethalxcess-intro.hip7', 'formats/ghostbattle_gameover.hip7'];
const HIP = ['hippel/warp (ingame 2).hip'];

/** A worker that runs the real worker body behind a structured-clone boundary; hold = never answers. */
function fakeWorker(opts: { hold?: boolean } = {}): WalkWorkerLike & { terminated: boolean } {
  const w = {
    terminated: false,
    onmessage: null as WalkWorkerLike['onmessage'],
    onerror: null as WalkWorkerLike['onerror'],
    terminate() { w.terminated = true; },
    postMessage(msg: unknown) {
      if (opts.hold) return;
      const { id, request } = structuredClone(msg) as { id: number; request: WalkRequest };
      void (async () => {
        state.inWorker = true;
        try {
          const { result, transfer } = await runWalkPacked(request);
          state.inWorker = false;
          w.onmessage?.({ data: { type: 'walked', id, result: structuredClone(result, { transfer }) } } as MessageEvent);
        } catch (err) {
          state.inWorker = false;
          w.onmessage?.({ data: { type: 'walkError', id, error: String(err) } } as MessageEvent);
        }
      })();
    },
  };
  return w;
}

const originalFactory = SongWalkClient.workerFactory;
let restoreFetch: () => void;

beforeAll(() => {
  // The TFMX wasm the Hippel walk loads (fetch answers from public/; the bundle probes process.versions).
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string) => {
    const file = join(process.cwd(), 'public', String(url).replace(/^\//, ''));
    const buf = readFileSync(file);
    return { text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) } as unknown as Response;
  });
  restoreFetch = () => { vi.stubGlobal('fetch', real); };
  SongWalkClient.workerFactory = () => fakeWorker();
});
afterAll(() => { SongWalkClient.workerFactory = originalFactory; restoreFetch(); });

/** A song without the import timestamp, comparable across two parses. */
function comparable(song: unknown): string {
  return JSON.stringify(song, (k, v) => (k === 'importedAt' ? undefined : v instanceof Map ? [...v] : v));
}

async function withVersionsHidden<T>(fn: () => Promise<T>): Promise<T> {
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try { return await fn(); } finally { Object.defineProperty(process, 'versions', versions); }
}

describe('import walks run in the walk worker (reachability, one per walk)', () => {
  it('parseModuleToSong on a Music Assembler song: the walk ran in the worker, never outside it', async () => {
    state.calls.ma.length = 0;
    const started = songWalks.walksStarted;
    await parseModuleToSong(new File([read(MA[0])], 'baseheads.ma'));
    expect(songWalks.walksStarted).toBe(started + 1);
    expect(songWalks.walksInline).toBe(0);
    expect(state.calls.ma.length).toBeGreaterThan(0);
    expect(state.calls.ma.every((inWorker) => inWorker)).toBe(true);
  });

  it('parseModuleToSong on a Future Player song: the walk ran in the worker, never outside it', async () => {
    state.calls.fp.length = 0;
    const started = songWalks.walksStarted;
    await parseModuleToSong(new File([read(FP[0])], 'imploder drums.fp'));
    expect(songWalks.walksStarted).toBe(started + 1);
    expect(state.calls.fp.length).toBeGreaterThan(0);
    expect(state.calls.fp.every((inWorker) => inWorker)).toBe(true);
  });

  it('parseModuleToSong on a Hippel 7V song: the decoder walk was handed to the worker', async () => {
    const started = songWalks.walksStarted;
    const song = await withVersionsHidden(() => parseModuleToSong(new File([read(HIP7[0])], 'lethalxcess-intro.hip7')));
    expect(songWalks.walksStarted).toBe(started + 1);
    expect(songWalks.walksInline).toBe(0);
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('a Cancel ends the worker and rejects the walk in flight with a cancellation', async () => {
    const held = fakeWorker({ hold: true });
    const client = new SongWalkClient();
    SongWalkClient.workerFactory = () => held;
    try {
      const walking = client.musicAssembler(read(MA[0]));
      client.cancel();
      await expect(walking).rejects.toBeInstanceOf(WalkCancelledError);
      expect(held.terminated).toBe(true);
    } finally {
      SongWalkClient.workerFactory = () => fakeWorker();
    }
  });

  it('a cancelled Hippel walk is not swallowed into "no walk"', async () => {
    const held = fakeWorker({ hold: true });
    songWalks.cancel(); // drop the worker an earlier test left on the shared client
    SongWalkClient.workerFactory = () => held;
    try {
      const p = hippelPlayedPitch(read(HIP7[0]));
      await Promise.resolve();
      songWalks.cancel();
      await expect(p).rejects.toBeInstanceOf(WalkCancelledError);
    } finally {
      SongWalkClient.workerFactory = () => fakeWorker();
    }
  });
});

describe('the worker walk gives the grid the main-thread walk gives (equality, per format)', () => {
  it.each(MA)('Music Assembler %s', async (rel) => {
    const bytes = read(rel);
    const viaWorker = parseMusicAssemblerFile(bytes, 'x.ma', await songWalks.musicAssembler(bytes, 0));
    const inline = parseMusicAssemblerFile(bytes, 'x.ma');
    expect(viaWorker).not.toBeNull();
    expect(comparable(viaWorker)).toBe(comparable(inline));
    // the walk itself survives the typed-array reply unchanged
    const { loadMaModule } = await import('@/lib/import/formats/maModule');
    const { walkMusicAssembler } = await import('@/lib/import/formats/maWalk');
    expect(await songWalks.musicAssembler(bytes, 0)).toEqual(walkMusicAssembler(loadMaModule(bytes)!, 0));
  });

  it.each(FP)('Future Player %s', async (rel) => {
    const bytes = read(rel);
    const buf = bytes.slice().buffer as ArrayBuffer;
    const walk = await songWalks.futurePlayer(fpCodeSection(bytes), 0);
    expect(comparable(parseFuturePlayerFile(buf, 'x.fp', walk))).toBe(comparable(parseFuturePlayerFile(buf, 'x.fp')));
    const { walkFuturePlayer } = await import('@/lib/import/formats/fpWalk');
    expect(walk).toEqual(walkFuturePlayer(fpCodeSection(bytes), 0));
  });

  it.each([...HIP7, ...HIP])('Hippel %s', async (rel) => {
    await withVersionsHidden(async () => {
      const bytes = read(rel);
      const viaWorker = await hippelPlayedPitch(bytes);
      const direct = await hippelPlayedPitch(bytes, runHippelWalk);
      expect(viaWorker, 'the decoder walked the song').not.toBeNull();
      expect(comparable(viaWorker)).toBe(comparable(direct));
      const buf = bytes.slice().buffer as ArrayBuffer;
      const parse = rel.endsWith('.hip7') ? parseJochenHippel7VFile : parseJochenHippelAmigaSogFile;
      expect(comparable(parse(buf, 'x', viaWorker!))).toBe(comparable(parse(buf, 'x', direct!)));
    });
  });
});
