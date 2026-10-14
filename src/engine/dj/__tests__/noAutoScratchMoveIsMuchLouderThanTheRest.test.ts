/**
 * No Auto Scratch move is much louder than the rest (owner 2026-10-14, AUTO-SCRATCH-LOUD-MOVES: "sometimes the
 * auto scratch does moves MUCH louder than the rest"). Per-move loudness over a headless Auto Scratch set.
 * The controller's entry (`DJScratchDJ.tick`) plans a set of corpus tracks back to back; every event is fired the
 * way `fx_scratch_*` fires it (`ScratchVoicePool.perform`) on the pool's live Deck C buses (`follow`), and the
 * real worklet (`public/worklets/scratch-deck-c.worklet.js`) runs headless at its bus rate, decks A + B a steady
 * beat on its input. Per move: the bus output RMS over the stroke. Cause: the live level's layer mean square ran
 * from the bus's first stroke, so idle time counted as layer (a stroke after a rest +26 dB) and a new bus's first
 * stroke was levelled on its own attack (+13 dB). Fix: the worklet's followLevel, the scratch_dj routine shaped whole.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis, type CorpusId } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import { scratchStyleFor } from '../scratch/scratchStyles';
import { ScratchVoicePool } from '../scratch/scratchVoicePool';
import { overlayRender } from '../scratch/scratchPlanner';
import { getGesture } from '../scratch/scratchGestureCatalog';
import { getScratchRecord } from '../scratch/scratchCatalogue';
import { DEMO_RATE } from '../scratch/scratchRender';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchEvent, ScratchCue } from '../scratch/scratchTypes';
import type { ScratchRoutineShape } from '../scratch/DJScratchDJ';

interface Proc {
  port: { onmessage: ((e: { data: unknown }) => void) | null };
  busSample(i: number): number;
  takeBeat(input: Float32Array[]): void;
  level: number;
  strokes: Array<{ start: number; samples: Float64Array }>;
}

/** The worklet's processor class, loaded headless (no Web Audio: the bus is driven sample by sample). */
function workletProcessor(): new (o: { processorOptions: Record<string, unknown> }) => Proc {
  const src = readFileSync(join(process.cwd(), 'public', 'worklets', 'scratch-deck-c.worklet.js'), 'utf8');
  let cls: unknown = null;
  class Base { port = { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: () => undefined }; }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src)(Base, (_n: string, c: unknown) => { cls = c; }, DEMO_RATE);
  return cls as new (o: { processorOptions: Record<string, unknown> }) => Proc;
}

const TRACKS: CorpusId[] = ['steady', 'vocals', 'drops', 'breakdowns', 'longIntro', 'steady', 'vocals'];
const BEAT_RMS = 0.1;

interface Move { ev: ScratchEvent; at: number; chain: string; bus: number; len: number; rawRms: number; outRms: number; level: number; overlap: number; track: number }
type RenderMode = 'section' | 'three_deck' | 'dj_routine';

/** A steady beat (decks A + B): LCG noise at BEAT_RMS. */
function beatNoise(n: number, seed: number): Float32Array<ArrayBuffer> {
  const x = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; x[i] = BEAT_RMS * Math.sqrt(3) * (s / 2147483648 * 2 - 1); }
  return x;
}

async function measureSet(genre: string, mode: 'MUSICAL' | 'PERFORMER' | 'BATTLE', render: RenderMode, opts: { extraEverySec?: number } = {}) {
  const Processor = workletProcessor();
  const procs: Array<{ chain: string; proc: Proc }> = [];
  const g = globalThis as unknown as { AudioWorkletNode?: unknown; OfflineAudioContext?: unknown };
  const prev = { node: g.AudioWorkletNode, off: g.OfflineAudioContext };
  let offlineProc: Proc | null = null;
  g.AudioWorkletNode = class {
    port: { postMessage: (m: unknown) => void };
    constructor(c: { offline?: boolean }, _name: string, o: { processorOptions: Record<string, unknown> }) {
      const proc = new Processor(o);
      if (c.offline) offlineProc = proc; else procs.push({ chain: String(o.processorOptions.mode === 'sections' ? 'overlay' : o.processorOptions.lpHz + ':' + o.processorOptions.room), proc });
      this.port = { postMessage: (m: unknown) => proc.port.onmessage?.({ data: m }) };
    }
    connect() { return undefined; }
    disconnect() { return undefined; }
  };
  // the planned layer's offline render (shapeRoutine): the same processor, driven for the context's length
  g.OfflineAudioContext = class {
    offline = true; destination = {}; audioWorklet = { addModule: async () => undefined };
    readonly length: number;
    constructor(_ch: number, length: number) { this.length = length; }
    async startRendering() {
      const p = offlineProc!, out = new Float32Array(this.length);
      for (let i = 0; i < this.length; i++) out[i] = p.busSample(i);
      return { getChannelData: () => out };
    }
  };
  const ctx = { audioWorklet: { addModule: async () => undefined }, currentTime: 0, sampleRate: DEMO_RATE } as unknown as BaseAudioContext;
  const bytes = async (rec: { file: string }) => { const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', rec.file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer; };
  const beatNode = { connect: () => undefined, disconnect: () => undefined } as unknown as AudioNode;
  const pool = new ScratchVoicePool(ctx, {} as AudioNode, { bytes, beat: beatNode });

  // the set: one track after another, the controller's plan of each (a shape is applied when it is planned)
  const fired: Array<{ ev: ScratchEvent; at: number; bpm: number; track: number }> = [];
  const shapes: Array<{ planAt: number; shape: ScratchRoutineShape }> = [];
  let offset = 1;
  TRACKS.forEach((id, ti) => {
    const track = corpusAnalysis(id);
    const choice = scratchStyleFor('auto', genre);
    let now = offset;
    const ctxAt = (beat: number) => offset + timeAtBeat(track.beatGrid, beat);
    const ctrl = new DJScratchDJ({
      seed: 9 + ti,
      executorFor: () => ({ schedule: (e) => { fired.push({ ev: e, at: ctxAt(e.executeAtBeat), bpm: track.bpm, track: ti }); }, cancel: () => {}, active: 0, contextTimeAtBeat: ctxAt, clockBpm: () => track.bpm }),
      shapeRoutine: (shape) => { shapes.push({ planAt: now, shape }); },
    });
    const bars = track.downbeats.bars.length - 1;
    for (let b = 0; b < bars; b++) for (const f of [0.1, 0.6]) {
      const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + f;
      now = offset + t;
      ctrl.tick({
        perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'CRUISING', setEnergy: 0.6, targetEnergy: 0.7 } as unknown as DJPerformanceContext,
        deck: 'A', mode, style: choice.style, genre: choice.modifiers, genreHint: choice.genre, profile: choice.profile, scratchPermission: 4, render,
      });
    }
    offset += timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, bars)) + 2;
  });
  // DEViLBOX's own strokes on the overlay bus between routines (a juggle response): one now and then
  if (opts.extraEverySec) {
    const base = fired.find((f) => f.ev.source.type === 'CRATE')!;
    for (let t = 30, k = 0; t < offset - 5; t += opts.extraEverySec, k++) {
      const r = overlayRender({ key: `x${k}:verse`, bars: 4, seed: k, profile: 'boombap', demoSteps: () => [] });
      fired.push({ ev: { ...base.ev, gesture: 'baby', velocity: 0.8, render: r.stroke(0, 0, false) }, at: t, bpm: base.bpm, track: -1 });
    }
  }
  fired.sort((a, b) => a.at - b.at);
  shapes.sort((a, b) => a.planAt - b.planAt);

  // drive the buses; each stroke is handed over 1 s before it is due (the executor's lookahead), as fx_scratch_* does
  const total = Math.trunc((offset + 4) * DEMO_RATE);
  const outs = new Map<Proc, Float32Array>();
  const levels = new Map<Proc, Float32Array>();
  const moves: Move[] = [];
  let fi = 0, si = 0, seed = 12345;
  const ensure = () => { for (const { proc } of procs) if (!outs.has(proc)) { outs.set(proc, new Float32Array(total)); levels.set(proc, new Float32Array(Math.ceil(total / 128))); } };
  for (let base = 0; base < total; base += 128) {
    const t = base / DEMO_RATE;
    while (si < shapes.length && shapes[si]!.planAt <= t) {
      const sh = shapes[si++]!.shape;
      const n = Math.trunc(sh.endSec * DEMO_RATE) - Math.trunc(sh.startSec * DEMO_RATE);
      await pool.shapeRoutinePlan(sh, [{ audio: { sampleRate: DEMO_RATE, numberOfChannels: 1, length: n + 64, getChannelData: () => beatNoise(n + 64, 777 + si) }, trackFromSec: 0, gain: 1 }]);
    }
    while (fi < fired.length && fired[fi]!.at <= t + 1) {
      const f = fired[fi++]!, e = f.ev;
      const record = e.source.type === 'CRATE' ? e.source.recordId : undefined;
      const nBefore = procs.length;
      const h = pool.perform(getGesture(e.gesture), { record, role: e.role, bpm: f.bpm, velocity: e.velocity, cue: e.anchor.position as ScratchCue, at: f.at, fx: e.fx, render: e.render });
      if (!h || !(await h.started).ok) continue;
      void nBefore;
      ensure();
      // the bus the stroke landed on: the one whose newest stroke is this one
      const chain = e.render?.section ? 'overlay' : e.render?.chain ?? 'threeDeck';
      const samples = await pool.renderStroke(getGesture(e.gesture), record ? getScratchRecord(record) ?? null : null, e.render ?? { seed: 0, humanizeSamples: 0, chain: 'threeDeck' }, f.bpm, e.velocity, e.render ? null : (e.anchor.position as ScratchCue));
      const busIdx = procs.findIndex((p) => (chain === 'overlay') === (p.chain === 'overlay') && (chain === 'overlay' || p.proc.strokes.some((k) => k.samples.length === samples?.length && k.start === Math.max(0, Math.trunc(f.at * DEMO_RATE) + (e.render?.humanizeSamples ?? 0)))));
      let s2 = 0;
      for (let i = 0; i < (samples?.length ?? 0); i++) s2 += samples![i]! * samples![i]!;
      const len = samples?.length ?? 0;
      moves.push({ ev: e, at: Math.max(0, Math.trunc(f.at * DEMO_RATE) + (e.render?.humanizeSamples ?? 0)), chain: procs[busIdx]?.chain ?? chain, bus: busIdx, len, rawRms: Math.sqrt(s2 / Math.max(1, len)), outRms: 0, level: 0, overlap: 0, track: f.track });
    }
    ensure();
    const chunk = beatNoise(128, seed); seed = (seed * 7 + 13) % 2147483647;
    const n = Math.min(128, total - base);
    for (const { proc } of procs) {
      proc.takeBeat([chunk]);
      const o = outs.get(proc)!;
      for (let i = 0; i < n; i++) o[base + i] = proc.busSample(base + i);
      levels.get(proc)![base >> 7] = proc.level;
    }
  }
  g.AudioWorkletNode = prev.node; g.OfflineAudioContext = prev.off;
  for (const m of moves) {
    if (m.bus < 0) continue;
    const p = procs[m.bus]!.proc, o = outs.get(p)!;
    let e = 0;
    const end = Math.min(total, m.at + m.len);
    for (let i = m.at; i < end; i++) e += o[i]! * o[i]!;
    m.outRms = Math.sqrt(e / Math.max(1, end - m.at));
    const lv = levels.get(p)!;
    m.level = lv[Math.min(lv.length - 1, (m.at + (m.len >> 1)) >> 7)]!;
    m.overlap = moves.filter((x) => x !== m && x.at < m.at + m.len && x.at + x.len > m.at).length;
  }
  return { moves: moves.filter((m) => m.bus >= 0), procs };
}

const db = (x: number) => 20 * Math.log10(x + 1e-12);
function pct(xs: number[], p: number) { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!; }

/** Measured before the fix (max over the routine's median): dj_routine +12.9 dB (a new bus's first strokes), the
 *  overlay +7.0 dB, a stroke on the overlay between three_deck routines +26.2 dB; after: +2.3, +4.2, +4.1 dB. */
const MAX_OVER_MEDIAN_DB = 6;

describe('no Auto Scratch move is much louder than the rest of the routine (AUTO-SCRATCH-LOUD-MOVES)', () => {
  const CASES: Array<[string, 'MUSICAL' | 'PERFORMER' | 'BATTLE', RenderMode, number?]> = [
    ['hipHop', 'BATTLE', 'dj_routine'], ['techno', 'MUSICAL', 'section'], ['hipHop', 'PERFORMER', 'three_deck', 90],
  ];
  for (const [genre, mode, render, extra] of CASES) {
    it(`${genre} ${mode}, Render ${render}${extra ? `, a stroke on the overlay every ${extra} s` : ''}: no move more than ${MAX_OVER_MEDIAN_DB} dB over the median`, async () => {
      const { moves } = await measureSet(genre, mode, render, { extraEverySec: extra });
      const heard = moves.filter((m) => m.outRms > 0 && !m.ev.gesture.startsWith('needle'));
      expect(heard.length).toBeGreaterThan(100);
      const med = pct(heard.map((m) => db(m.outRms)), 0.5);
      const loud = heard.map((m) => ({ m, over: db(m.outRms) - med })).sort((a, b) => b.over - a.over).slice(0, 5)
        .map(({ m, over }) => `+${over.toFixed(1)} dB ${m.ev.gesture} ${m.ev.source.type === 'CRATE' ? m.ev.source.recordId : ''} at ${(m.at / DEMO_RATE).toFixed(1)} s on ${m.chain}`);
      if (extra) expect(heard.some((m) => m.chain === 'overlay')).toBe(true);
      expect(db(Math.max(...heard.map((m) => m.outRms))) - med, loud.join('; ')).toBeLessThanOrEqual(MAX_OVER_MEDIAN_DB);
    }, 300_000);
  }
});
