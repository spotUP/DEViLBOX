/**
 * The Up Rough song player (plan 2026-10-20 O6k2): the tracker plays the rendered mix as ONE whole-song source.
 * The render backend here is the worker's own job (runRenderJob) over a shared cache, run in-process; the audio side is
 * a recording fake. The ONE reachability test (TrackerReplayer.play() -> startUpRoughSong, buffer == renderSong) lives in
 * src/engine/__tests__/upRoughReplayerPlay.test.ts; this file holds the behaviours at the player and service.
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
import * as songRender from '@engine/uprough/songRender';
import type { PartialMix } from '@/lib/uprough/songRenderJob';
import type { SectionMixCache } from '@engine/uprough/songRenderCache';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUpRoughRenderStore } from '@stores/useUpRoughRenderStore';
import { buildCurrentSong, startSample, stepSamples } from '@/lib/uprough/currentSongRender';
import { runRenderJob, type SectionEvent } from '@/lib/uprough/songRenderJob';
import {
  currentPartialMix, currentRenderedSong, ensureUpRoughSong, onUpRoughSongPartial, renderUpRoughSong, setRenderBackendForTests,
  type RenderBackend,
} from '@/lib/uprough/upRoughSongService';
import {
  setPlayerAudioForTests, startUpRoughSong, stopUpRoughSong, upRoughPlayheadSample,
  upRoughSongOwnsPlayback, isUpRoughSongPlaying, startUpRoughPreview, isUpRoughPreviewPlaying, upRoughPreviewState,
  type PlayerAudio,
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

/** A backend whose partials and final mix the test delivers by hand. */
function manualBackend(): { backend: RenderBackend; partial: (p: PartialMix) => void; finish: (mix: Float64Array) => void } {
  let onPartial: ((p: PartialMix) => void) | undefined;
  let resolve: ((m: Float64Array) => void) | undefined;
  return {
    backend: { render(_e, _o, _s, _r, p) { onPartial = p; return new Promise<Float64Array>((r) => { resolve = r; }); } },
    partial: (p) => onPartial!(p),
    finish: (mix) => resolve!(mix),
  };
}
const ramp = (n: number, v: number): Float64Array => new Float64Array(n).fill(v);

describe('listen while building (service)', () => {
  it('assembles three partials into the prefix and leaves the final mix untouched until done', async () => {
    const m = manualBackend();
    setRenderBackendForTests(m.backend, 5);
    const seen: number[] = [];
    const off = onUpRoughSongPartial((p) => seen.push(p.section));
    const run = renderUpRoughSong();
    expect(currentPartialMix()).toBeNull();
    const a = ramp(100, 0.1), b = ramp(50, 0.2), c = ramp(70, 0.3);
    m.partial({ section: 0, start: 0, mix: a });
    m.partial({ section: 1, start: 100, mix: b });
    m.partial({ section: 2, start: 150, mix: c });
    expect(seen).toEqual([0, 1, 2]);
    expect(Array.from(currentPartialMix()!)).toEqual([...a, ...b, ...c]);
    expect(currentRenderedSong()).toBeNull();
    m.finish(ramp(220, 0.9));
    await run;
    expect(currentRenderedSong()!.mix).toHaveLength(220);
    off();
  });
});

describe('listen while building (player)', () => {
  it('schedules section N+1 at the end of section N', async () => {
    const m = manualBackend();
    setRenderBackendForTests(m.backend, 5);
    stopUpRoughSong(); started.length = 0; clock.now = 20;
    const run = renderUpRoughSong();
    startUpRoughPreview(0);
    const rate = 22050;
    expect(isUpRoughPreviewPlaying()).toBe(false); // nothing has landed yet
    m.partial({ section: 0, start: 0, mix: ramp(rate, 0.1) });
    expect(isUpRoughPreviewPlaying()).toBe(true);
    m.partial({ section: 1, start: rate, mix: ramp(rate / 2, 0.2) });
    m.partial({ section: 2, start: rate * 1.5, mix: ramp(rate, 0.3) });
    expect(started.map((s) => s.when)).toEqual([20, 21, 21.5]);
    expect(started.map((s) => s.length)).toEqual([rate, rate / 2, rate]);
    expect(started.every((s) => s.offset === 0)).toBe(true);
    m.finish(ramp(rate * 3, 0.9)); await run;
    stopUpRoughSong();
  });

  it('preview swaps to the mastered mix at the same playhead sample', async () => {
    const m = manualBackend();
    setRenderBackendForTests(m.backend, 5);
    stopUpRoughSong(); started.length = 0; clock.now = 20;
    const run = renderUpRoughSong();
    startUpRoughPreview(0);
    const rate = 22050;
    m.partial({ section: 0, start: 0, mix: ramp(rate * 2, 0.1) });
    clock.now = 21;
    expect(upRoughPlayheadSample()).toBe(Math.round(1.0 * rate));
    expect(upRoughPreviewState()).toBe('preview');
    m.finish(ramp(rate * 4, 0.9)); await run;
    expect(started).toHaveLength(2);
    expect(started[1]!.offset).toBe(Math.round(1.0 * rate) / rate);
    expect(started[1]!.when).toBe(21);
    expect(started[0]!.stoppedAt).toBe(21); // same ctx time as the new start
    expect(started[1]!.length).toBe(rate * 4);
    expect(upRoughPreviewState()).toBe('mastered');
    expect(isUpRoughPreviewPlaying()).toBe(false);
    stopUpRoughSong();
    expect(upRoughPreviewState()).toBe('idle');
  });
});
