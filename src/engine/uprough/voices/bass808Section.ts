/**
 * The whole-section 808 bass of hiphop.render_section (map 2026-10-20_o6f): `whole_808` styles do not render a bass
 * bar per bar. Each bar's trap808 events are put on the style's groove, moved to the bar's place in the section and
 * merged; the section kick plan (trap808.plan_kick_relationship) is made over the whole line; the line is rendered
 * once by render808Sequence (the mono law spans bars); the DC is removed and the lane is added at bass gain.
 *
 * The style tables are copied from hiphop.py (STYLE_808_PROFILE, the subgenre rows of trap808.py,
 * CLASSIC_808_DRIVE_STYLES). song808MatchesTheReference.test.ts compares style808Profile for every style to a
 * dump of hiphop.style_808_profile.
 */
import { npSum } from '@/engine/dj/scratch/refDsp';
import { bassGrooveOffset } from './bassBar';
import { DEFAULT_PROFILE_808, render808Sequence, type Event808, type KickPlanRecord, type Profile808 } from './bass808';
import type { SongFileGroove } from '@/lib/uprough/songFile';

/** hiphop.STYLE_808_PROFILE: the styles that render through the 808 section path, and their subgenre row. */
export const STYLE_808_PROFILE: Readonly<Record<string, string>> = {
  southern: 'deep', dirty_south: 'memphis', crunk: 'hard', trap: 'deep', drill: 'drill', memphis: 'memphis',
  miami_bass: 'hard', golden_era: 'boombap', boom_bap: 'boombap', east_coast: 'boombap', instrumental: 'boombap',
  old_school: 'boombap', electro_hiphop: 'hard', industrial: 'rage', jazz_rap: 'melodic', alternative: 'melodic',
  g_funk: 'melodic', abstract: 'cloud', lofi: 'cloud',
};

/** hiphop.CLASSIC_808_DRIVE_STYLES: the styles whose drive is pinned to 0.50. */
export const CLASSIC_808_DRIVE_STYLES: ReadonlySet<string> = new Set([
  'old_school', 'golden_era', 'boom_bap', 'east_coast', 'jazz_rap', 'abstract', 'lofi', 'instrumental', 'alternative',
]);

/** trap808 subgenre rows: the fields each overrides on DEFAULT_PROFILE (render-relevant fields only). */
const SUBGENRE_808: Readonly<Record<string, Partial<Profile808>>> = {
  boombap: { sine_mix: 0.84, tri_mix: 0.16, drive_kind: 'tube', drive_amt: 0.3, cleanup_lp_hz: 4200.0, parallel_hp_hz: 120.0,
    parallel_lp_hz: 4200.0, parallel_wet: 0.3, parallel_auto: true, sub_wet: 0.6 },
  cloud: { pitch_start_semi: 7.0, pitch_drop_ms: 80.0, attack_ms: 12.0, drive_amt: 0.06, cleanup_lp_hz: 2000.0 },
  deep: { sine_mix: 0.95, tri_mix: 0.05, pitch_start_semi: 10.0, pitch_drop_ms: 55.0, drive_amt: 0.1, cleanup_lp_hz: 3000.0 },
  drill: { sine_mix: 0.85, tri_mix: 0.15, pitch_start_semi: 14.0, pitch_drop_ms: 30.0, drive_amt: 0.22, cleanup_lp_hz: 4000.0 },
  hard: { pitch_start_semi: 18.0, pitch_drop_ms: 22.0, decay_low_ms: 900.0, decay_high_ms: 400.0, drive_kind: 'soft', drive_amt: 0.3,
    cleanup_lp_hz: 3600.0 },
  melodic: { sine_mix: 0.88, tri_mix: 0.12, pitch_drop_ms: 35.0, decay_low_ms: 1400.0, decay_high_ms: 600.0, drive_amt: 0.12,
    cleanup_lp_hz: 2800.0 },
  memphis: { decay_low_ms: 1200.0, decay_high_ms: 500.0, drive_kind: 'tube', drive_amt: 0.4, cleanup_lp_hz: 1400.0 },
  rage: { sine_mix: 0.8, tri_mix: 0.2, pitch_start_semi: 16.0, pitch_drop_ms: 20.0, decay_low_ms: 700.0, decay_high_ms: 300.0,
    drive_kind: 'soft', drive_amt: 0.35, cleanup_lp_hz: 5000.0 },
};

/** hiphop.style_808_profile: the style's subgenre row, its bass_cut on the two low-pass corners, the classic drive. */
export function style808Profile(style: string, bassCut = 1.0): Profile808 {
  const sub = STYLE_808_PROFILE[style];
  if (sub === undefined) throw new Error(`style808Profile: "${style}" is not a whole-808 style`);
  const prof: Profile808 = { ...DEFAULT_PROFILE_808, ...SUBGENRE_808[sub] };
  const cut = bassCut || 1.0;
  if (cut !== 1.0) {
    if (prof.cleanup_lp_hz) prof.cleanup_lp_hz *= cut;
    if (prof.parallel_lp_hz) prof.parallel_lp_hz *= cut;
  }
  if (CLASSIC_808_DRIVE_STYLES.has(style)) prof.drive_amt = 0.50;
  return prof;
}

export type KickRelationship = 'KICK_LAYERED' | 'KICK_PRECEDES' | 'KICK_FOLLOWS' | 'NO_KICK';
const KICK_LAYERED_TOL_MS = 3.0;
const KICK_ALIGN_OFFSET_MIN_MS = 3.0;
const KICK_PRECEDES_MAX_MS = 15.0;
const KICK_FOLLOWS_MAX_MS = 180.0;
const KICK_SOFTEN_ATTACK_MS = 10.0; // plan_kick_relationship soften_layered=True: soften_ms default, clamped into 5..15

/** trap808._kick_times_s for a list of integer step indices: seconds on the 16th grid, sorted. */
export function kickTimesS(kickSteps: readonly number[], bpm: number, stepsPerBar = 16): number[] {
  const secPerStep = (60.0 / bpm) * 4.0 / stepsPerBar;
  return kickSteps.map((s) => Math.trunc(s) * secPerStep).sort((a, b) => a - b);
}

/** trap808.classify_kick_relationship of an attack at tS against the kick onsets (seconds). */
export function classifyKickRelationship(tS: number, kicks: readonly number[]): KickRelationship {
  if (!kicks.length) return 'NO_KICK';
  let best = kicks[0]!;
  for (const k of kicks) if (Math.abs(tS - k) < Math.abs(tS - best)) best = k; // first minimum on a tie, like min()
  const delta = tS - best;
  let prev: number | null = null;
  for (const k of kicks) if (k <= tS + 1e-9 && (prev === null || k > prev)) prev = k;
  const absMs = Math.abs(delta) * 1000.0;
  if (absMs <= KICK_LAYERED_TOL_MS) return 'KICK_LAYERED';
  if (prev !== null) {
    const prevMs = (tS - prev) * 1000.0;
    if (KICK_ALIGN_OFFSET_MIN_MS < prevMs && prevMs <= KICK_PRECEDES_MAX_MS) return 'KICK_PRECEDES';
    if (KICK_PRECEDES_MAX_MS < prevMs && prevMs <= KICK_FOLLOWS_MAX_MS) return 'KICK_FOLLOWS';
  }
  if (delta < 0 && absMs <= KICK_FOLLOWS_MAX_MS) return 'KICK_FOLLOWS';
  return 'NO_KICK';
}

/** trap808.plan_kick_relationship with its defaults, as the records render808Sequence reads. */
export function planKickRelationship(events: readonly Event808[], kickSteps: readonly number[], bpm: number): KickPlanRecord[] {
  const kicks = kickTimesS(kickSteps, bpm);
  return events.map((ev) => {
    const layered = classifyKickRelationship(ev.startS, kicks) === 'KICK_LAYERED';
    return { startS: ev.startS, semi: ev.semi, layered, softenAttack: layered, softenAttackMs: layered ? KICK_SOFTEN_ATTACK_MS : 0.0, attackOffsetMs: 0.0 };
  });
}

export interface Bar808Event { start_s: number; dur_s: number; semi: number; slide?: boolean; step?: number }

/** hiphop.bass_bar_808_events: one bar's events on the style's groove, moved offsetS into the section. */
export function bassBar808Events(bev: readonly Bar808Event[], groove: SongFileGroove | null, bpm: number, rate: number, offsetS: number): Event808[] {
  const stepSamp = Math.trunc(rate * 60.0 / (bpm * 4));
  return bev.map((e) => {
    let startS = e.start_s;
    if (stepSamp > 0) {
      const off = bassGrooveOffset(groove, Math.trunc(e.step ?? 0), stepSamp, rate);
      if (off !== 0) startS = Math.max(0.0, startS + off / rate);
    }
    return { startS: startS + offsetS, durS: e.dur_s, semi: e.semi, slide: !!e.slide };
  });
}

export interface Section808Input {
  /** Per bar: the bar's trap808 events, or null where the bar plays no bass (bass layer off for that bar). */
  bars: readonly (readonly Bar808Event[] | null)[];
  /** Per bar: the kick steps of that bar's drum record (present even when the drums layer is off). */
  kickSteps: readonly (readonly number[])[];
  style: string;
  bpm: number;
  rate: number;
  seed: number;
  groove: SongFileGroove | null;
  bassCut: number;
  /** MIX_GAINS.bass * view.bass_bus_level */
  bassGain: number;
  /** Lane length: bars * bar_len + rate */
  length: number;
}

/** The render_section 808 block: the section's bass lane (zeros when no bar has an event). */
export function render808Section(inp: Section808Input): Float64Array {
  const out = new Float64Array(inp.length);
  const barLen = Math.trunc(inp.rate * 60.0 / (inp.bpm * 4)) * 16;
  const barS = barLen / inp.rate;
  const events: Event808[] = [];
  const kicks: number[] = [];
  inp.bars.forEach((bev, b) => {
    if (!bev) return;
    events.push(...bassBar808Events(bev, inp.groove, inp.bpm, inp.rate, b * barS));
    for (const k of inp.kickSteps[b] ?? []) kicks.push(k + b * 16);
  });
  if (!events.length) return out;
  const profile = style808Profile(inp.style, inp.bassCut);
  const uniqueKicks = [...new Set(kicks)].sort((a, b) => a - b);
  const plan = uniqueKicks.length ? planKickRelationship(events, uniqueKicks, inp.bpm) : null;
  const sig = render808Sequence(events, profile, inp.rate, inp.seed, plan);
  if (!sig.length) return out;
  const mean = npSum(sig, 0, sig.length) / sig.length;
  const n = Math.min(out.length, sig.length);
  for (let k = 0; k < n; k++) out[k] = out[k]! + inp.bassGain * (sig[k]! - mean);
  return out;
}
