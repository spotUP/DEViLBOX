/**
 * The per-style drum bank a song renders with (plan 2026-10-19 O6b): a port of tools/hiphop.py drum_bank plus the
 * two voices tools/hiphop_kit.py derives from it (add_snare_accent, add_snare_ghost), in the order _render_song
 * applies them. Every voice comes from demoDrums.ts (sample-exact with tools/drummachine.py); this file only holds
 * the per-style choices, so the host and DEViLBOX pick the same kick, snare and hat character for a style.
 *
 * The host's `vintage` argument is accepted there but never read, so it is not a parameter here.
 */
import {
  clap, conga, cowbell, demoNoise, hat, kick808, kick909, metalHit, ride, rim, shaker, snare808, snare909, tamb,
  tapeSat, tom, type DrumMachine, type KickParams, type SnareParams,
} from '@/engine/dj/scratch/demoDrums';
import { pexp, psin } from '@/engine/dj/scratch/portableMath';
import { bp, hp, lp, reverb } from '@/engine/dj/scratch/refDsp';
import { linspace } from '@/engine/turntable/turntableSim';
import type { Tap } from './r2Events';
import { distort } from './synthDsp';

export type HipHopStyle =
  | 'old_school' | 'golden_era' | 'boom_bap' | 'east_coast' | 'jazz_rap' | 'abstract' | 'instrumental'
  | 'alternative' | 'lofi' | 'g_funk' | 'southern' | 'dirty_south' | 'crunk' | 'trap' | 'drill' | 'memphis'
  | 'miami_bass' | 'electro_hiphop' | 'industrial';

/** hiphop.STYLES: the kit, kick and snare tokens of each style (the third to fifth _style arguments). */
export const STYLE_DRUMS: Readonly<Record<HipHopStyle, { kit: string; kick: string; snare: string }>> = {
  old_school: { kit: 'boombap', kick: 'boombap', snare: 'boombap' },
  golden_era: { kit: 'boombap', kick: 'boombap_soft', snare: 'boombap_hard' },
  boom_bap: { kit: 'boombap', kick: 'boombap_hard', snare: 'boombap_crack' },
  east_coast: { kit: 'boombap', kick: 'boombap_hard', snare: 'boombap_crack' },
  jazz_rap: { kit: 'boombap', kick: 'boombap', snare: 'boombap_bright' },
  abstract: { kit: 'boombap', kick: 'boombap', snare: 'boombap_crack' },
  instrumental: { kit: 'boombap', kick: 'boombap', snare: 'boombap' },
  alternative: { kit: 'boombap', kick: 'boombap_hard', snare: 'boombap' },
  lofi: { kit: 'lofi', kick: 'lofi', snare: 'lofi' },
  g_funk: { kit: '909', kick: 'gfunk', snare: 'westcoast' },
  southern: { kit: '808', kick: 'trap_hard', snare: 'trap' },
  dirty_south: { kit: '808', kick: 'trap', snare: 'memphis' },
  crunk: { kit: '808', kick: 'trap_hard', snare: 'westcoast' },
  trap: { kit: '808', kick: 'trap', snare: 'trap' },
  drill: { kit: '808', kick: 'drill', snare: 'trap' },
  memphis: { kit: '808', kick: 'memphis', snare: 'memphis' },
  miami_bass: { kit: '808', kick: 'electro', snare: 'electro' },
  electro_hiphop: { kit: '808', kick: 'electro', snare: 'trap' },
  industrial: { kit: '909', kick: 'industrial', snare: 'boombap_hard' },
};

/** hiphop._HAT_CHAR: (tune ratio, low-pass Hz, noise amount) of the closed and open hats. */
export const HAT_CHAR: Readonly<Record<HipHopStyle, readonly [number, number, number]>> = {
  old_school: [0.85, 11500, 0.78],
  golden_era: [0.90, 11500, 0.78],
  boom_bap: [1.0, 12000, 0.82],
  east_coast: [1.15, 13000, 0.85],
  jazz_rap: [1.05, 12500, 0.75],
  abstract: [0.80, 10500, 0.75],
  instrumental: [1.00, 12000, 0.78],
  alternative: [1.10, 12500, 0.80],
  lofi: [0.65, 9000, 0.72],
  g_funk: [1.30, 14500, 0.82],
  southern: [1.20, 13500, 0.80],
  dirty_south: [0.80, 10500, 0.78],
  crunk: [1.10, 12500, 0.80],
  trap: [1.40, 15000, 0.85],
  drill: [1.35, 14500, 0.85],
  memphis: [0.75, 10000, 0.78],
  miami_bass: [1.30, 14500, 0.82],
  electro_hiphop: [1.20, 13500, 0.82],
  industrial: [1.00, 12000, 0.80],
};

export interface BoombapSnareOpts { hard?: boolean; dark?: boolean }
type SnareSpec = readonly ['boombap', BoombapSnareOpts] | readonly ['808', Partial<SnareParams>];

/** hiphop_subgenre.KICK_SPEC / SNARE_SPEC: per-style overrides that win over the token ladders. */
export const KICK_SPEC: Readonly<Partial<Record<HipHopStyle, Partial<KickParams>>>> = {
  miami_bass: { tune: 8, pitch_start: 24, amp_decay: 470, click: 0.15, drive: 0.1 },
};
export const SNARE_SPEC: Readonly<Partial<Record<HipHopStyle, SnareSpec>>> = {
  east_coast: ['boombap', { hard: true, dark: true }],
  miami_bass: ['808', { tune: 29, noise_amt: 0.6, body_decay: 60, noise_decay: 70, drive: 0.1 }],
};

/** hiphop_kit voice names and constants. */
export const SNARE_ACCENT_VOICE = 'snare_accent';
export const CLAP_LAYER_GAIN = 0.6;
export const SNARE_GHOST_VOICE = 'snare_ghost';
export const GHOST_DECAY_FRACTION = 1.0 / 3.0;
export const GHOST_HP_HZ = 250.0;
export const GHOST_ATTACK_MS = 3.0;

export type DrumBank = Record<string, Float64Array>;

/** A bank-wide stage tap: the voice a stage belongs to, then the Tap arguments. */
export type BankTap = (voice: string, stage: string, buf: ArrayLike<number>, isEnv?: boolean) => void;
const voiceTap = (bankTap: BankTap | undefined, voice: string): Tap | undefined =>
  bankTap && ((stage, buf, isEnv) => bankTap(voice, stage, buf, isEnv));

/** x + gain * y, the shorter one zero-padded (np.pad(a) + gain * np.pad(b)). */
function padAdd(x: Float64Array, y: Float64Array, gain: number): Float64Array {
  const out = new Float64Array(Math.max(x.length, y.length));
  for (let i = 0; i < out.length; i++) out[i] = (i < x.length ? x[i]! : 0) + gain * (i < y.length ? y[i]! : 0);
  return out;
}

/**
 * hiphop._boombap_snare: a two-mode shell tone that leads, a band-limited wire buzz and a short snap, through a
 * small room and light tape saturation, normalised to 0.9.
 */
export function boombapSnare(rate: number, { hard = false, dark = false }: BoombapSnareOpts = {}, seed = 2, tap?: Tap): Float64Array {
  const n = Math.trunc(0.22 * rate);
  const buzz = bp(demoNoise(n, seed), 1900, dark ? 3200 : 4200, rate);
  const snap = hp(demoNoise(n, seed + 5), 5000, rate);
  const mix = new Float64Array(n);
  const shells = tap ? new Float64Array(n) : null;
  for (let t = 0; t < n; t++) {
    const shell = psin(2 * Math.PI * 185 * t / rate) * pexp(-t / (0.055 * rate))
      + 0.5 * psin(2 * Math.PI * 330 * t / rate) * pexp(-t / (0.040 * rate));
    if (shells) shells[t] = shell;
    mix[t] = 0.9 * shell + 0.6 * (buzz[t]! * pexp(-t / (0.10 * rate))) + 0.28 * (snap[t]! * pexp(-t / (0.004 * rate)));
  }
  if (tap) { tap('shell', shells!); tap('buzz', buzz); tap('snap', snap); tap('mix', mix); }
  const room = reverb(mix, rate, 'room', 0.15, 0.35);
  if (tap) tap('room', room);
  const y = tapeSat(room, hard ? 1.2 : 1.1);
  if (tap) tap('tape_sat', y);
  let peak = 0;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]!));
  const d = peak + 1e-9;
  for (let i = 0; i < y.length; i++) y[i] = y[i]! / d * 0.9;
  if (tap) tap('normalise', y);
  return y;
}

function styleKick(style: HipHopStyle, rate: number, tap?: Tap): Float64Array {
  const staged = (x: Float64Array, stage: string): Float64Array => { if (tap) tap(stage, x); return x; };
  const spec = KICK_SPEC[style];
  if (spec) return kick808(spec, rate, undefined, tap);
  const kk = STYLE_DRUMS[style].kick;
  switch (kk) {
    case 'boombap': case 'boombap_hard': case 'boombap_soft': {
      const soft = kk === 'boombap_soft';
      const kick = kick808({
        tune: 6, pitch_start: 20, amp_decay: soft ? 590 : 520, click: soft ? 0.05 : 0.12,
        drive: kk === 'boombap_hard' ? 0.18 : 0.12,
      }, rate, undefined, tap);
      return staged(lp(kick, soft ? 3000 : 4200, rate), 'lp');
    }
    case 'lofi':
      return staged(tapeSat(staged(lp(kick808({ tune: 5, amp_decay: 460, click: 0.05, drive: 0.1 }, rate, undefined, tap), 2400, rate), 'lp'), 1.4), 'tape_sat');
    case 'gfunk':
      return kick808({ tune: 7, pitch_start: 18, amp_decay: 560, click: 0.08, drive: 0.08 }, rate, undefined, tap);
    case 'drill':
      return kick808({ tune: 10, pitch_start: 15, amp_decay: 135, click: 0.36, drive: 0.1 }, rate, undefined, tap);
    case 'trap': case 'trap_hard':
      return kick808({ tune: 9, pitch_start: 16, amp_decay: 180, click: 0.3, drive: kk === 'trap_hard' ? 0.12 : 0.08 }, rate, undefined, tap);
    case 'memphis':
      return staged(distort(kick808({ tune: 8, amp_decay: 200, click: 0.2, drive: 0.25 }, rate, undefined, tap), 'rat', 2.0), 'distort');
    case 'electro':
      return kick808({ tune: 8, pitch_start: 22, amp_decay: 380, click: 0.15, drive: 0.1 }, rate, undefined, tap);
    case 'industrial':
      return staged(distort(kick909({ drive: 0.4 }, rate, tap), 'rat', 3.0), 'distort');
    default:
      return kick808({}, rate, undefined, tap);
  }
}

function styleSnare(style: HipHopStyle, rate: number, seed: number, tap?: Tap): Float64Array {
  const spec = SNARE_SPEC[style];
  if (spec) return spec[0] === 'boombap' ? boombapSnare(rate, spec[1], seed + 2, tap) : snare808(spec[1], rate, undefined, tap);
  const sn = STYLE_DRUMS[style].snare;
  switch (sn) {
    case 'boombap': case 'boombap_hard': case 'boombap_crack': case 'boombap_bright': {
      const snare = boombapSnare(rate, { hard: sn === 'boombap_hard' || sn === 'boombap_bright', dark: sn === 'boombap_crack' }, seed + 2, tap);
      return sn === 'boombap_bright' ? hp(snare, 380, rate) : snare; // crisp, less room
    }
    case 'lofi':
      return lp(boombapSnare(rate, { dark: true }, seed + 2, tap), 5000, rate);
    case 'westcoast': // snare + clap layer
      return padAdd(snare909({ tune: 30, noise_amt: 0.7, drive: 0.15 }, rate, tap), clap({ bright: 1.2 }, rate), 0.6);
    case 'trap':
      return clap({ bright: 1.3 }, rate, undefined, tap);
    case 'memphis':
      return distort(snare808({ tune: 32, noise_amt: 0.8, body_decay: 60, noise_decay: 70, drive: 0.2 }, rate, undefined, tap), 'bitcrush', 5.0);
    case 'electro':
      return snare808({ tune: 29, noise_amt: 0.6, drive: 0.1 }, rate, undefined, tap);
    default:
      return snare808({}, rate, undefined, tap);
  }
}

/** hiphop.drum_bank: the style's one-shot palette, in the host's key order. */
export function drumBank(style: HipHopStyle, rate: number, seed = 0, bankTap?: BankTap): DrumBank {
  const kit = STYLE_DRUMS[style].kit;
  const machine: DrumMachine = kit === '808' || kit === 'electro' ? '808' : '909';
  const [htune, hlp, hnoise] = HAT_CHAR[style];
  return {
    kick: styleKick(style, rate, voiceTap(bankTap, 'kick')),
    snare: styleSnare(style, rate, seed, voiceTap(bankTap, 'snare')),
    clap: clap({}, rate, undefined, voiceTap(bankTap, 'clap')),
    ch: lp(hat({ open_hat: false, tune: htune, machine, noise: hnoise }, rate, voiceTap(bankTap, 'ch')), hlp, rate),
    oh: lp(hat({ open_hat: true, tune: htune, machine, noise: hnoise }, rate, voiceTap(bankTap, 'oh')), Math.max(8000, hlp - 1500), rate),
    rim: rim({ machine }, rate),
    tom: tom({ machine }, rate),
    conga: conga({}, rate),
    cowbell: cowbell({}, rate),
    shaker: shaker({}, rate),
    tamb: tamb({}, rate),
    metal: metalHit(rate, voiceTap(bankTap, 'metal')),
    ride: ride({}, rate),
  };
}

/** hiphop_kit.add_snare_accent: the style's snare with its own clap layered in, as one voice. No-op without both. */
export function addSnareAccent(bank: DrumBank): DrumBank {
  if (!bank.snare || !bank.clap) return bank;
  return { ...bank, [SNARE_ACCENT_VOICE]: padAdd(bank.snare, bank.clap, CLAP_LAYER_GAIN) };
}

/**
 * hiphop_kit.add_snare_ghost: the snare cut to GHOST_DECAY_FRACTION of its length with a raised-cosine fade over the
 * last half, thinned by a one-pole high pass and given a GHOST_ATTACK_MS ramp. No-op without a snare.
 */
export function addSnareGhost(bank: DrumBank, rate: number): DrumBank {
  if (!bank.snare) return bank;
  const n = Math.max(8, Math.trunc(bank.snare.length * GHOST_DECAY_FRACTION));
  const x = hp(bank.snare.subarray(0, n), GHOST_HP_HZ, rate, 1);
  const fade = Math.max(1, Math.trunc(n / 2));
  const ph = linspace(0.0, Math.PI, fade);
  for (let i = 0; i < fade; i++) x[n - fade + i] = x[n - fade + i]! * (0.5 * (1.0 + Math.cos(ph[i]!)));
  const k = Math.max(1, Math.min(n, Math.trunc(GHOST_ATTACK_MS * 1e-3 * rate)));
  const ramp = linspace(0.0, 1.0, k);
  for (let i = 0; i < k; i++) x[i] = x[i]! * ramp[i]!;
  return { ...bank, [SNARE_GHOST_VOICE]: x };
}

/** The bank _render_song plays: drum_bank, then the accent, then the ghost. _render_song passes the SONG seed (the seed the drums draw from). */
export const songDrumBank = (style: HipHopStyle, rate: number, seed = 0, bankTap?: BankTap): DrumBank =>
  addSnareGhost(addSnareAccent(drumBank(style, rate, seed, bankTap)), rate);
