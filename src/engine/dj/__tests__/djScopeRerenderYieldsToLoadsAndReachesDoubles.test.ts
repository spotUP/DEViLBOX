/**
 * SCOPE-PREEMPT / SCOPE-DOUBLE (owner 2026-10-12):
 *  - a user load (high priority) never waits behind a background scope
 *    re-render: the running low-priority render is cut short and re-queued,
 *    the load starts at once, the re-render finishes after it;
 *  - a double of the track loaded before the scope track arrived gains it too.
 *
 * Real DJEngine / DeckEngine / DJPipeline queue, stand-in render worker with
 * controllable completion.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  renders: [] as string[],
  holdFirstScopes: false,
  workers: [] as Array<{ terminated: boolean }>,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('@/lib/audio/UnifiedAudioDecoder', () => ({
  decodeAudio: async () => ({ audioBuffer: { duration: 2, sampleRate: 44100, numberOfChannels: 2, length: 88200 }, usedWasm: false, format: 'wav' }),
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
import { loadDoubleToDeck } from '../DJTrackLoader';

class StandInWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private readonly isRender: boolean;
  private readonly state = { terminated: false };
  constructor(url: URL | string) {
    this.isRender = String(url).includes('dj-render');
    if (this.isRender) holder.workers.push(this.state);
  }
  postMessage(msg: { type: string; id?: string }) {
    if (msg.type === 'init') return;
    if (!this.isRender) {
      setTimeout(() => this.onmessage?.({ data: { type: 'analysisError', id: msg.id, error: 'not under test' } }), 0);
      return;
    }
    holder.renders.push(msg.id!);
    if (msg.id!.startsWith('scopes-') && holder.holdFirstScopes) { holder.holdFirstScopes = false; return; }
    const b = new ChannelScopeTrackBuilder(4, 44100);
    b.push(44100 * 2, (ch, i) => (ch === 0 ? Math.sin(i / 20) : 0));
    setTimeout(() => {
      if (this.state.terminated) return;
      this.onmessage?.({ data: {
        type: 'renderComplete', id: msg.id, left: new Float32Array(88200), right: new Float32Array(88200),
        sampleRate: 44100, duration: 2, channelScopes: b.finish(),
      } });
    }, 5);
  }
  terminate() { this.state.terminated = true; }
}

async function realDeck(id: 'A' | 'B') {
  const { DeckEngine } = await vi.importActual<typeof import('../DeckEngine')>('../DeckEngine');
  const audioPlayer = new DeckAudioPlayer({} as never);
  return Object.assign(Object.create(DeckEngine.prototype), {
    id, audioPlayer, replayer: { stop: () => {} }, stemPlayer: { stop: () => {}, disable: () => {} }, _stemMode: false,
    patternScratchActive: false, patternScratchDir: 1, _primeScratchBuffer: async () => {}, _channelScopes: undefined, _loadedWav: null,
    channelMute: { setStemCount: () => {}, setMask: () => {}, stemCount: 0 },
    loadSong: async () => {}, clearLoadedSong: () => {},
  }) as InstanceType<typeof DeckEngine>;
}

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
      for (const e of all.result) { if (e.channelScopes) continue; delete e.scopeRenderVersion; store.put(e); }
    };
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
  db.close();
}

const PEAKS = new Float32Array([0.1, 0.4]);

async function setup() {
  vi.stubGlobal('Worker', StandInWorker);
  const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
  const decks = { A: await realDeck('A'), B: await realDeck('B') };
  const engine = Object.assign(Object.create(DJEngine.prototype), {
    getDeck: (id: 'A' | 'B') => decks[id], recorder: null, _pendingTrackSource: null, tryAutoLoadStems: async () => {},
  }) as InstanceType<typeof DJEngine>;
  holder.engine = engine;
  return { engine, decks };
}

async function oldEntry(fill: number): Promise<{ source: ArrayBuffer; wav: ArrayBuffer }> {
  const source = new Uint8Array(512).fill(fill).buffer;
  await cacheAudio(source, `old${fill}.mod`, new Uint8Array(4096).fill(3).buffer, 2, PEAKS, 44100, 2);
  await stripScopeMarker();
  const wav = (await getCachedAudio(source))!.audioData;
  return { source, wav };
}

describe('a background scope re-render yields to a user load', () => {
  it('a high-priority load starts at once while a low-priority scope render runs, and the render finishes after it', async () => {
    const { engine, decks } = await setup();
    const { getDJPipeline } = await import('../DJPipeline');
    const { wav } = await oldEntry(11);

    holder.holdFirstScopes = true;
    await engine.loadAudioToDeck('A', wav, 'old.wav', undefined, undefined, undefined, PEAKS);
    await vi.waitFor(() => expect(holder.renders.some((id) => id.startsWith('scopes-'))).toBe(true), { timeout: 5000 });
    const scopeWorker = holder.workers[holder.workers.length - 1];

    // The scope render is running and never completes by itself. A user load arrives.
    const load = getDJPipeline().renderAndAnalyze(new Uint8Array(256).fill(99).buffer, 'user.mod', undefined, 'high');
    await vi.waitFor(() => expect(holder.renders.some((id) => id.startsWith('user.mod'))).toBe(true), { timeout: 5000 });
    expect(scopeWorker.terminated, 'the running scope render was cut short').toBe(true);
    await load;

    // Re-queued behind the load, it renders again and the deck gains its scopes.
    await vi.waitFor(() => expect(useDJStore.getState().decks.A.channelScopeCount).toBeGreaterThan(0), { timeout: 8000 });
    const order = holder.renders.map((id) => (id.startsWith('scopes-') ? 'scopes' : 'load'));
    expect(order).toEqual(['scopes', 'load', 'scopes']);
    expect(decks.A.channelScopes).toBeDefined();
  }, 60_000);
});

describe('a double made before the scope track arrived gains it too', () => {
  it('the source deck gains its scopes and the double of it on the other deck gains them with it', async () => {
    const { engine, decks } = await setup();
    const { wav } = await oldEntry(22);

    await engine.loadAudioToDeck('A', wav, 'old.wav', undefined, undefined, undefined, PEAKS);
    expect(await loadDoubleToDeck('A', 'B')).toBe(true);
    expect(useDJStore.getState().decks.B.channelScopeCount).toBe(0);

    await vi.waitFor(() => {
      expect(useDJStore.getState().decks.A.channelScopeCount).toBeGreaterThan(0);
      expect(useDJStore.getState().decks.B.channelScopeCount).toBeGreaterThan(0);
    }, { timeout: 8000 });
    expect(decks.B.channelScopes).toBe(decks.A.channelScopes);
    vi.unstubAllGlobals();
  }, 60_000);
});
