/**
 * Owner decision 2026-10-12 (SCOPE-RERENDER): a track whose cache entry was
 * rendered before the per-channel scope track existed (no `channelScopes`)
 * shows ALL only. Loading it on a deck now queues ONE low-priority scope
 * re-render through the DJPipeline queue; when it finishes the deck gains its
 * channel scopes while the audio it plays is not reloaded, and the cache entry
 * keeps its audio and analysis.
 *
 * Drives the real path: DJEngine.loadAudioToDeck -> DJChannelScopeRerender ->
 * DJPipeline (real queue, stand-in render worker) -> cache -> DeckEngine.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown, decodes: 0, renders: [] as Array<{ id: string; maxSeconds?: number }> }));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('@/lib/audio/UnifiedAudioDecoder', () => ({
  decodeAudio: async () => {
    holder.decodes++;
    return { audioBuffer: { duration: 2, sampleRate: 44100, numberOfChannels: 2, length: 88200 }, usedWasm: false, format: 'wav' };
  },
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  class ToneAudioBuffer {
    private b: unknown;
    loaded = true;
    constructor(b: unknown) { this.b = b; }
    get(): unknown { return this.b; }
    dispose(): void { this.loaded = false; }
  }
  class Player {
    state = 'stopped';
    buffer: ToneAudioBuffer | { loaded: boolean } = { loaded: false };
    loopEnd = 0;
    connect(): this { return this; }
    seek(): this { return this; }
    stop(): this { return this; }
  }
  return { ...actual, Player, ToneAudioBuffer, now: () => 0, getContext: () => ({ rawContext: {} }) };
});

import { useDJStore } from '@/stores/useDJStore';
import { DeckAudioPlayer } from '../DeckAudioPlayer';
import { cacheAudio, getCachedAudio } from '../DJAudioCache';
import { ChannelScopeTrackBuilder } from '../channelScopeTrack';

/** The render worker: answers every render with a 2 s render carrying a 4-channel scope track. */
class StandInWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private readonly url: URL | string;
  constructor(url: URL | string) { this.url = url; }
  postMessage(msg: { type: string; id?: string; maxSeconds?: number }) {
    if (msg.type !== 'render' || !String(this.url).includes('dj-render')) return;
    holder.renders.push({ id: msg.id!, maxSeconds: msg.maxSeconds });
    const b = new ChannelScopeTrackBuilder(4, 44100);
    b.push(44100 * 2, (ch, i) => (ch === 0 ? Math.sin(i / 20) : 0));
    setTimeout(() => this.onmessage?.({ data: {
      type: 'renderComplete', id: msg.id, left: new Float32Array(88200), right: new Float32Array(88200),
      sampleRate: 44100, duration: 2, channelScopes: b.finish(),
    } }), 5);
  }
  terminate() {}
}

const PEAKS = new Float32Array([0.1, 0.4]);

// The real engine graph is transformed cold on first import (tens of seconds
// on a loaded machine). Load it here, before the re-render module is held, so
// the test body measures the re-render and not the import.
let DeckEngineCls!: typeof import('../DeckEngine').DeckEngine;
let DJEngineCls!: typeof import('../DJEngine').DJEngine;
let getDJPipelineFn!: typeof import('../DJPipeline').getDJPipeline;
beforeAll(async () => {
  DeckEngineCls = (await vi.importActual<typeof import('../DeckEngine')>('../DeckEngine')).DeckEngine;
  DJEngineCls = (await vi.importActual<typeof import('../DJEngine')>('../DJEngine')).DJEngine;
  getDJPipelineFn = (await import('../DJPipeline')).getDJPipeline;
}, 180_000);

async function realDeck(id: 'A' | 'B') {
  const DeckEngine = DeckEngineCls;
  const audioPlayer = new DeckAudioPlayer({} as never);
  return Object.assign(Object.create(DeckEngine.prototype), {
    id, audioPlayer, replayer: { stop: () => {} }, stemPlayer: { stop: () => {}, disable: () => {} }, _stemMode: false,
    patternScratchActive: false, patternScratchDir: 1, _primeScratchBuffer: async () => {}, _channelScopes: undefined, _loadedWav: null,
    channelMute: { setStems: () => {}, setMask: () => {}, stemCount: 0 },
    keyLock: { setActive: () => {}, setPitchSemiTones: () => {}, latencySec: () => 0 }, // the stretcher insert a real deck always owns
    loadSong: async () => {}, clearLoadedSong: () => {},
  }) as InstanceType<typeof DeckEngine>;
}

/** Make the stored entry old-shape: the scope-render marker did not exist when it was written. */
async function stripScopeMarker(): Promise<void> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('DEViLBOX_AudioCache', 2);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('audioCache', 'readwrite');
    const store = tx.objectStore('audioCache');
    const all = store.getAll();
    all.onsuccess = () => {
      for (const e of all.result) { delete e.scopeRenderVersion; delete e.channelScopes; store.put(e); }
    };
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
  db.close();
}

describe('an old cache entry without channel scopes gains them in the background', () => {
  it('loading it queues one low-priority re-render; the deck gains its scopes without reloading the audio', async () => {
    vi.stubGlobal('Worker', StandInWorker);
    const DJEngine = DJEngineCls;
    const decks = { A: await realDeck('A'), B: await realDeck('B') };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: (id: 'A' | 'B') => decks[id], recorder: null, _pendingTrackSource: null, tryAutoLoadStems: async () => {},
    });
    const enqueue = vi.spyOn(getDJPipelineFn(), 'enqueue');
    // Deck B's load asks for the re-render module while deck A's first import
    // of it is still evaluating (held at its last dependency here, as a busy CI
    // worker did by chance). Vite's module runner sees the module in an import
    // cycle and hands a second, concurrent import() the half-evaluated module:
    // "Cannot access 'renders' before initialization", swallowed, and deck B
    // never gained its scopes (CI run 38186067547). Every load shares the one
    // import (loadChannelScopeRerender). doMock: only the re-render module,
    // loaded after this line, gets the held dependency.
    let reached!: () => void;
    const evaluating = new Promise<void>((r) => { reached = r; });
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    vi.doMock('@/stores/useDJPlaylistStore', async (orig) => {
      reached();
      await released;
      return orig();
    });

    // The entry as an older build wrote it: audio + analysis, no scope track.
    const source = new Uint8Array(512).fill(7).buffer;
    const wavBytes = new Uint8Array(4096).fill(3).buffer;
    await cacheAudio(source, 'old.mod', wavBytes, 2, new Float32Array([0.1, 0.4]), 44100, 2);
    const { updateCacheAnalysis } = await import('../DJAudioCache');
    await updateCacheAnalysis(source, { bpm: 140, musicalKey: 'A minor' });
    await stripScopeMarker();

    // Two loads of the track (deck A, then deck B) before the re-render finishes.
    const first = (await getCachedAudio(source))!;
    expect(first.channelScopes).toBeUndefined();
    await (holder.engine as InstanceType<typeof DJEngine>).loadAudioToDeck('A', first.audioData, 'old.wav', undefined, undefined, undefined, PEAKS);
    const bufferBefore = decks.A.audioPlayer.getAudioBuffer();
    expect(useDJStore.getState().decks.A.channelScopeCount).toBe(0);
    const second = (await getCachedAudio(source))!;
    await evaluating;
    await (holder.engine as InstanceType<typeof DJEngine>).loadAudioToDeck('B', second.audioData, 'old.wav', undefined, undefined, undefined, PEAKS);
    await new Promise((r) => setTimeout(r, 20)); // deck B's import() is under way
    release();

    await vi.waitFor(() => {
      expect(useDJStore.getState().decks.A.channelScopeCount).toBeGreaterThan(0);
      expect(useDJStore.getState().decks.B.channelScopeCount).toBeGreaterThan(0);
    }, { timeout: 5000 });

    // One low-priority task through the pipeline queue, never a truncated render.
    const scopeTasks = enqueue.mock.calls.map((c) => c[0]).filter((t) => t.scopesOnly);
    expect(scopeTasks).toHaveLength(1);
    expect(scopeTasks[0].priority).toBe('low');
    expect(holder.renders).toHaveLength(1);
    expect(holder.renders[0].maxSeconds).toBeUndefined();

    // The audio was not reloaded: one decode per load, the same decoded buffer still playing on deck A.
    expect(holder.decodes).toBe(2);
    expect(decks.A.audioPlayer.getAudioBuffer()).toBe(bufferBefore);

    // The entry gained the track and kept its audio and analysis.
    const after = (await getCachedAudio(source))!;
    expect(after.channelScopes?.channels.length).toBe(4);
    expect(after.bpm).toBe(140);
    expect(after.musicalKey).toBe('A minor');
    expect(after.audioData.byteLength).toBe(4096);

    // A later load finds the track in the cache: no further render.
    await (holder.engine as InstanceType<typeof DJEngine>).loadAudioToDeck('A', after.audioData, 'old.wav', undefined, undefined, undefined, PEAKS);
    expect(useDJStore.getState().decks.A.channelScopeCount).toBe(4);
    await new Promise((r) => setTimeout(r, 50));
    expect(holder.renders).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
