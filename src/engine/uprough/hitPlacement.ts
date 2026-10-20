/**
 * Where and how loud one drum hit lands (plan 2026-10-19 O6c): a port of tools/hiphop.py GROOVE_TEMPLATES,
 * performance_profile, drum_bar_context and drum_hit_placement, plus synth_common.lfsr. The per-hit variation itself
 * (humanizeDraw, varyHit) lives in humanize.ts and is reused, not repeated.
 *
 * Every int() of the host is Math.trunc (a ghost hit's negative offset truncates toward zero) and every product keeps
 * the host's left-to-right order, so offsets and gains are bit-equal to the Python.
 */
import { humanizeDraw, type HitHumanize } from './humanize';
import type { HipHopStyle } from './drumBank';

export interface GrooveMicro { kick: number; snare: number; ch: number; ghost: number; perc: number; chop: number }
export interface GrooveTemplate { swing: number; micro: GrooveMicro; vel: number }

/** hiphop.GROOVE_TEMPLATES, verbatim. */
export const GROOVE_TEMPLATES: Readonly<Record<string, GrooveTemplate>> = {
  MPC60_Loose: { swing: 0.14, micro: { kick: 2, snare: 8, ch: 6, ghost: -8, perc: 10, chop: 6 }, vel: 1.0 },
  SP1200_Drag: { swing: 0.16, micro: { kick: 0, snare: 12, ch: 10, ghost: -6, perc: 14, chop: 8 }, vel: 0.95 },
  BoomBap_LateSnare: { swing: 0.12, micro: { kick: 1, snare: 14, ch: 5, ghost: -10, perc: 8, chop: 4 }, vel: 1.0 },
  J_Dilla_Offset: { swing: 0.10, micro: { kick: -3, snare: 16, ch: 9, ghost: -14, perc: 18, chop: 12 }, vel: 0.92 },
  WestCoast_Straight: { swing: 0.04, micro: { kick: 0, snare: 2, ch: 2, ghost: -4, perc: 6, chop: 2 }, vel: 1.05 },
  Trap_Tight: { swing: 0.0, micro: { kick: 0, snare: 1, ch: 3, ghost: -3, perc: 4, chop: 2 }, vel: 1.0 },
  Memphis_Dirty: { swing: 0.06, micro: { kick: 2, snare: 6, ch: 8, ghost: -8, perc: 12, chop: 10 }, vel: 0.9 },
  LoFi_Wobble: { swing: 0.15, micro: { kick: 3, snare: 10, ch: 12, ghost: -12, perc: 16, chop: 8 }, vel: 0.88 },
  Electro_HardGrid: { swing: 0.06, micro: { kick: 0, snare: 4, ch: 3, ghost: -4, perc: 6, chop: 2 }, vel: 1.1 },
};

/** hiphop.STYLES[style]["groove"]: the template each style plays. */
export const STYLE_GROOVE: Readonly<Record<HipHopStyle, string>> = {
  old_school: 'MPC60_Loose',
  golden_era: 'BoomBap_LateSnare',
  boom_bap: 'BoomBap_LateSnare',
  east_coast: 'SP1200_Drag',
  jazz_rap: 'MPC60_Loose',
  abstract: 'J_Dilla_Offset',
  instrumental: 'BoomBap_LateSnare',
  alternative: 'MPC60_Loose',
  lofi: 'LoFi_Wobble',
  g_funk: 'WestCoast_Straight',
  southern: 'Trap_Tight',
  dirty_south: 'Memphis_Dirty',
  crunk: 'Trap_Tight',
  trap: 'Trap_Tight',
  drill: 'Trap_Tight',
  memphis: 'Memphis_Dirty',
  miami_bass: 'Electro_HardGrid',
  electro_hiphop: 'Electro_HardGrid',
  industrial: 'Electro_HardGrid',
};

/**
 * attitude.value(style, field) for the two fields the placement reads (hiphop._att). A style without a row would
 * read the ladder midpoint 0.5; all 19 have one.
 */
export const STYLE_ATTITUDE: Readonly<Record<HipHopStyle, { swagger: number; accentStrength: number }>> = {
  old_school: { swagger: 0.75, accentStrength: 0.5 },
  golden_era: { swagger: 0.75, accentStrength: 0.5 },
  boom_bap: { swagger: 0.75, accentStrength: 0.5 },
  east_coast: { swagger: 0.75, accentStrength: 0.5 },
  jazz_rap: { swagger: 0.75, accentStrength: 0.5 },
  abstract: { swagger: 0.75, accentStrength: 0.5 },
  instrumental: { swagger: 0.65, accentStrength: 0.5 },
  alternative: { swagger: 0.75, accentStrength: 0.5 },
  lofi: { swagger: 0.5, accentStrength: 0.5 },
  g_funk: { swagger: 0.75, accentStrength: 0.5 },
  southern: { swagger: 0.25, accentStrength: 0.75 },
  dirty_south: { swagger: 0.5, accentStrength: 0.5 },
  crunk: { swagger: 0.5, accentStrength: 0.9 },
  trap: { swagger: 0.25, accentStrength: 0.75 },
  drill: { swagger: 0.25, accentStrength: 0.75 },
  memphis: { swagger: 0.5, accentStrength: 0.5 },
  miami_bass: { swagger: 0.5, accentStrength: 0.75 },
  electro_hiphop: { swagger: 0.5, accentStrength: 0.5 },
  industrial: { swagger: 0.5, accentStrength: 0.75 },
};

/** synth_common.lfsr(seed): xorshift32 (13, 17, 5) held to 31 bits, yielding (s & 0xFFFF) / 65535. */
export class Lfsr {
  private s: number;

  constructor(seed: number) {
    this.s = (seed & 0x7FFFFFFF) || 1;
  }

  next(): number {
    let s = this.s;
    // (s << 13) wraps in int32, but the mask keeps only the low 31 bits, which the wrap leaves intact.
    s ^= (s << 13) & 0x7FFFFFFF;
    s ^= s >> 17;
    s ^= (s << 5) & 0x7FFFFFFF;
    this.s = s;
    return (s & 0xFFFF) / 65535.0;
  }
}

/** The seven fields of hiphop.Performance, in the host's slot order. */
export interface Performance {
  grooveOffset: number; swing: number; velocityVariance: number; snareLateness: number;
  hatLooseness: number; ghostNoteStrength: number; accentStrength: number;
}

function template(style: HipHopStyle): GrooveTemplate {
  return GROOVE_TEMPLATES[STYLE_GROOVE[style]]!;
}

/** hiphop.performance_profile(style): a style's performer, read from its groove template and attitude row. */
export function performanceProfile(style: HipHopStyle): Performance {
  const g = template(style);
  const m = g.micro;
  const vals = [m.kick, m.snare, m.ch, m.ghost, m.perc, m.chop];
  const spread = Math.max(...vals) - Math.min(...vals);
  const att = STYLE_ATTITUDE[style];
  return {
    grooveOffset: vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length),
    swing: g.swing,
    velocityVariance: Math.max(0.35, Math.min(1.6, spread / 12.0)),
    snareLateness: m.snare + 6.0 * (att.swagger - 0.5),
    hatLooseness: Math.max(0.2, Math.min(1.6, Math.abs(m.ch) / 6.0)),
    ghostNoteStrength: 0.52 - 0.30 * att.accentStrength,
    accentStrength: att.accentStrength,
  };
}

/** One drum event as the bar events carry it (the host's tuples and phrase_engine Notes, flattened). */
export interface DrumEvent { voice: string; step: number; vel: number; role: string; microMs?: number; isNote?: boolean }

export interface DrumBarContext { swingAmt: number; kickSteps: Set<number>; rnd: Lfsr }

/** hiphop.drum_bar_context(style, ev, seed): the bar's swing wobble, kick steps and roll stream. */
export function drumBarContext(style: HipHopStyle, events: readonly DrumEvent[], seed: number): DrumBarContext {
  const g = template(style);
  const kickSteps = new Set<number>();
  for (const e of events) if (e.voice === 'kick') kickSteps.add(e.step);
  // The host's float order, kept unsimplified: (gain - 1.0), / 0.08, * 0.08, + 1.0, * swing.
  const swingAmt = g.swing * (1.0 + 0.08 * (humanizeDraw(seed * 53 + 1).gain - 1.0) / 0.08);
  return { swingAmt, kickSteps, rnd: new Lfsr(seed * 977 + 3) };
}

export interface HitPlacement { offset: number; gain: number; h: HitHumanize | null }

/** hiphop.drum_hit_placement: the hit's start in samples from the bar start, its linear level and its humanize draw. */
export function drumHitPlacement(
  style: HipHopStyle, voice: string, step: number, vel: number, role: string, microMs: number, isNote: boolean,
  stepSamp: number, rate: number, kickSteps: ReadonlySet<number>, swingAmt: number, rnd: Lfsr, seed: number,
): HitPlacement {
  const g = template(style);
  const perf = performanceProfile(style);
  const mkey: keyof GrooveMicro = role === 'ghost' ? 'ghost' : voice === 'kick' ? 'kick'
    : voice === 'snare' ? 'snare' : (voice === 'ch' || voice === 'oh') ? 'ch' : 'perc';
  let ms = g.micro[mkey];
  if (mkey === 'snare') ms = ms + 6.0 * (STYLE_ATTITUDE[style].swagger - 0.5);
  let off = Math.trunc(ms * 1e-3 * rate);
  const anchor = role === 'downbeat' || role === 'backbeat';
  if (anchor) off = Math.trunc(off * 0.4);
  let o = step * stepSamp;
  if (g.swing && step % 2 === 1) o += Math.trunc(swingAmt * stepSamp);
  let accent = (step === 0 || step === 8) ? 1.06 : (step % 2 === 1 ? 0.97 : 1.0);
  const nearKick = kickSteps.has(step) || kickSteps.has(step - 1);
  if (voice === 'ch' || voice === 'oh') {
    if (isNote && microMs) o += Math.trunc(microMs * 1e-3 * rate);
    o = Math.max(0, o + off);
    if (nearKick) accent *= 0.85;
    return { offset: o, gain: vel * g.vel * accent, h: null };
  }
  if (role === 'roll') o += Math.trunc(rnd.next() * stepSamp * 0.9);
  let vh = 0;
  for (let i = 0; i < voice.length; i++) vh += voice.charCodeAt(i);
  const h = humanizeDraw(seed * 2311 + step * 17 + vh);
  o = Math.max(0, o + off + Math.trunc(h.start * rate * perf.hatLooseness * (anchor ? 0.4 : 1.0)));
  if (role === 'ghost' && nearKick) accent *= 0.85;
  return { offset: o, gain: vel * g.vel * accent, h };
}
