/**
 * The Up Rough song player (plan 2026-10-20 O6k2): the tracker plays the rendered mix as ONE whole-song source.
 * The render backend here is the worker's own job (runRenderJob) over a shared cache, run in-process; the audio side is
 * a recording fake. One test drives the player entry point the replayer calls (startUpRoughSong, via a play hook)
 * from a loaded fixture and holds the played buffer to renderSong of the same doc.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';

vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';
import { parseSongFile } from '@/lib/uprough/songFile';
import { songFileToBarEvents } from '@/lib/uprough/barEvents';
import { renderSong, songRenderOptions } from '@engine/uprough/songRender';
import * as songRender from '@engine/uprough/songRender';
import type { SectionMixCache } from '@engine/uprough/songRenderCache';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUpRoughRenderStore } from '@stores/useUpRoughRenderStore';
import { buildCurrentSong, startSample, stepSamples } from '@/lib/uprough/currentSongRender';
import { runRenderJob, type SectionEvent } from '@/lib/uprough/songRenderJob';
import {
  ensureUpRoughSong, renderUpRoughSong, setRenderBackendForTests, type RenderBackend,
} from '@/lib/uprough/upRoughSongService';
import {
  setPlayerAudioForTests, startUpRoughSong, stopUpRoughSong, upRoughMixPlayed, upRoughPlayheadSample,
  upRoughSongOwnsPlayback, isUpRoughSongPlaying, type PlayerAudio,
} from '@/lib/uprough/upRoughSongPlayer';

const text = JSON.stringify(fixture);
const cache: SectionMixCache = new Map();
const sectionEvents: SectionEvent[] = [];
let renderCalls = 0;
const backend: RenderBackend = {
  async render(events, options, onSection) {
    renderCalls++;
    return runRenderJob(events, options, cache, (e) => { sectionEvents.push(e); onSection(e); });
  },
};

interface Started { when: number; offset: number; length: number; data: Float32Array; stoppedAt: number | null }
const started: Started[] = [];
const clock = { now: 0 };
const fakeAudio: PlayerAudio = {
  context: {
    get currentTime() { return clock.now; },
    createBuffer: (_c: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
    },
    createBufferSource: () => {
      const rec: Started = { when: 0, offset: 0, length: 0, data: new Float32Array(0), stoppedAt: null };
      const node = {
        buffer: null as AudioBuffer | null, loop: false,
        connect: () => undefined, disconnect: () => undefined,
        start(when: number, offset: number) { rec.when = when; rec.offset = offset; rec.length = node.buffer!.length; rec.data = node.buffer!.getChannelData(0); started.push(rec); },
        stop(when?: number) { rec.stoppedAt = when ?? clock.now; },
      };
      return node as unknown as AudioBufferSourceNode;
    },
  },
  destination: {} as AudioNode,
};

const maxErr = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let m = a.length === b.length ? 0 : Infinity;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};

/** Edits one melody note of `pattern` so that exactly one section's events change; returns that section index. */
function editOneNote(pattern: number): number {
  const before = buildCurrentSong().events.sections.map((s) => JSON.stringify(s));
  const { patterns } = useTrackerStore.getState();
  const p = patterns[pattern]!;
  for (let c = 0; c < p.channels.length; c++) {
    for (let r = 0; r < p.channels[c]!.rows.length; r++) {
      const cell = p.channels[c]!.rows[r]!;
      if (!cell.note) continue;
      const next = patterns.map((q, qi) => qi !== pattern ? q : {
        ...q, channels: q.channels.map((ch, ci) => ci !== c ? ch : { ...ch, rows: ch.rows.map((row, ri) => ri !== r ? row : { ...row, note: row.note + 2 }) }),
      });
      useTrackerStore.setState({ patterns: next });
      try {
        const after = buildCurrentSong().events.sections.map((s) => JSON.stringify(s));
        const changed = after.flatMap((s, i) => (s !== before[i] ? [i] : []));
        if (changed.length === 1) return changed[0]!;
      } catch { /* this edit is not representable; try the next cell */ }
      useTrackerStore.setState({ patterns });
    }
  }
  throw new Error('no single-section edit found');
}

beforeAll(async () => {
  setRenderBackendForTests(backend, 5);
  setPlayerAudioForTests(fakeAudio);
  await openUpRoughSong(text);
}, 60000);
afterAll(() => { stopUpRoughSong(); setRenderBackendForTests(null); setPlayerAudioForTests(null); });

describe('start offset', () => {
  it('(b) equals (orderIndex * 16 + row) * stepSamp for 16-row patterns, and sums longer patterns', () => {
    const step = stepSamples(22050, 140);
    expect(step).toBe(Math.trunc((22050 * 60) / (140 * 4)));
    const lens = [16, 16, 16, 16];
    const order = [0, 1, 2, 3];
    expect(startSample(lens, order, 2, 5, 22050, 140)).toBe((2 * 16 + 5) * step);
    expect(startSample([32, 16], [0, 1], 1, 3, 22050, 140)).toBe((32 + 3) * step);
    expect(startSample(lens, [3, 0], 1, 0, 22050, 140)).toBe(16 * step);
  });
});

describe('whole-song path', () => {
  it('(a) is chosen only when upRoughMeta is set', () => {
    expect(useTrackerStore.getState().upRoughMeta).not.toBeNull();
    expect(upRoughSongOwnsPlayback()).toBe(true);
    const meta = useTrackerStore.getState().upRoughMeta;
    useTrackerStore.setState({ upRoughMeta: null });
    expect(upRoughSongOwnsPlayback()).toBe(false);
    useTrackerStore.setState({ upRoughMeta: meta });
    expect(upRoughSongOwnsPlayback()).toBe(true);
  });
});

describe('play, edit, swap', () => {
  it('reachability: play from the loaded fixture renders once, plays one buffer equal to renderSong of the same doc', async () => {
    const spy = vi.spyOn(songRender, 'renderSectionMix');
    started.length = 0; renderCalls = 0; clock.now = 1;
    const doc = parseSongFile(useTrackerStore.getState().exportUpRoughSong());
    const reference = renderSong(songFileToBarEvents(doc), songRenderOptions(doc));
    spy.mockClear();
    await startUpRoughSong(0, 0); // what TrackerReplayer.play() calls when upRoughMeta is set
    const sections = doc.sections.length;
    expect(spy).toHaveBeenCalledTimes(sections); // the song rendered once, every section once (cold cache)
    expect(isUpRoughSongPlaying()).toBe(true);
    expect(renderCalls).toBeGreaterThanOrEqual(1); // sentinel: the render ran through the worker job
    expect(started).toHaveLength(1);
    expect(started[0]!.offset).toBe(0);
    expect(started[0]!.length).toBe(reference.length);
    const played = upRoughMixPlayed()!;
    expect(maxErr(played, reference)).toBeLessThan(1e-9);
    expect(maxErr(started[0]!.data, reference)).toBeLessThan(1e-6); // Float32 copy of the same mix
    spy.mockClear();
    await renderUpRoughSong();
    expect(spy).toHaveBeenCalledTimes(0); // warm cache: a second render rendered no section
    spy.mockRestore();
  }, 120000);

  it('(c) one edited pattern note re-renders exactly one section', async () => {
    await ensureUpRoughSong();
    const spy = vi.spyOn(songRender, 'renderSectionMix');
    sectionEvents.length = 0;
    const edited = editOneNote(2);
    await renderUpRoughSong();
    expect(spy).toHaveBeenCalledTimes(1);
    const fresh = sectionEvents.filter((e) => !e.cached);
    expect(fresh.map((e) => e.section)).toEqual([edited]);
    expect(sectionEvents.every((e) => e.type === 'section' && e.sectionCount === sectionEvents.length)).toBe(true);
    expect(useUpRoughRenderStore.getState().status).toBe('ready');
    spy.mockRestore();
  }, 120000);

  it('(d) a mix that lands while playing replaces the source at the same playhead sample', async () => {
    stopUpRoughSong();
    started.length = 0; clock.now = 10;
    const song = await ensureUpRoughSong();
    await startUpRoughSong(1, 4);
    const from = startSample(useTrackerStore.getState().patterns.map((p) => p.length), useTrackerStore.getState().patternOrder, 1, 4, song.rate, song.bpm);
    expect(started).toHaveLength(1);
    expect(started[0]!.offset).toBeCloseTo(from / song.rate, 9);
    clock.now = 10.5; // half a second of playing
    const playhead = upRoughPlayheadSample();
    expect(playhead).toBe(from + Math.round(0.5 * song.rate));
    editOneNote(3);
    await renderUpRoughSong(); // lands a new mix: the listener swaps it in
    expect(started).toHaveLength(2);
    expect(started[1]!.offset).toBeCloseTo(playhead / song.rate, 9);
    expect(started[1]!.when).toBe(10.5);
    expect(started[0]!.stoppedAt).toBe(10.5); // old source ends where the new one begins: no gap, no overlap
    stopUpRoughSong();
    expect(isUpRoughSongPlaying()).toBe(false);
  }, 120000);
});
