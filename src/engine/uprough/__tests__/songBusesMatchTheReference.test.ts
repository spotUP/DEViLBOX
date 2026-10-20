/**
 * songBuses against tools/hiphop.py render_section's per-lane bus chains (plan 2026-10-19 O6i).
 * Each case feeds songBuses the lane the host held BEFORE a chain (the argument of trim_drums_to_peak, of the bass
 * sampler.process call and of sampler.apply_macros, taken from render_section's own calls) and compares every sample of
 * the lane it returns with the host's lane AFTER the chain (the arguments of balance_buses, copied on entry) to 1e-9, the
 * same tolerance and cause as the sibling song tests (float accumulation order inside the shared primitives). Lanes live
 * in fixtures/bus_chains.lanes.br (byte-shuffled float64, brotli); each decoded lane must hash to the generator's sha.
 * Sections the generator did not store (keep false) are fed zeros of the recorded length and compared on their gating
 * flags only, which still runs the section-seed advance over the whole song. The DIRT table and its clean copy are
 * compared for all 19 styles. The reachability test counts the host's own calls: drumBus once per drum section the host
 * ran it for, samplerProcess once per bass chain plus once per melody chain, parallelDirt where the host ran it.
 * Regenerate with tools/softsynth-fixtures/gen_bus_chains.py.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/bus_chains.json';
import { songFileToBarEvents, type BarEvents } from '@/lib/uprough/barEvents';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import * as busEffects from '../effects/busEffects';
import { sectionBassOn } from '../songBass';
import { cleanDirt, dirtConfig, sectionMelodyOn, songBuses } from '../songBuses';
import { sectionDrumsOn } from '../songDrums';

interface Arr { n: number; off: number; sha: string; peak: number }
type Lane = 'drums' | 'bass' | 'melody';
interface LaneRec { pre?: Arr; post?: Arr; n?: number }
interface SectionRec {
  bars: number; keep: boolean; on: Record<Lane, boolean>;
  args: { melody_cap_bound?: boolean };
  calls: { trim: number; drum_bus: number; parallel: number; process: number; macros: number };
  lanes: Record<Lane, LaneRec>;
}
interface Case {
  name: string; style: string; rate: number; bpm: number; vintage: boolean; bass_voice: string; melody_yields: boolean;
  doc: SongFileDoc | null; events: BarEvents | null; sections: SectionRec[];
}
interface DirtRow {
  sample_prof: string; bass_prof: string; drum_drive: number; drum_resample: string | null; parallel: number;
  melody_rev: string; melody_rev_mix: number; melody_echo_mix: number; bass_voice: string; in_dirt: boolean;
}
const ref = fixture as unknown as {
  dirt: Record<string, DirtRow>; clean: Record<string, { drum_drive: number; drum_resample: string | null; parallel: number }>;
  cases: Case[];
};

const TOL = 1e-9;
const LANES: Lane[] = ['drums', 'bass', 'melody'];
const lanesBytes = ((): Uint8Array => {
  const planes = brotliDecompressSync(readFileSync(join(__dirname, 'fixtures/bus_chains.lanes.br')));
  const n = planes.length / 8;
  const out = new Uint8Array(planes.length);
  for (let k = 0; k < 8; k++) for (let i = 0; i < n; i++) out[i * 8 + k] = planes[k * n + i]!;
  return out;
})();
const laneOf = (a: Arr): Float64Array => {
  const bytes = lanesBytes.slice(a.off * 8, (a.off + a.n) * 8);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha);
  return new Float64Array(bytes.buffer);
};
const maxErr = (a: Float64Array, b: Float64Array): number => {
  let m = a.length === b.length ? 0 : Infinity;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};
const inputOf = (c: Case): BarEvents => (c.doc ? songFileToBarEvents(c.doc) : c.events!);
const preOf = (s: SectionRec, lane: Lane): Float64Array => {
  const r = s.lanes[lane];
  return s.keep ? laneOf(r.pre!) : new Float64Array(r.n!);
};
const runCase = (c: Case) => {
  const events = inputOf(c);
  const out = songBuses(events, {
    style: c.style, bpm: c.bpm, vintage: c.vintage, melodyYields: c.melody_yields,
    drums: c.sections.map((s) => preOf(s, 'drums')),
    bass: c.sections.map((s) => preOf(s, 'bass')),
    melody: c.sections.map((s) => preOf(s, 'melody')),
  });
  return { events, out };
};

afterEach(() => { vi.restoreAllMocks(); });

describe('DIRT and its clean copy match the host', () => {
  it('dirtConfig equals hiphop.DIRT for all 19 styles', () => {
    expect(Object.keys(ref.dirt)).toHaveLength(19);
    for (const [style, row] of Object.entries(ref.dirt)) {
      expect(dirtConfig(style), style).toEqual({
        samplerProfile: row.sample_prof, bassProfile: row.bass_prof, drumDrive: row.drum_drive,
        drumResample: row.drum_resample, parallel: row.parallel, melodyRoom: row.melody_rev,
        melodyRoomMix: row.melody_rev_mix, melodyEchoMix: row.melody_echo_mix, bassVoice: row.bass_voice,
      });
    }
  });
  it('cleanDirt equals hiphop._clean_dc', () => {
    for (const [style, row] of Object.entries(ref.clean)) {
      const c = cleanDirt(dirtConfig(style));
      expect([c.drumDrive, c.drumResample, c.parallel], style).toEqual([row.drum_drive, row.drum_resample, row.parallel]);
    }
  });
  it('the table covers every bass profile and the melody room the host uses', () => {
    expect(new Set(Object.values(ref.dirt).map((r) => r.bass_prof))).toEqual(new Set(['s950', 'mpc60', 'amiga']));
    expect(new Set(Object.values(ref.dirt).map((r) => r.melody_rev))).toEqual(new Set(['warehouse']));
  });
});

describe('songBuses matches render_section lane for lane', () => {
  for (const c of ref.cases) {
    it(`${c.name}: gating flags and every sample of every stored lane`, () => {
      const { events, out } = runCase(c);
      expect(out.drums).toHaveLength(c.sections.length);
      c.sections.forEach((s, i) => {
        const bars = events.sections[i]!.drums.length;
        expect(bars, `${c.name} s${i} bars`).toBe(s.bars);
        expect(sectionDrumsOn(events, i), `${c.name} s${i} drums on`).toBe(s.on.drums);
        expect(sectionBassOn(events, i), `${c.name} s${i} bass on`).toBe(s.on.bass);
        expect(sectionMelodyOn(events, i, bars, c.melody_yields), `${c.name} s${i} melody on`).toBe(s.on.melody);
        if (!s.keep) return;
        for (const lane of LANES) {
          const want = laneOf(s.lanes[lane].post!);
          expect(maxErr(out[lane][i]!, want), `${c.name} s${i} ${lane}`).toBeLessThan(TOL);
        }
      });
    });
  }
  it('the corpus exercises every chain, every bass profile and the trim, vintage-off, null-melody and windowed paths', () => {
    const secs = ref.cases.flatMap((c) => c.sections.filter((s) => s.keep).map((s) => ({ c, s })));
    for (const lane of LANES) {
      expect(secs.some(({ s }) => s.on[lane]), `${lane} on`).toBe(true);
      expect(secs.some(({ s }) => !s.on[lane]), `${lane} off`).toBe(true);
    }
    expect(new Set(ref.cases.map((c) => ref.dirt[c.style]!.bass_prof))).toEqual(new Set(['s950', 'mpc60', 'amiga']));
    expect(ref.cases.some((c) => !c.vintage)).toBe(true);
    expect(secs.some(({ c, s }) => c.name.endsWith('melody-null') && s.on.melody)).toBe(true);
    expect(secs.some(({ s }) => s.calls.parallel > 0)).toBe(true);
    // a fast-path song whose view yields the melody has the layer off although the section is a hook
    expect(ref.cases.some((c) => !c.doc && c.melody_yields && c.sections.every((s) => !s.on.melody))).toBe(true);
    // the melody make-up cap is live: the host's raw gain exceeded MELODY_MAKEUP_MAX in at least one kept section
    expect(secs.some(({ s }) => s.on.melody && s.args.melody_cap_bound === true)).toBe(true);
    // an 808 bass voice takes the 1600 Hz lp, a string voice 3200 Hz
    expect(new Set(ref.cases.map((c) => c.bass_voice === '808'))).toEqual(new Set([true, false]));
    // at least one drum section was trimmed (pre-chain peak above the 0.8 reference)
    expect(secs.some(({ s }) => s.on.drums && s.lanes.drums.pre!.peak > 0.8)).toBe(true);
    // the windowed case: a section whose melody the host switched off by melody_from_bar although the row has it on
    const win = ref.cases.find((c) => c.name.endsWith('yields'))!;
    const ev = inputOf(win);
    expect(win.sections.some((s, i) => !s.on.melody && Boolean((ev.arrangement[i]![2] as { melody: number }).melody))).toBe(true);
  });
});

describe('reachability: song events -> songBuses runs the shared primitives the way the host did', () => {
  it('calls drumBus, parallelDirt and samplerProcess exactly as often as render_section did', () => {
    const drumBus = vi.spyOn(busEffects, 'drumBus');
    const parallelDirt = vi.spyOn(busEffects, 'parallelDirt');
    const samplerProcess = vi.spyOn(busEffects, 'samplerProcess');
    let hostDrum = 0;
    let hostParallel = 0;
    let hostSampler = 0;
    for (const c of ref.cases) {
      runCase(c);
      for (const s of c.sections) {
        hostDrum += s.calls.drum_bus;
        hostParallel += s.calls.parallel;
        hostSampler += s.calls.process + s.calls.macros;
      }
    }
    expect(hostDrum).toBeGreaterThan(0);
    expect(hostParallel).toBeGreaterThan(0);
    expect(drumBus).toHaveBeenCalledTimes(hostDrum);
    expect(parallelDirt).toHaveBeenCalledTimes(hostParallel);
    expect(samplerProcess).toHaveBeenCalledTimes(hostSampler);
  });
});
