/**
 * The Three Deck Showcase render (owner decision 2026-10-13: "the routine's own A/B juggle layer (J1-J10, X8)
 * plays through a Three Deck Showcase action: the demo's whole render (routine + its A/B layer) plays while the
 * set holds; it never changes the DJ mixer and never layers two beats").
 *
 * `three_deck.render_from_params({})` - the demo's default Render - line for line:
 *   A/B   build_juggle_bus on the shipped hip-hop records (two per section, SECTION_DECK_PAIR; J1-J10) plus
 *         JUGGLE_REVERB_MIX x sampler.reverb(small_room) (X8)
 *   C     build_scratch_events on the crate's cue pools, every stroke render_gesture'd (`ScratchVoicePool`) on
 *         three_deck's integer step grid with RandomState(seed)'s +-4 ms, summed on the Deck C worklet
 *         (deck_c_eq + scratch_channel + 0.22 dark-room tail) rendered offline
 *   mix   level 0.60 x rms(A/B) / rms(C) over the 32 bars, the 40 Hz duck (depth 0.25), 0.72 x A/B + duck x C,
 *         the 0.98 peak cap, then render_from_params' 0.94 normalisation
 * and the same render's viz capture (three_deck `collect_viz`: Deck C's platter / fader / slip, the A/B platters'
 * juggle pushes and rewinds - D5) quantized to dj_viz's 50 Hz streams (`djViz.ts`: D1, D3, D4, D6).
 */

import {
  buildJuggleBus, buildJuggleEvents, hiphopRecord, juggleStep, makeBreak, readFloatWav, DECK_A,
  JUGGLE_RATE, THREE_DECK_RECORDS, type JuggleEvent, type JuggleSource,
} from './beatJuggle';
import { samplerReverb } from './refDsp';
import { createDeckCBus, deckCDuck, deckCLevel, DECK_C_TAPS } from './scratchDeckC';
import { buildThreeDeckRoutine, demoRoutineRenderSpecs, scratchPermissionFor, THREE_DECK_ARC, THREE_DECK_BUDGET, THREE_DECK_ENERGY, type DemoRoutineEvent } from './scratchDemoRoutines';
import { getGesture } from './scratchGestureCatalog';
import { getScratchRecord } from './scratchCatalogue';
import { demoGestureName, type GestureViz } from './scratchRender';
import { quantize, type DjVizStreams, type VizJuggleEvent, type VizScratchEvent } from './djViz';
import type { ScratchVoicePool } from './scratchVoicePool';

export const SHOWCASE_RATE = JUGGLE_RATE;

/** The shipped hip-hop records (THREE_DECK_RECORDS order) and the tempo each was rendered at (hiphop STYLES). */
export const JUGGLE_RECORD_FILES: ReadonlyArray<{ style: string; key: string; srcBpm: number; file: string }> = [
  { style: 'golden_era', key: 'Am', srcBpm: 98, file: 'golden_era_Am.f32.wav' },
  { style: 'east_coast', key: 'Cm', srcBpm: 96, file: 'east_coast_Cm.f32.wav' },
  { style: 'g_funk', key: 'Gm', srcBpm: 100, file: 'g_funk_Gm.f32.wav' },
  { style: 'lofi', key: 'Dm', srcBpm: 85, file: 'lofi_Dm.f32.wav' },
  { style: 'memphis', key: 'Em', srcBpm: 78, file: 'memphis_Em.f32.wav' },
];
export const JUGGLE_RECORDS_URL = '/data/samples/packs/juggle-records/';

/** three_deck's scalar knobs (param_schema; module defaults). */
export interface ShowcaseParams {
  bpm: number;
  seed: number;
  budget: number;
  /** DECK_C_LEVEL_SCALE: Deck C's RMS as a fraction of the A/B bus. */
  levelScale: number;
  /** DUCK_DEPTH: how far Deck C ducks on the A/B transients. */
  duckDepth: number;
  /** JUGGLE_REVERB_MIX: the small-room send on the A/B bus (X8). */
  juggleReverbMix: number;
}
export const SHOWCASE_DEFAULTS: Readonly<ShowcaseParams> = { bpm: 92, seed: 0, budget: THREE_DECK_BUDGET, levelScale: 0.60, duckDepth: 0.25, juggleReverbMix: 0.06 };

export interface ShowcaseRenderIO {
  /** A shipped juggle record's bytes (`public/data/samples/packs/juggle-records/<file>`). */
  juggleRecordBytes(file: string): Promise<ArrayBuffer>;
  /** The stroke renderer (the pool: the crate read the demo's way, render_gesture). */
  strokes: Pick<ScratchVoicePool, 'renderStrokeViz'>;
  /** An offline context for the Deck C bus. */
  offline(length: number, rate: number): OfflineAudioContext;
}

/** three_deck's viz capture (audio rate, the render's length). */
export interface ShowcaseViz { angleA: Float64Array; angleB: Float64Array; angleC: Float64Array; faderC: Float64Array; slipC: Float64Array }

export interface ShowcaseRender {
  /** The finished render (render_from_params: peak 0.94), mono at 22,050 Hz. */
  mix: Float32Array;
  /** The A/B bus with its small room (X8). */
  juggle: Float64Array;
  /** Deck C's level against the A/B bus. */
  level: number;
  rate: number;
  bpm: number;
  events: DemoRoutineEvent[];
  juggleEvents: JuggleEvent[];
  viz: ShowcaseViz;
  /** Deck C's strokes as placed (render sample, the stroke's viz, its length): Deck C's platter and faders follow them. */
  strokes: Array<{ start: number; length: number; viz: GestureViz | null }>;
  /** dj_viz's 50 Hz streams of this render. */
  streams: DjVizStreams;
  nTicks: number;
}

/** Reachability sentinels: showcases rendered, Deck C strokes rendered into one. */
export const showcaseStats = { renders: 0, strokes: 0 };

/** `_deck_active_sections(budget)`: per arc section the audible decks (A + B always; C when it scratches). */
export function deckActiveSections(budget = THREE_DECK_BUDGET): Array<[number, number, number]> {
  return THREE_DECK_ARC.map(([, b0, bars, jl, sl, role]) => [b0, b0 + bars, 0b011 | (role !== 'silent' && Math.min(sl, scratchPermissionFor(jl, budget)) > 0 ? 0b100 : 0)]);
}

/** The demo's name for a routine event's gesture (dj_viz's enum). */
const vizGesture = (g: DemoRoutineEvent['gesture']): string => g === 'needleDrop' ? 'needle_drop' : g === 'needleLift' ? 'needle_lift' : demoGestureName(g) ?? g;

/** `build_hiphop_records(bpm, rate, 0)` from the shipped bars. */
export async function showcaseRecords(io: Pick<ShowcaseRenderIO, 'juggleRecordBytes'>, bpm: number): Promise<JuggleSource[]> {
  if (JUGGLE_RECORD_FILES.length !== THREE_DECK_RECORDS.length) throw new Error('juggle records out of step with THREE_DECK_RECORDS');
  return Promise.all(JUGGLE_RECORD_FILES.map(async (r) => hiphopRecord(readFloatWav(await io.juggleRecordBytes(r.file)).pcm, r.style, r.srcBpm, bpm, SHOWCASE_RATE, 0)));
}

/** `three_deck.render_from_params({...})`: the whole showcase and its viz streams. */
export async function renderThreeDeckShowcase(io: ShowcaseRenderIO, params: Partial<ShowcaseParams> = {}): Promise<ShowcaseRender> {
  showcaseStats.renders++;
  const p: ShowcaseParams = { ...SHOWCASE_DEFAULTS, ...params };
  const rate = SHOWCASE_RATE, bpm = p.bpm, seed = p.seed;
  const step = juggleStep(bpm, rate), barLen = step * 16, total = 32 * barLen;

  // --- A/B juggle bus + its small room (X8) ---
  const records = await showcaseRecords(io, bpm);
  const juggle = buildJuggleBus(bpm, rate, seed, { records });
  const room = samplerReverb(juggle, rate, 'small_room', 1.0);
  for (let i = 0; i < juggle.length; i++) juggle[i] = juggle[i]! + p.juggleReverbMix * room[i]!;

  // --- Deck C: the routine on the crate, three_deck's grid, the worklet chain offline ---
  const events = buildThreeDeckRoutine(seed, { budget: p.budget });
  const specs = demoRoutineRenderSpecs(events, seed, 'threeDeck');
  const busLen = juggle.length + Math.trunc(0.6 * rate);
  const rvC = new Float64Array(busLen).fill(1), slipC = new Float64Array(busLen), faderC = new Float64Array(busLen);
  const placed: ShowcaseRender['strokes'] = [];
  const off = io.offline(juggle.length, rate);
  const bus = await createDeckCBus(off, off.destination, { chain: 'threeDeck', tap: DECK_C_TAPS.tail, planned: true });
  for (let k = 0; k < events.length; k++) {
    const e = events[k]!, spec = { ...specs[k]!, stepSamples: step };
    const gesture = getGesture(e.gesture);
    const record = e.record ? getScratchRecord(e.record) ?? null : null;
    const r = await io.strokes.renderStrokeViz(gesture, record, spec, bpm, e.velocity);
    if (!r) continue;
    showcaseStats.strokes++;
    let o = e.bar * barLen + e.step * step;
    if (!gesture.needle) o = Math.max(0, o + spec.humanizeSamples);
    bus.stroke(o, r.out);
    placed.push({ start: o, length: r.out.length, viz: r.viz });
    const eo = Math.min(busLen, o + r.out.length);
    for (let s = o; s < eo; s++) {
      if (r.viz) {
        rvC[s] = r.viz.recordVel[s - o]!;
        slipC[s] = r.viz.slipVel[s - o]!;
        faderC[s] = Math.max(faderC[s]!, r.viz.fade[s - o]!);
      } else faderC[s] = Math.max(faderC[s]!, 1.0);
    }
  }
  await new Promise((res) => setTimeout(res, 0));
  const cbus = (await off.startRendering()).getChannelData(0);

  // --- level match, duck, mix, headroom (three_deck.render), then render_from_params' normalisation ---
  const level = deckCLevel(cbus.subarray(0, total), juggle.subarray(0, total), p.levelScale);
  const duck = deckCDuck(juggle, rate, p.duckDepth);
  const n = juggle.length;
  const mix64 = new Float64Array(n);
  const maxAbs = (): number => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(mix64[i]!)); return m; };
  for (let i = 0; i < n; i++) mix64[i] = 0.72 * juggle[i]! + cbus[i]! * level * duck[i]!;
  let mx = maxAbs();
  if (mx + 1e-9 > 0.98) { const g = 0.98 / (mx + 1e-9); for (let i = 0; i < n; i++) mix64[i] = mix64[i]! * g; mx = maxAbs(); }
  const norm = 0.94 / (mx + 1e-9);
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = mix64[i]! * norm;

  // --- viz: the A/B platters push and rewind on the juggle bursts (D5), Deck C from its strokes (D1) ---
  // rv_a / rv_b are as long as rv_c (the bus with its 0.6 s tail); every track is cut to the render after cumsum
  const rvA = new Float64Array(busLen).fill(1), rvB = new Float64Array(busLen).fill(1);
  const src = makeBreak({ style: 'boombap', bpm, rate });
  const jev = buildJuggleEvents(src);
  const MANIP = new Set(['STUTTER', 'REORDER', 'REPEAT', 'FILL']);
  const last: Record<string, number> = { A: -(10 ** 9), B: -(10 ** 9) };
  const minGap = step * 2;
  const sortedJ = jev.map((e, i) => [e, i] as const).sort((x, y) => x[0][0] - y[0][0] || x[0][1] - y[0][1] || x[1] - y[1]).map(([e]) => e);
  for (const [jb, jst, jdeck, , jdur, jrole] of sortedJ) {
    if (!MANIP.has(jrole)) continue;
    const o = jb * barLen + jst * step;
    if (o >= busLen || o - last[jdeck]! < minGap) continue;
    if (faderC[Math.min(o, faderC.length - 1)]! > 0.3) continue;
    last[jdeck] = o;
    const trk = jdeck === DECK_A ? rvA : rvB;
    const dur = Math.max(1, jdur * step);
    const e = Math.min(busLen, o + dur);
    trk.fill(2.0, o, e);
    const rw = Math.min(busLen - e, Math.max(1, Math.trunc(dur * 0.5)));
    if (rw > 0) trk.fill(-1.6, e, e + rw);
  }
  const cumsum = (x: Float64Array): Float64Array => { const o = new Float64Array(x.length); let acc = 0; for (let i = 0; i < x.length; i++) { acc += x[i]!; o[i] = acc; } return o; };
  const fit = (x: Float64Array): Float64Array => { const o = new Float64Array(n); o.set(x.subarray(0, Math.min(n, x.length))); return o; };
  const viz: ShowcaseViz = { angleA: fit(cumsum(rvA)), angleB: fit(cumsum(rvB)), angleC: fit(cumsum(rvC)), faderC: fit(faderC), slipC: fit(slipC) };
  const nTicks = Math.trunc(n / rate * 50);
  const scratchEvents: VizScratchEvent[] = events.map((e) => [e.bar, e.step, e.cueRole, vizGesture(e.gesture), e.velocity]);
  const streams = quantize({
    platterAngles: { a: viz.angleA, b: viz.angleB, c: viz.angleC }, faderC: viz.faderC, slipC: viz.slipC,
    scratchEvents, juggleEvents: jev as unknown as VizJuggleEvent[], deckActiveSections: deckActiveSections(p.budget),
    beatmix: juggle.subarray(0, n), bpm, rate, nTicks,
    arcEnergy: THREE_DECK_ARC.map(([, b0, bars], i) => [b0, bars, THREE_DECK_ENERGY[i]!] as const),
    juggleArc: THREE_DECK_ARC.map(([, b0, bars, jl]) => [b0, bars, jl / 4.0] as const),
  });
  return { mix, juggle, level, rate, bpm, events, juggleEvents: jev, viz, strokes: placed, streams, nTicks };
}

