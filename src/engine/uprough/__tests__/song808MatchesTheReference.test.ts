/**
 * songBass808 against tools/hiphop.py render_section's whole-808 block (plan 2026-10-19 O6f). Every sample of every section
 * lane compares to 1e-9 (same tolerance and cause as bass808PianoMatchTheReference: V8 sin/exp/tanh differ from libm in the
 * last ulps, and the filters carry it). The reference samples live in fixtures/song_bass808.lanes.br (byte-shuffled float64,
 * brotli; layout in the generator), and each decoded lane must hash to the sha the generator recorded before it is used. The
 * reference lane is rebuilt from the host's own render_808 return and bass_gain (captured by wrapping them) with the host's
 * two lines, sig - mean(sig) and bass_buf[:n] += g * sig[:n]; a section the host never called render_808 for is zeros.
 * Cases cover seven styles on five subgenre rows (deep, drill, boombap, hard, melodic, rage, cloud), bass_cut 0.72 .. 1.1,
 * a stem that silences the bass, a breakdown, a bar whose drop layer is "bass", and the params.section fast path.
 * Also checked: style808Profile for every style against hiphop.style_808_profile, and plan_kick_relationship at its
 * classifier boundaries (3, 15, 180 ms, a tie between two kicks).
 * The last test is the reachability test: song file -> songFileToBarEvents -> songBass808, with a call-count spy on
 * render808Sequence (one call per section the host rendered) and a count of the notes the plan softens.
 * Regenerate with tools/softsynth-fixtures/gen_song_bass808.py.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/song_bass808.json';
import { songFileToBarEvents, type BarEvents } from '@/lib/uprough/barEvents';
import type { SongFileDoc, SongFileGroove } from '@/lib/uprough/songFile';
import * as bass808Module from '../voices/bass808';
import { DEFAULT_PROFILE_808, type KickPlanRecord } from '../voices/bass808';
import { STYLE_808_PROFILE, classifyKickRelationship, kickTimesS, planKickRelationship, style808Profile } from '../voices/bass808Section';
import { songBass808 } from '../songBass808';

interface Arr { n: number; off: number; sha: string; peak: number }

const TOL = 1e-9;
// undo the generator's byte shuffle: plane k holds byte k of every sample
const lanesBytes = ((): Uint8Array => {
  const planes = brotliDecompressSync(readFileSync(join(__dirname, 'fixtures/song_bass808.lanes.br')));
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
interface Lane { called: boolean; bars: number; drops: unknown[]; layered: number; buf: Arr }
interface Case {
  name: string; style: string; rate: number; bpm: number; doc: SongFileDoc | null; events: BarEvents | null;
  groove: SongFileGroove | null; bass_cut: number; lanes: Lane[]; layered: number;
}
interface PlanRow { d_ms: number | null; start_s: number; kicks?: number[]; rel: string; soften: boolean; soften_ms: number; offset_ms: number }
const ref = fixture as unknown as {
  cases: Case[]; plans: PlanRow[]; plan_bpm: number;
  profiles: Record<string, { bass_cut: number; profile: Record<string, number | string | boolean> }>;
};

const inputOf = (c: Case): BarEvents => (c.doc ? songFileToBarEvents(c.doc) : c.events!);
const runCase = (c: Case): Float64Array[] => songBass808(inputOf(c), c.bpm, { groove: c.groove, bassCut: c.bass_cut });
const maxErr = (a: Float64Array, b: Float64Array): number => { let m = a.length === b.length ? 0 : Infinity; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!)); return m; };

afterEach(() => { vi.restoreAllMocks(); });

describe('songBass808 matches the hiphop section bass_buf', () => {
  for (const c of ref.cases) {
    it(c.name, () => {
      const lanes = runCase(c);
      expect(lanes.length).toBe(c.lanes.length);
      lanes.forEach((lane, i) => {
        const want = c.lanes[i]!;
        expect(lane.length).toBe(want.buf.n);
        expect(maxErr(lane, laneOf(want.buf))).toBeLessThan(TOL);
      });
    });
  }

  it('the fixture exercises every branch (not dead knobs)', () => {
    const lanes = ref.cases.flatMap((c) => c.lanes);
    expect(lanes.some((l) => !l.called && l.buf.peak === 0)).toBe(true);
    expect(lanes.some((l) => l.called && l.buf.peak > 0)).toBe(true);
    expect(lanes.some((l) => l.drops.includes('bass'))).toBe(true);
    expect(lanes.some((l) => l.layered > 0)).toBe(true);
    expect(ref.cases.some((c) => c.events !== null)).toBe(true);
    expect(new Set(ref.cases.map((c) => c.style)).size).toBeGreaterThanOrEqual(7);
    expect(new Set(ref.cases.map((c) => c.bass_cut)).size).toBeGreaterThanOrEqual(4);
    expect(ref.cases.find((c) => c.name === 'trap-stem-drums')!.lanes.every((l) => !l.called)).toBe(true);
  });
});

describe('the 808 style profile', () => {
  it('equals hiphop.style_808_profile for every 808 style', () => {
    expect(Object.keys(ref.profiles).sort()).toEqual(Object.keys(STYLE_808_PROFILE).sort());
    for (const [style, row] of Object.entries(ref.profiles)) {
      const got = style808Profile(style, row.bass_cut) as unknown as Record<string, number | string | boolean>;
      for (const key of Object.keys(DEFAULT_PROFILE_808)) expect(got[key], `${style}.${key}`).toEqual(row.profile[key]);
      // a host field the TS profile lacks must be one the render never reads
      for (const key of Object.keys(row.profile)) if (!(key in got)) expect(['mono_below_hz', 'name', 'subgenre', 'slide_duration_band']).toContain(key);
    }
  });
  it('bass_cut scales the two low-pass corners and nothing else', () => {
    const a = style808Profile('trap', 1.0);
    const b = style808Profile('trap', 0.5);
    expect(b.cleanup_lp_hz).toBe(a.cleanup_lp_hz * 0.5);
    expect(b.parallel_lp_hz).toBe(a.parallel_lp_hz * 0.5);
    expect(b.drive_amt).toBe(a.drive_amt);
  });
});

describe('the kick plan', () => {
  it('classifies at the 3, 15 and 180 ms boundaries like plan_kick_relationship', () => {
    const stepsPerSec = (60.0 / ref.plan_bpm) * 4.0 / 16.0;
    for (const row of ref.plans) {
      const kicks = row.kicks ?? [4];
      expect(kickTimesS([...kicks], ref.plan_bpm)).toEqual([...kicks].map((k) => k * stepsPerSec).sort((a, b) => a - b));
      const plan = planKickRelationship([{ startS: row.start_s, durS: 0.2, semi: 36 }], kicks, ref.plan_bpm)[0]!;
      const rel = classifyKickRelationship(row.start_s, kickTimesS(kicks, ref.plan_bpm));
      expect(rel, `${row.d_ms} ms`).toBe(row.rel);
      expect(plan.softenAttack).toBe(row.soften);
      expect(plan.softenAttackMs).toBe(row.soften_ms);
      expect(plan.attackOffsetMs).toBe(row.offset_ms);
    }
  });
});

describe('reachability', () => {
  it('the song entry renders one 808 line per section the host rendered and softens the notes the host softened', () => {
    const c = ref.cases.find((x) => x.name === 'trap-16bars-drop-bass')!;
    const spy = vi.spyOn(bass808Module, 'render808Sequence');
    runCase(c);
    const hostSections = c.lanes.filter((l) => l.called).length;
    expect(hostSections).toBeGreaterThan(0);
    expect(c.lanes.some((l) => l.drops.includes('bass'))).toBe(true);
    expect(spy).toHaveBeenCalledTimes(hostSections);
    const softened = spy.mock.calls.reduce((n, call) => n + ((call[4] as readonly KickPlanRecord[] | null) ?? []).filter((r) => r.softenAttack).length, 0);
    expect(softened).toBe(c.layered);
    expect(softened).toBeGreaterThan(0);
  });
});
