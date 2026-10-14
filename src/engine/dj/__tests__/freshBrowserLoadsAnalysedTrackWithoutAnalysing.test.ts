/**
 * Owner 2026-10-14: "why do i need to re-analyze?" The server analysis cache
 * held only the base analysis; the Auto DJ extended analysis lived in the
 * browser's IndexedDB, so a new browser / profile / incognito window analysed
 * every track again. The ONE reachability test: a fresh client (empty
 * IndexedDB) loads a track whose full analysis is on the server through
 * DJPipeline.loadOrEnqueue and runs NO analysis worker pass (sentinel: the
 * worker's analyze / analyzeExtended message count is 0). The partial row (base
 * only), the miss and the slow server show the sentinel counts something when
 * analysis is due, and that a slow server costs one analysis, not two.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { corpusTrack } from '../autodj/testing/corpus';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import type { ExtendedAnalysis } from '../autodj/types';
import type { ServerAnalysis } from '@/lib/analysisCache';

const sentinel = vi.hoisted(() => ({ analyze: 0, extended: 0 }));

vi.mock('../djRenderEngine', async (orig) => ({ ...(await orig<typeof import('../djRenderEngine')>()), resolveRenderPlayer: async () => null }));

let extended: ExtendedAnalysis;
let beats: number[];

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private readonly url: URL | string;
  constructor(url: URL | string) { this.url = url; }
  terminate(): void {}
  postMessage(msg: { type: string; id: string }): void {
    const reply = (data: unknown): void => { setTimeout(() => this.onmessage?.({ data } as MessageEvent), 0); };
    if (String(this.url).includes('render')) {
      if (msg.type !== 'render') return;
      const pcm = new Float32Array(22050).map((_, i) => 0.3 * Math.sin(i / 20));
      reply({ type: 'renderComplete', id: msg.id, left: pcm, right: pcm, sampleRate: 22050, duration: 1 });
      return;
    }
    if (msg.type === 'analyze') {
      sentinel.analyze++;
      reply({
        type: 'analysisComplete', id: msg.id,
        result: {
          bpm: 126, bpmConfidence: 0.9, beats, downbeats: beats.filter((_, i) => i % 4 === 0), timeSignature: 4, musicalKey: 'A minor',
          keyConfidence: 0.8, onsets: beats, frequencyPeaks: [[0.1], [0.2], [0.3]], rmsDb: -14, peakDb: -1,
          genre: { primary: 'Electronic', subgenre: 'House', confidence: 0.7, mood: 'Energetic', energy: 0.8, danceability: 0.9 },
          extended,
        },
      });
    } else if (msg.type === 'analyzeExtended') {
      sentinel.extended++;
      reply({ type: 'extendedComplete', id: msg.id, extended });
    }
  }
}

type Row = ServerAnalysis | 'miss' | 'never';
let serverRow: Row = 'miss';
let lookups: string[] = [];
let uploads: Array<Record<string, unknown>> = [];

function serverBase(hash: string, withExtended: ExtendedAnalysis | null): ServerAnalysis {
  return {
    hash, bpm: 126, bpmConfidence: 0.9, timeSignature: 4, musicalKey: 'A minor', keyConfidence: 0.8, rmsDb: -14, peakDb: -1,
    genrePrimary: 'Electronic', genreSubgenre: 'House', genreConfidence: 0.7, mood: 'Energetic', energy: 0.8, danceability: 0.9,
    duration: 1, beats, downbeats: beats.filter((_, i) => i % 4 === 0), waveformPeaks: [0.1], frequencyPeaks: [[0.1], [0.2], [0.3]],
    analysisVersion: 1, extended: withExtended,
  };
}

beforeAll(() => {
  const t = corpusTrack('steady');
  beats = t.beats.slice(0, 16);
  extended = computeExtendedAnalysis(t.pcm, t.sampleRate, { beats: t.beats });
});

beforeEach(() => {
  sentinel.analyze = 0; sentinel.extended = 0; lookups = []; uploads = []; serverRow = 'miss';
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      uploads.push(JSON.parse(init.body as string));
      return Promise.resolve(new Response('{"stored":true}'));
    }
    lookups.push(input);
    if (serverRow === 'never') {
      return new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))); });
    }
    const hash = input.split('/').pop()!;
    const row = serverRow === 'miss' ? null : { ...serverRow, hash };
    return Promise.resolve(new Response(JSON.stringify(row ? { found: true, analysis: row } : { found: false }), { status: row ? 200 : 404 }));
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** A distinct "file" per call: a fresh browser has never seen it. */
let fileNo = 0;
function freshFile(): ArrayBuffer {
  const bytes = new Uint8Array(64).fill(7);
  new DataView(bytes.buffer).setUint32(0, ++fileNo + Date.now() % 100000);
  return bytes.buffer;
}

async function pipeline() {
  const { DJPipeline } = await import('../DJPipeline');
  return new DJPipeline();
}

describe('a fresh browser loading a track the server has fully analysed', () => {
  it('runs no local analysis: no full pass, no extended pass, no upload; the track is then fully analysed locally', async () => {
    const { DJPipeline, isCacheFullyAnalyzed } = await import('../DJPipeline');
    const { getCachedAudio } = await import('../DJAudioCache');
    const file = freshFile();
    serverRow = serverBase('x', extended);
    const p = new DJPipeline();
    const result = await p.loadOrEnqueue(file, 'fresh.mod', undefined, 'high');
    expect(sentinel.analyze).toBe(0);
    expect(sentinel.extended).toBe(0);
    expect(uploads).toHaveLength(0);
    expect(lookups).toHaveLength(1);
    expect(result.analysis?.extended?.version).toBe(extended.version);
    expect(result.analysis?.extended?.drums).toEqual(extended.drums);
    expect(result.analysis?.bpm).toBe(126);
    const cached = await getCachedAudio(file);
    expect(cached && isCacheFullyAnalyzed(cached)).toBe(true);
    p.dispose();
  });

  it('a row with the base analysis only computes just the extended analysis, then uploads it', async () => {
    serverRow = serverBase('x', null);
    const p = await pipeline();
    const result = await p.loadOrEnqueue(freshFile(), 'partial.mod', undefined, 'high');
    expect(sentinel.analyze).toBe(0);
    expect(sentinel.extended).toBe(1);
    expect(result.analysis?.extended).not.toBeNull();
    expect(uploads).toHaveLength(1);
    expect((uploads[0].extended as ExtendedAnalysis).version).toBe(extended.version);
    p.dispose();
  });

  it('a row with an older extended version counts as partial', async () => {
    serverRow = serverBase('x', { ...extended, version: extended.version - 1 });
    const p = await pipeline();
    await p.loadOrEnqueue(freshFile(), 'old.mod', undefined, 'high');
    expect(sentinel.analyze).toBe(0);
    expect(sentinel.extended).toBe(1);
    p.dispose();
  });

  it('no server row: the full local analysis runs once and is uploaded with the extended analysis', async () => {
    const p = await pipeline();
    await p.loadOrEnqueue(freshFile(), 'miss.mod', undefined, 'high');
    expect(sentinel.analyze).toBe(1);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].extended).not.toBeNull();
    p.dispose();
  });

  it('a server slower than the lookup timeout: asked once, one full local analysis, one upload (never two analyses)', async () => {
    serverRow = 'never';
    const p = await pipeline();
    await p.loadOrEnqueue(freshFile(), 'slow.mod', undefined, 'high');
    expect(lookups).toHaveLength(1);
    expect(sentinel.analyze).toBe(1);
    expect(sentinel.extended).toBe(0);
    expect(uploads).toHaveLength(1);
    p.dispose();
  }, 15000);

  it('local audio that was analysed before the extended analysis existed adopts the server\'s full row without analysing', async () => {
    const { updateCacheAnalysis, getCachedAudio } = await import('../DJAudioCache');
    const { isCacheFullyAnalyzed } = await import('../DJPipeline');
    const p = await pipeline();
    const file = freshFile();
    await p.loadOrEnqueue(file, 'old-entry.mod', undefined, 'high'); // miss: analysed here
    expect(sentinel.analyze).toBe(1);
    await updateCacheAnalysis(file, { analysisVersion: 1, extended: undefined });
    expect(isCacheFullyAnalyzed((await getCachedAudio(file))!)).toBe(false);
    serverRow = serverBase('x', extended);
    // A decoded OfflineAudioContext is not needed: the full server row is adopted before any decode.
    const result = await p.loadOrEnqueue(file, 'old-entry.mod', undefined, 'high');
    expect(sentinel.analyze).toBe(1);
    expect(sentinel.extended).toBe(0);
    expect(result.analysis?.extended?.version).toBe(extended.version);
    expect(isCacheFullyAnalyzed((await getCachedAudio(file))!)).toBe(true);
    p.dispose();
  });
});
