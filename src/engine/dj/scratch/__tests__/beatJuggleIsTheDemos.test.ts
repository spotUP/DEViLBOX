/**
 * PG-I (ledger J1-J10): the demo's beat-juggle engine and the three-deck routine's A/B layer against the demo's own
 * output (tools/scratch-fixtures/gen_beat_juggle.py): the breaks (its drum voices), classify_break, the pattern
 * grammar, the reset planner, validate / repair, the hit renderer and tight tiling, the four routines, the macro
 * language, break fitting, and build_juggle_bus on the synth breaks + the amen and on the shipped hip-hop records.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fixture from './fixtures/beat_juggle.json';
import {
  makeBreak, classifyBreak, JUGGLE_PATTERNS, patHalfBar, planResets, validateJuggle, repairJuggle, rewindTime, renderJuggle, renderHit,
  renderJuggleRoutine, routineEvents16, renderJuggleMacro, fitBreak, loadBreak, buildJuggleEvents, validateBudget, validateThreeDeck,
  buildJuggleBus, hiphopRecord, readFloatWav, DECK_B, beatJuggleStats, type JuggleEvent, type JuggleSource, type JugglePatternName, type JuggleRoutineName,
} from '../beatJuggle';

interface Sub { n: number; keep: number; x: number[]; ss: number }
const RATE = 22050;
const RECS = join(process.cwd(), 'public/data/samples/packs/juggle-records');
const bytesOf = (f: string): ArrayBuffer => { const b = readFileSync(join(RECS, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

/** Residual of our signal against the demo's kept samples, dB below the demo's (and the length). */
function residualDb(ours: ArrayLike<number>, ref: Sub): number {
  expect(ours.length).toBe(ref.n);
  let e = 0, s = 0;
  ref.x.forEach((v, i) => { const d = ours[i * ref.keep]! - v; e += d * d; s += v * v; });
  return 10 * Math.log10(e / s + 1e-300);
}
const evs = (l: readonly (readonly unknown[])[]): JuggleEvent[] => l as unknown as JuggleEvent[];
const norm = (l: readonly JuggleEvent[]) => l.map((e) => [...e]);

const breaks = Object.fromEntries(Object.keys(fixture.breaks).map((v) => [v, makeBreak({ bpm: 92, rate: RATE, variant: v })])) as Record<string, JuggleSource>;

describe('the demo beat-juggle engine (PG-I)', () => {
  it('J3: make_break on the demo drum voices = the demo for all five variants, cues exact; J5 classify_break', () => {
    for (const [v, ref] of Object.entries(fixture.breaks)) {
      expect(residualDb(breaks[v]!.sig, ref.sig), v).toBeLessThan(-150);
      expect(breaks[v]!.cues, v).toEqual(ref.cues);
      expect(breaks[v]!.step).toBe(ref.step);
      expect(classifyBreak(breaks[v]!), v).toEqual(ref.classify);
    }
  });

  it('J1: the eight patterns are the demo grammar', () => {
    for (const [name, ref] of Object.entries(fixture.patterns)) {
      const ours = name === 'half_bar_B' ? patHalfBar(0, DECK_B) : JUGGLE_PATTERNS[name as JugglePatternName](0);
      expect(norm(ours), name).toEqual(ref);
    }
  });

  it('J2 + J9: plan_resets, validate and repair = the demo on every routine and a chaotic list, on all five breaks; rewind_time', () => {
    for (const r of fixture.resets) {
      const src = breaks[r.variant]!;
      const tag = `${r.variant}/${r.name}`;
      expect(planResets(evs(r.events), src, 92, RATE).map((b) => [...b]), tag).toEqual(r.bad);
      expect(validateJuggle(evs(r.events), src, 92, RATE), tag).toEqual(r.validate);
      expect(norm(repairJuggle(evs(r.events), src, 92, RATE)), tag).toEqual(r.repair);
    }
    for (const [a, b, t] of fixture.rewind) expect(rewindTime(breaks.funk!, a as string, b as string, RATE)).toBeCloseTo(t as number, 14);
  });

  it('J7: render_juggle (hit renderer, a500 looped read, tight tiling, the device LFSR timing) = the demo for every pattern', () => {
    for (const [name, ref] of Object.entries(fixture.renders)) {
      const fn = JUGGLE_PATTERNS[name as JugglePatternName];
      expect(residualDb(renderJuggle([...fn(0), ...fn(1)], breaks.boombap!, 92, RATE, { seed: 3 }), ref), name).toBeLessThan(-150);
    }
  });

  it('J7: render_hit reads round the loop end (a record comes round again), not a clamp', () => {
    const src = breaks.boombap!;
    for (const h of fixture.hits) expect(residualDb(renderHit(src, h.cue, (h.steps * src.step) / RATE, RATE, undefined, src.step * 16), h.sig), h.cue).toBeLessThan(-150);
  });

  it('J8: the four routines (repaired events and audio, two records on kick_double) and routine_events_16 = the demo', () => {
    for (const [name, ref] of Object.entries(fixture.routines)) {
      const r = renderJuggleRoutine(name as JuggleRoutineName, breaks.boombap!, 92, RATE, 0, name === 'kick_double' ? breaks.funk! : null);
      expect(norm(r.events), name).toEqual(ref.events);
      expect(residualDb(r.sig, ref.sig), name).toBeLessThan(-150);
    }
    expect(norm(routineEvents16())).toEqual(fixture.events16);
  });

  it('J4: the juggle macro language = render_macro (skipped lines, a two-token STUTTER ignored)', () => {
    const r = renderJuggleMacro(breaks.boombap!, fixture.macro.text, 92, RATE, 5);
    expect(norm(r.events)).toEqual(fixture.macro.events);
    expect(residualDb(r.sig, fixture.macro.sig)).toBeLessThan(-150);
  });

  it('J6: fit_break (the amen 175 -> 92, bar 1) and load_break detect the demo cues', () => {
    const amen = bytesOf('amen_break_175.wav');
    const fit = fitBreak(amen, 175, 92, RATE, 1);
    expect(residualDb(fit.sig, fixture.amen.fit.sig)).toBeLessThan(-120);
    expect(fit.cues).toEqual(fixture.amen.fit.cues);
    const lb = loadBreak(amen, 92, RATE);
    expect(lb.sig.length).toBe(fixture.amen.load.n);
    expect(lb.bars).toBe(fixture.amen.load.bars);
    expect(lb.cues).toEqual(fixture.amen.load.cues);
  });

  it('J10 + J9: the three-deck A/B layer - events, budget, validate, build_juggle_bus on synth breaks + the amen and on the records', () => {
    const td = fixture.threeDeck;
    expect(norm(buildJuggleEvents(breaks.boombap!))).toEqual(td.events);
    expect(validateBudget()).toEqual(td.budget);
    expect(validateBudget(3)).toEqual(td.budgetTight);
    for (const [v, issues] of Object.entries(td.validate)) expect(validateThreeDeck(breaks[v]!), v).toEqual(issues);
    const amenWav = bytesOf('amen_break_175.wav');
    const before = beatJuggleStats.buses;
    expect(residualDb(buildJuggleBus(92, RATE, 4, { amenWav }), td.bus92)).toBeLessThan(-120);
    expect(residualDb(buildJuggleBus(130, RATE, 9, { amenWav }), td.bus130)).toBeLessThan(-120);
    const records = fixture.records.map((r) => hiphopRecord(readFloatWav(bytesOf(r.file)).pcm, r.style, r.srcBpm, 92, RATE, 0));
    records.forEach((r, i) => expect(r.cues).toEqual(td.recordCues[i]));
    // the records are float32 copies of the demo's renders: the bus nulls below the float32 floor
    expect(residualDb(buildJuggleBus(92, RATE, 2, { records }), td.busRecords)).toBeLessThan(-120);
    expect(beatJuggleStats.buses - before).toBe(3);
  });
});
