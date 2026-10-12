/**
 * DECK-BPM-TWO-VALUES (owner LOCAL 2026-10-12): Mortimer Twang 'suggestive
 * vibes' loaded from the online browser showed 93.8 on Deck A while the deck's
 * detectedBPM and effectiveBPM (sync, Auto DJ, MCP) were 184.57. The pipeline
 * put the analysis on the deck during the render (beat grid and BPM from the
 * module walk, 93.75); then the browser's loadAudioToDeck wrote the analysis'
 * raw `bpm` - the audio detector's 184.57 - as the deck tempo, and left the
 * grid. Every render load now goes through loadRenderToDeck: the audio, then
 * applyAnalysisToDeck, the one writer of the deck tempo.
 *
 * Through the real browser button (DJModlandBrowser "1"), DJEngine.loadAudioToDeck
 * and DJPipeline.applyAnalysisToDeck on the real module; fake deck, render and
 * network. The pipeline stand-in applies the analysis during the render, as
 * the real one does for a deck load.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  song: null as unknown,
  bytes: new ArrayBuffer(0),
  analysis: null as unknown,
  applies: 0,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('@/engine/dj/DJPipeline', async (orig) => {
  const actual = await orig<typeof import('@/engine/dj/DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('@/lib/modlandApi', () => ({
  searchModland: async () => ({ results: [{ full_path: 'pub/modules/Protracker/Mortimer Twang/suggestive vibes.mod', filename: 'suggestive vibes.mod', format: 'Protracker', author: 'Mortimer Twang' }] }),
  getModlandFormats: async () => [],
  getModlandStatus: async () => ({ status: 'ready', totalFiles: 1, lastUpdate: null }),
}));
vi.mock('@/lib/hvscApi', () => ({ searchHVSC: async () => [], downloadHVSCFile: async () => new ArrayBuffer(0) }));
vi.mock('@/lib/ratingsApi', () => ({ batchGetRatings: async () => ({}), setRating: async () => {}, removeRating: async () => {} }));
vi.mock('@/lib/song/openSong', async (orig) => ({
  ...(await orig<typeof import('@/lib/song/openSong')>()),
  openDeckTrack: async () => ({ song: holder.song, bytes: holder.bytes, companionList: undefined }),
}));

import { render, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useDJStore } from '@/stores/useDJStore';
import { DJModlandBrowser } from '@/components/dj/DJModlandBrowser';
import { corpusPipelineAnalysis, corpusTrack } from '../autodj/testing/corpus';

const FIXTURE = 'mortimer-twang-suggestive-vibes.mod';
const RENDER_SEC = 179.165; // the live deck's duration

describe("a rendered module deck has one tempo: 'suggestive vibes' is 93.75 everywhere", () => {
  beforeEach(async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const bytes = readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures', FIXTURE));
    holder.bytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    holder.song = await parseModuleToSong(new File([bytes], FIXTURE));
    // The audio detector's reading of the render (the live 184.57).
    holder.analysis = corpusPipelineAnalysis(corpusTrack('tracker'), { bpm: 184.57086181640625 });
    holder.applies = 0;

    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    let loaded: TrackerSong | null = null;
    const deck = {
      loadSong: async (s: TrackerSong) => { loaded = s; }, clearLoadedSong: () => { loaded = null; }, getLoadedSong: () => loaded,
      loadAudioFile: async () => ({ duration: RENDER_SEC, sampleRate: 44100, numberOfChannels: 2, waveformPeaks: new Float32Array(4) }),
    };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: () => deck, remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
    });
    const pipeline = Object.create(DJPipeline.prototype) as InstanceType<typeof DJPipeline>;
    const realApply = pipeline.applyAnalysisToDeck.bind(pipeline);
    pipeline.applyAnalysisToDeck = (id, a) => { holder.applies++; realApply(id, a); };
    // A deck render: the real pipeline applies the analysis to the deck when the render ends.
    (pipeline as unknown as { loadOrEnqueue: unknown }).loadOrEnqueue = async (_b: ArrayBuffer, _n: string, deckId?: 'A' | 'B') => {
      const analysis = holder.analysis as Parameters<typeof realApply>[1];
      // Live, that in-render apply already read the module (the deck showed 93.8): the deck held the song.
      if (deckId) { await deck.loadSong(holder.song as TrackerSong); pipeline.applyAnalysisToDeck(deckId, analysis); }
      return { wavData: new ArrayBuffer(16), duration: RENDER_SEC, sampleRate: 44100, waveformPeaks: new Float32Array(4), analysis };
    };
    holder.pipeline = pipeline;
    useDJStore.getState().setDeckState('A', { fileName: null, isPlaying: false, detectedBPM: 125, effectiveBPM: 125, beatGrid: null, trackAnalysis: null, pitchOffset: 0, durationMs: RENDER_SEC * 1000 });
  });
  afterEach(() => { cleanup(); });

  it('Load to Deck 1 from the online browser: detectedBPM, effectiveBPM, beat grid and the shown BPM are all 93.75', async () => {
    const view = render(<DJModlandBrowser />);
    fireEvent.change(view.getByPlaceholderText('Search online archives...'), { target: { value: 'suggestive vibes' } });
    const row = await waitFor(() => view.getByText('suggestive vibes.mod'), { timeout: 3000 });
    const loadButton = Array.from(row.closest('[data-result-item]')!.querySelectorAll('button')).find((b) => b.textContent?.trim() === '1');
    expect(loadButton).toBeTruthy();
    await act(async () => { fireEvent.click(loadButton!); });
    await waitFor(() => expect(useDJStore.getState().decks.A.playbackMode).toBe('audio'), { timeout: 5000 });

    const d = useDJStore.getState().decks.A;
    expect(d.trackAnalysis?.tempoSource).toBe('module');
    expect(d.detectedBPM).toBeCloseTo(93.75, 2);
    expect(d.effectiveBPM).toBeCloseTo(93.75, 2);
    expect(d.beatGrid?.bpm).toBeCloseTo(93.75, 2);
    // The grid is the module's beats: a mean of 0.64 s apart (single beats follow the song's tempo changes).
    const beats = d.beatGrid!.beats;
    expect((beats[beats.length - 1] - beats[0]) / (beats.length - 1)).toBeCloseTo(60 / 93.75, 1);
    // The deck header (DeckTrackInfo) shows the grid's BPM; it is the same number.
    expect(Math.round((d.beatGrid?.bpm ?? 0) * 10) / 10).toBe(93.8);
    // Sentinel: the analysis went on the deck after the deck held the track, not only during the render.
    expect(holder.applies).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
