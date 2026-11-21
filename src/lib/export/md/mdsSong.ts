/**
 * Mega Drive native player, MDSDRV route (plan 2026-11-20-megadrive-native-player, Phase 1):
 * Furnace Genesis song -> MDSDRV sequence data (third-party/mdsdrv/doc/mdsseq.md), the song data
 * for the real driver, never a register stream.
 *
 * Blob layout (offsets from `sdtop`, so the blob is position independent and must sit on an even address):
 *   header  `10 01 1f 00`, version word 3, sequence count word 2
 *   sdtop   dc.l pcm_tab-sdtop, dc.l bgm-sdtop
 *   items   pcm_tab (`dc.w 0`), FM voices, PSG envelopes, pitch envelopes, macro tables, subroutines
 *   bgm     dc.w tbase-bgm, dc.b tvol, tcount, per track `dc.b chan,0; dc.w pos-tbase`
 *   tbase   dc.w item-sdtop (song table, index 0..255; E1/E8/EB/FE take this index)
 *   tracks  one command stream per used channel
 *
 * One Furnace order occurrence becomes one chunk per channel. Chunks whose bytes repeat become `FE`
 * subroutines. The song loop is `FA` at the loop chunk and `FB 00` at the end. The driver ticks once per
 * NTSC frame at `F9 7F` (Phase 0), and every length byte is ticks-1 (max 128 ticks per byte).
 */
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import { arpIsFixed, expandProcMacro } from '../nes/famistudioSong';

export interface MdsKeyOn { tick: number; ch: number; note: number }
export interface MdsSong {
  /** The sequence, to `incbin` at the driver's sequence address (even aligned). */
  seq: Uint8Array;
  /** One line per lossy Furnace item with its count. */
  lossy: string[];
  /** Furnace note-ons in play order (Furnace note value, C-4 = 48), for the MAME key-on check. */
  keyOns: MdsKeyOn[];
  /** Signed 8-bit PCM blob for FM6 sample instruments, to `incbin` at the pcm address passed to mds_init (32 KiB aligned). */
  pcm: Uint8Array;
}

type Kind = 'fm' | 'psg' | 'noise';
const MDS_CHAN: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const KIND: Kind[] = ['fm', 'fm', 'fm', 'fm', 'fm', 'fm', 'psg', 'psg', 'psg', 'noise'];
/**
 * With voice transpose $30 the FM note equals the Furnace note value. PSG key k writes period PSG_TAB[k%12] >> (k/12)
 * (key 0 = 1710), the period Furnace 0.6.8.3 writes for note value k truncated instead of rounded: Furnace writes
 * round(clock / f / 32) (engine.cpp calcFreq, sms.cpp toneDivider 64), so the PSG key is the note value with no offset
 * and psgFix() adds a per-key detune where the driver's truncation lands one period high.
 */
const FM_TRANSPOSE = 0x30;
const MAX_NOTE = 0xdf - 0x82;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_PITCH = 4;
const FX_FLOW = new Set([0x0b, 0x0d, 0x09, 0x0f, 0xff]);
const NTSC_HZ = 59.922743;
/** Furnace SN noise mode bits (sms.cpp snNoiseMode: bit 0 white, bit 1 PSG3 period) -> MDSDRV `EA` (mdsseq.md). Reset value 3. */
const NOISE_EA = [0, 0, 0xe3, 0xe7];

/** MDSDRV PSG period at keycode k with fine pitch 0: mds_psg_freq_tab >> octave (mdsdrv.68k mds_get_psg_pitch). */
const PSG_TAB = [1710, 1614, 1524, 1438, 1357, 1281, 1209, 1141, 1077, 1017, 960, 906];
const psgPeriod = (k: number): number => PSG_TAB[k % 12] >> Math.floor(k / 12);
/** mds_get_psg_pitch for pitch p = key * 256 + fraction: table interpolation, then `lsr` by octave (truncates). */
export function mdsPsgPitch(p: number): number {
  const k = p >> 8, f = p & 255, n = k % 12, a = PSG_TAB[n], b = n === 11 ? 855 : PSG_TAB[n + 1];
  return (a - Math.floor(((a - b) * f) / 256)) >> Math.floor(k / 12);
}
/**
 * Detune (1/256 semitone) that makes the driver write Furnace's rounded period for PSG key k (measured highscorefollin PSG1
 * note 54: Furnace 76, MDSDRV 75 at detune 0). Of the detunes that hit the key, take the one that also hits Furnace's period for
 * the most pitch offsets within half a semitone, so 04xy vibrato and slides stay on the rounded period (newer_song_lol PSG1: the
 * smallest-|d| edge detune sat one period high on 810 of the 04 55 nodes over keys 24..72). shortcut: corrects the base key only (arp macro steps keep the truncated period), and keys
 * 85+ (period under 13, over 8 kHz) would need a detune past one byte, so they stay one period high; upgrade with a note-byte borrow.
 */
// MDSDRV PCM volume: mds_z80_get_vol maps E2 attenuation a (0.75 dB units) through mds_psg_vol_table to level L (2 dB steps),
// and the Z80 multiplies by volume_table[L] / 256 (mdsdrv.68k). Furnace DAC: sample * dacVolTable[vol] >> 7 = 10^(-0.75 (127 - vol) / 20).
const PCM_LEVEL = [5, 3, 2, 3, 3, 2, 3, 3, 2, 3, 3, 2, 3, 3, 24, 64].flatMap((n, l) => new Array<number>(n).fill(l));
const PCM_GAIN = [256, 203, 161, 128, 102, 81, 64, 51, 40, 32, 26, 20, 16, 13, 10, 0];
export const pcmGain = (a: number): number => PCM_GAIN[PCM_LEVEL[Math.max(0, Math.min(127, a))]] / 256;
export const furnaceDacGain = (vol: number): number => (vol <= 0 ? 0 : 10 ** (-0.75 * (127 - Math.min(127, vol)) / 20));
/** genesis.cpp dacVolTable[vol]: unsigned char 128 * 10^(-0.75 (127 - vol) / 20), truncated; entry 0 is 0. */
export const furnaceDacTable = (vol: number): number => (vol <= 0 ? 0 : Math.trunc(128 * furnaceDacGain(vol)));
/** E2 attenuation with the smallest driver PCM gain not below Furnace's dacVolTable gain, so the baked residual (pcmDacScale) is <= 1. */
export function pcmDacAtt(vol: number): number {
  const want = furnaceDacTable(vol) / 128;
  let best = 0;
  for (let a = 1; a < 128; a++) if (pcmGain(a) >= want && pcmGain(a) < pcmGain(best)) best = a;
  return best;
}
/** Gain baked into the FM6 sample data so driver gain pcmGain(pcmDacAtt(vol)) times it is Furnace's dacVolTable[vol] / 128. */
export const pcmDacScale = (vol: number): number => {
  const g = pcmGain(pcmDacAtt(vol));
  return g ? furnaceDacTable(vol) / 128 / g : 0;
};

const psgFixMemo = new Map<number | string, number>();
const OFFS_HALF = Array.from({ length: 129 }, (_, i) => i - 64);
/** Offsets (1/128 semitone) a 04xy vibrato plays: positions reachable from 0 in steps of rate (vibratoEnvelope off()). */
export function vibOffsets(rate: number, depth: number, fine = 15): number[] {
  const out = new Set<number>([0]);
  for (let p = 0; p < 64; p++) out.add(Math.trunc(((depth * VIB_TABLE[(p * rate) % 64] * fine) >> 4) / 15));
  return [...out];
}
/**
 * offs: the pitch offsets the note plays (vibOffsets under 04xy). Without them the detune is scored over every offset within half a
 * semitone; with them it is scored on exactly the vibrato's offsets, which leaves fewer one-period misses (newer_song_lol PSG1 04 55).
 */
export function psgFix(k: number, offs?: number[]): number {
  const mk = offs ? `${k}:${offs.join(',')}` : k;
  const hit = psgFixMemo.get(mk); if (hit !== undefined) return hit;
  const per = (o: number) => Math.min(1023, Math.round(sndPeriod(k + o / 128)));
  // Of the detunes that write Furnace's period at the key, take the one that also writes it for most offsets within a half
  // semitone: the driver interpolates linearly and truncates where Furnace rounds, so the edge detune put 04xy vibrato and slide
  // offsets one period high (newer_song_lol PSG1). Ties go to the detune nearest 0.
  let best = 0, bestMiss = Infinity;
  for (let a = 0; a <= 128; a++) for (const d of a ? [-a, a] : [0]) {
    if (d > 127 || k * 256 + d < 0 || mdsPsgPitch(k * 256 + d) !== per(0)) continue;
    let miss = 0;
    for (const o of offs ?? OFFS_HALF) if (k * 256 + d + 2 * o >= 0 && mdsPsgPitch(k * 256 + d + 2 * o) !== per(o)) miss++;
    if (miss < bestMiss) { best = d; bestMiss = miss; }
  }
  psgFixMemo.set(mk, best);
  return best;
}

/**
 * Furnace 03xx on an SN tone channel steps the period by xx per tick until it reaches the target period (sms.cpp, linear in period).
 * MDSDRV's own `E7 pta` glide is exponential in pitch, so the slide is written as a pitch envelope (`E8`, one node per tick, relative to the
 * target note, 1/256 semitone) holding Furnace's per-tick period sequence; the driver adds it to the slurred note's pitch (mdsdrv.68k @do_peg).
 * shortcut: ideal 2^(-semitone/12) period curve, not the driver's table, (a chunk start keeps a running slide, see insCmd).
 */
const sndPeriod = (nv: number): number => 3579545 / (27.5 * 2 ** ((nv + 3) / 12)) / 64;
/**
 * FM 03xx (measured, Fancy_Promenard FM4 03 70: 1567.06, 1749.13, 1931.19, then the target 1975.08 Hz): Furnace steps the frequency linearly in Hz
 * by xx fnum units of the target's block per tick (1.6256 Hz per xx at block 6, 3.25 Hz at block 7; block = lowest with fnum <= 1215) and clamps at the target. Hz = 27.5 * 2^((nv-9)/12), nv = the converter's FM key (83 = 1975 Hz).
 * shortcut: ideal equal-temperament target Hz (Furnace's fnum quantisation differs by under 0.03 percent), NTSC clock only.
 */
const FM_FNUM_HZ = 7670454 / 144 / 2 ** 21; // Hz per fnum unit at block 0
const fmHzPerXx = (targetHz: number): number => FM_FNUM_HZ * 2 ** Math.max(0, Math.ceil(Math.log2(targetHz / FM_FNUM_HZ / 1216)));
const fmHz = (nv: number): number => 27.5 * 2 ** ((nv - 9) / 12);
/**
 * Linear-pitch songs (compatFlags.linearPitch, measured RubyIllusions FM3 03 0F: 7 steps of 0.47 semitone): Furnace keeps the base frequency
 * as note<<7 and steps it by xx * pitchSlideSpeed per tick on every chip (genesis.cpp / sms.cpp DIV_CMD_NOTE_PORTA, playback.cpp
 * portaSpeedMultiplier), so the slide is linear in pitch; pass that step as `linStep` (1/128 semitone) and the nodes are exact.
 * MDSDRV steps a pitch envelope once per frame, not once per sequence tick (measured djtBMX FM1 at F9 ff: 36 nodes of 0.31 semitone over
 * a 72-tick slide), so `tpf` (Furnace ticks per frame: (tempo + 1) / 128 sequence ticks times s.hz / rate) picks the Furnace tick each frame node lands on.
 */
export function portaEnvelope(fromNv: number, toNv: number, xx: number, fm = false, linStep = 0, tpf = 1): number[] {
  const lin = linStep > 0;
  const a = lin ? fromNv * 128 : fm ? fmHz(fromNv) : sndPeriod(fromNv), b = lin ? toNv * 128 : fm ? fmHz(toNv) : sndPeriod(toNv), out: number[] = [];
  if (lin) xx = linStep; else if (fm) xx *= fmHzPerXx(b);
  const node = (p: number, len: number) => {
    const w = Math.max(-0x8000, Math.min(0x7eff, Math.round(lin ? 2 * (p - b) : 256 * 12 * Math.log2(fm ? p / b : b / p)))) & 0xffff;
    out.push(w >> 8, w & 0xff, 0, len);
  };
  const up = a < b, ticks: number[] = [a];
  for (let p = a; p !== b && ticks.length < 512; ) { p = up ? Math.min(b, p + xx) : Math.max(b, p - xx); ticks.push(p); }
  let n = 0;
  for (; n < 120 && Math.round((n + 1) * tpf) < ticks.length; n++) node(ticks[Math.round((n + 1) * tpf)], 0);
  node(b, 255); // length counts delay 0..len; 0 = one tick
  out.push(0x7f, n);
  return out;
}

/**
 * MDSDRV keycode for a noise note in a PSG3-rate mode (20xy, x=1). Furnace "easy noise" (sms.cpp snCalcFreq / NOTE_SN):
 * above the threshold each semitone steps the PSG3 period down by one from 16, and with snNoLowPeriods any
 * note above 153 writes period 1. Below the threshold the tone mapping applies (key = nv).
 * shortcut: assumes noiseDivider 64 (Sega PSG chipType 0) and no pitch/arp offset; upgrade when a song uses chipType 1/2.
 */
function noiseKey(m: FurnaceModule, nv: number, lossy: { add(s: string): void }): number {
  const N = nv + 60; // FurnacePatternParser drops the +60 of splitNoteToNote; actualNote is the full note.
  const oct = Math.log2(3579545 / (16 * 64) / (0.0625 * (m.tuning || 440)));
  let p: number;
  if (m.compatFlags.linearPitch) { // snCalcFreq, 1/128-semitone units
    const thr = Math.round(128 * 12 * oct) - 384 + 64 + 60 * 128;
    if ((N << 7) <= thr) return nv;
    p = Math.max(0, (2048 - ((N << 7) - thr)) >> 7);
  } else { // NOTE_SN, whole notes
    const thr = Math.round(12 * oct) - 3 + 60;
    if (N <= thr) return nv;
    p = Math.max(0, 16 - (N - thr));
  }
  if (m.compatFlags.snNoLowPeriods && N > 153) p = 1;
  if (p < 1) { lossy.add('noise PSG3 period 0 (MDSDRV minimum 1)'); p = 1; }
  for (let k = 119; k >= 0; k--) if (psgPeriod(k) >= p) return k; // highest key at or above the period: exact for 1..16
  return 0;
}

export class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
}

function macro(ins: FurnaceInstrument | undefined, code: number, version: number): FurnaceMacro | undefined {
  const m = ins?.macros.find((x) => x.code === code && x.length > 0);
  return m && m.type !== 0 ? expandProcMacro(m, version) : m;
}

/** Macro steps as per-tick values; `loop` is a tick index or -1. */
function ticksOf(m: FurnaceMacro, lossy: Lossy, what: string): { vals: number[]; loop: number } {
  const sp = Math.max(1, m.speed);
  if (m.delay > 0) lossy.add(`${what} macro delay (ignored)`);
  if (m.release >= 0 && m.release < m.length) lossy.add(`${what} macro release point (ignored)`);
  const vals = m.data.slice(0, m.length).flatMap((v) => Array<number>(sp).fill(v));
  return { vals, loop: m.loop >= 0 && m.loop < m.length && m.loop !== 255 ? m.loop * sp : -1 };
}

/** 30-byte FM voice in register order (+0,+4,+8,+C). Furnace operators are already stored in register order (genesis.cpp writes op[i] at opOffs[i] = 4*i), as MDSDRV reads them (mdsdrv.68k load inst data). */
/** MDSDRV mds_fm_op_table: operator i (register order) of algorithm a is a carrier when i >= MDS_FIRST_CARRIER[a]. */
const MDS_FIRST_CARRIER = [3, 3, 3, 3, 2, 1, 1, 0];

function fmVoice(ins: FurnaceInstrument | undefined, lossy: Lossy): number[] {
  const fm = ins?.fm;
  if (!fm || fm.operators.length < 4) { lossy.add('FM channel instrument without FM data (default voice)'); return [...Array<number>(24).fill(0), 0x7f, 0x7f, 0x7f, 0, 7, FM_TRANSPOSE]; }
  if ((fm.fms ?? 0) || (fm.ams ?? 0)) lossy.add('FM LFO sensitivity (FMS/AMS)');
  const DT = [7, 6, 5, 0, 1, 2, 3, 4];
  const ops = fm.operators.slice(0, 4);
  const row = (f: (o: (typeof ops)[number]) => number) => ops.map(f);
  return [
    ...row((o) => (DT[o.dt & 7] << 4) | (o.mult & 15)),
    ...row((o) => ((o.rs ?? 0) << 6) | (o.ar & 31)),
    ...row((o) => (o.am ? 0x80 : 0) | (o.dr & 31)),
    ...row((o) => o.d2r & 31),
    ...row((o) => ((o.sl & 15) << 4) | (o.rr & 15)),
    ...row((o) => (o.ssg ?? 0) & 15),
    ...row((o) => o.tl & 127),
    ((fm.feedback & 7) << 3) | (fm.algorithm & 7),
    FM_TRANSPOSE,
  ];
}

/**
 * Per-tick macro values resampled to driver frames (MDSDRV steps PSG and pitch envelopes once per NTSC VINT, Furnace macros once per tick):
 * frame f plays the tick at its midpoint, floor((f + 0.5) * tickHz / NTSC_HZ). Within the 0.5 Hz "on frame" band it stays one frame per tick.
 */
/** A PSG key-on: driver frame f0 it plays on, Furnace engine tick k it stands for. */
export type HitPhase = { f0: number; k: number };

function framesOf(tv: { vals: number[]; loop: number }, tickHz: number, phase?: HitPhase): { vals: number[]; loop: number } {
  const r = Math.abs(tickHz - NTSC_HZ) > 0.5 ? tickHz / NTSC_HZ : 1;
  // Per hit: key-on on driver frame f0 at Furnace tick k, so driver frame f0 + f plays the Furnace tick live at its midpoint, minus k.
  // shortcut: a looping macro keeps the key-on-anchored table (its loop would need one phase per pass); cut it per hit if a song needs it.
  if (phase && r !== 1 && tv.loop < 0) {
    const vals: number[] = [];
    for (let f = 0; ; f++) {
      const j = Math.floor((phase.f0 + f) * r) - phase.k; // hit frame f0 starts on Furnace tick k: no half-frame rounding (2k: +0.5 cost 0.25 dB on Solar_Man PSG4)
      if (j >= tv.vals.length && vals.length) break;
      vals.push(tv.vals[Math.max(0, Math.min(tv.vals.length - 1, j))]);
    }
    return { vals, loop: -1 };
  }
  const vals = Array.from({ length: Math.max(1, Math.round(tv.vals.length / r)) }, (_, f) => tv.vals[Math.min(tv.vals.length - 1, Math.floor((f + 0.5) * r))]);
  return { vals, loop: tv.loop >= 0 ? Math.min(vals.length - 1, Math.max(0, Math.ceil(tv.loop / r - 0.5))) : -1 };
}

/**
 * PSG envelope: `xy` nodes (x frames 1..15, y attenuation), `01` sustain + `00` end, or `02 pos` loop.
 * MDSDRV steps the envelope once per NTSC frame (mds_psg_update_env runs every VINT), so the macro goes through framesOf
 * (measured Solar_Man PSG4 at 56 Hz: -0.3 dB from a 7% fast decay).
 */
export function psgEnvelope(ins: FurnaceInstrument | undefined, version: number, lossy: Lossy, tickHz = NTSC_HZ, phase?: HitPhase): number[] {
  const m = macro(ins, MACRO_VOL, version);
  if (!m) return [0x10, 0x01, 0x00];
  const { vals, loop } = framesOf(ticksOf(m, lossy, 'PSG volume'), tickHz, phase);
  const out: number[] = [];
  let loopPos = -1;
  for (let t = 0; t < vals.length;) {
    if (t === loop) loopPos = out.length;
    let n = 1;
    while (n < 15 && t + n < vals.length && vals[t + n] === vals[t] && t + n !== loop) n++;
    out.push((n << 4) | (15 - Math.max(0, Math.min(15, vals[t]))));
    t += n;
  }
  return loopPos >= 0 ? [...out, 0x02, loopPos] : [...out, 0x01, 0x00];
}

/** Pitch envelope from an absolute pitch macro (1/128 semitone, Furnace linear pitch) in $100-per-semitone units. */
export function pitchEnvelope(m: FurnaceMacro, lossy: Lossy, tickHz = NTSC_HZ): number[] | undefined {
  if (m.mode & 1) { lossy.add('relative pitch macro'); return undefined; }
  const { vals, loop } = framesOf(ticksOf(m, lossy, 'pitch'), tickHz); // @do_peg runs in the per-frame voice update
  const nodes: Array<[number, number]> = []; // [value, frames]
  for (let t = 0; t < vals.length; t++) {
    const last = nodes[nodes.length - 1];
    if (last && last[0] === vals[t] && last[1] < 256 && t !== loop) last[1]++; else nodes.push([vals[t], 1]);
  }
  const loopNode = loop < 0 ? nodes.length - 1 : nodes.findIndex((_, i) => nodes.slice(0, i).reduce((a, n) => a + n[1], 0) === loop);
  if (loop < 0) nodes[nodes.length - 1][1] = 256; // hold the last value
  const out: number[] = [];
  for (const [v, n] of nodes) { const w = Math.max(-0x8000, Math.min(0x7eff, v * 2)) & 0xffff; out.push(w >> 8, w & 0xff, 0, n - 1); } // a node lasts length+1 frames (mdsdrv.68k @do_peg)
  return [...out, 0x7f, Math.max(0, loopNode)];
}

/**
 * Macro table for a relative arpeggio: `16 tt` set transpose, `81 nn` hold nn+1 ticks, `80 nn` jump / `80 00` end.
 * The driver steps it per sequence tick, Furnace per engine tick at s.hz, so `spt` (sequence ticks per Furnace tick, rate / s.hz) scales the holds.
 * shortcut: holds round per step on a running total that restarts at each loop pass, so a looped fractional arp drifts under 1 tick per pass.
 */
export function arpTable(m: FurnaceMacro, lossy: Lossy, step = (v: number) => v, spt = 1): number[] | undefined {
  if (m.data.slice(0, m.length).some(arpIsFixed)) { lossy.add('fixed arpeggio macro'); return undefined; }
  const sp = Math.max(1, m.speed);
  const out: number[] = [];
  const loop = m.loop >= 0 && m.loop < m.length && m.loop !== 255 ? m.loop : -1;
  if (m.delay > 0) lossy.add('arpeggio macro delay (ignored)');
  const at = (i: number) => Math.round(i * sp * spt);
  m.data.slice(0, m.length).forEach((v, i) => out.push(0x16, step((v << 2) >> 2) & 0xff, 0x81, Math.max(0, Math.min(255, at(i + 1) - at(i) - 1))));
  const after = out.length / 2 + 1; // node position after the jump
  out.push(0x80, loop < 0 ? 0 : (loop * 2 - after) & 0xff);
  return out;
}

const be16 = (v: number): number[] => [(v >> 8) & 0xff, v & 0xff];

const VIB_TABLE = Array.from({ length: 64 }, (_, i) => Math.trunc(127 * Math.sin((i / 64) * 2 * Math.PI))); // engine.cpp vibTable
/**
 * Furnace 04xy (linear pitch, sine shape): every tick, after the row runs, pos += x (mod 64) and the pitch offset is
 * ((y * vibTable[pos] * fine) >> 4) / 15 in 1/128 semitone (playback.cpp per-tick vibrato; fine = E4xx, default 15), so the
 * first tick after `pos0` already plays pos0 + x. Written as an extended pitch envelope, one 1/256-semitone node per driver
 * frame, looping over the 64/gcd(64, x)-tick cycle; `tpf` (Furnace ticks per frame, see portaEnvelope) picks the Furnace tick each node lands on.
 */
export function vibratoEnvelope(pos0: number, rate: number, depth: number, fine = 15, tpf = 1): number[] {
  const off = (t: number) => Math.trunc(((depth * VIB_TABLE[(pos0 + (t + 1) * rate) % 64] * fine) >> 4) / 15);
  let g = 64; for (let r = rate; r; ) [g, r] = [r, g % r];
  const frames = rate ? Math.max(1, Math.round(64 / g / tpf)) : 1, out: number[] = [];
  for (let n = 0; n < frames; n++) {
    const w = (2 * off(Math.round(n * tpf))) & 0xffff;
    out.push(w >> 8, w & 0xff, 0, 0, rate ? 0 : 255, (n + 1) % frames);
  }
  return out;
}

// Furnace engine tick of virtual tick t at fpt engine ticks per virtual tick (playback.cpp nextTick: tempoAccum from 0, a tick each D).
export const furnaceTickOf = (t: number, fpt: number): number => Math.ceil((t + 1) * fpt - 1e-9) - 1;

/**
 * Per-tick F9 values that put sequence tick t on the NTSC frame nearest its Furnace engine tick F(t) (furnaceTickOf) in time.
 * Driver (mdsdrv.68k request loop): each frame counter += tempo + 1 and runs one sequence tick per 128; the last tick a frame runs sets
 * the next frame's tempo. Frame 0 plays tick 0 at the header tempo 7f (counter back to 0). The counter is held at 64 so a frame can run
 * 0, 1 or 2 ticks. At 180/150 this gives Furnace's 1,1,1,1,2 ticks per frame instead of one fixed F9 (1.203125 ticks/frame, drifting).
 */
export function frameTempos(n: number, fpt: number, hz: number): number[] {
  // Furnace frame f -> NTSC frame D[f]. NTSC frames are longer, so now and then two Furnace frames share one; only merge two whose ticks
  // fit one driver frame (at most 2), else defer the merge a frame (a 2-tick frame next to any other would need 3).
  const nF = furnaceTickOf(n - 1, fpt) + 1, cnt = new Array<number>(nF).fill(0), D = [0];
  for (let t = 0; t < n; t++) cnt[furnaceTickOf(t, fpt)]++;
  for (let f = 1, shared = cnt[0]; f < nF; f++) {
    const merge = D[f - 1] + 1 > f * NTSC_HZ / hz + 0.5 && shared + cnt[f] <= 2;
    D.push(merge ? D[f - 1] : D[f - 1] + 1);
    shared = merge ? shared + cnt[f] : cnt[f];
  }
  const G = (t: number) => D[furnaceTickOf(t, fpt)];
  const out = new Array<number>(n).fill(-1);
  let t = 1, c = 0, last = 0;
  for (let g = 1; t < n; g++) {
    let want = 0;
    while (want < 2 && t + want < n && G(t + want) <= g) want++;
    const d = Math.max(1, Math.min(256, want * 128 + 64 - c));
    out[last] = d - 1;
    const k = (c + d) >> 7;
    c = (c + d) & 127;
    if (k) last = t + k - 1;
    t += k;
  }
  // Ticks that are not the last of their frame set nothing that plays: hold the previous value so runs merge.
  for (let i = 0; i < n; i++) if (out[i] < 0) out[i] = i ? out[i - 1] : 0x7f;
  return out;
}

/** Conductor bytes for per-tick F9 values: runs of F9 vv ll (ll = ticks - 1, max 128), repeated groups of up to 4 runs in FA .. FB kk loops. */
export function encodeTempos(v: number[]): number[] {
  const seg: number[][] = [];
  for (let i = 0; i < v.length;) {
    let j = i + 1;
    while (j < v.length && v[j] === v[i] && j - i < 128) j++;
    seg.push([0xf9, v[i], j - i - 1]);
    i = j;
  }
  const same = (x: number, y: number, p: number) => y + p <= seg.length && seg.slice(x, x + p).every((s, q) => s.join() === seg[y + q].join());
  const out: number[] = [];
  for (let i = 0; i < seg.length;) {
    let bp = 1, bk = 1;
    for (let p = 1; p <= 4; p++) {
      let k = 1;
      while (k < 255 && same(i, i + k * p, p)) k++;
      if (k > 1 && k * p > bp * bk) [bp, bk] = [p, k];
    }
    if (bk > 1) { out.push(0xfa, ...seg.slice(i, i + bp).flat(), 0xfb, bk); i += bp * bk; }
    else out.push(...seg[i++]);
  }
  return out;
}

export function furnaceToMds(m: FurnaceModule, subsong = 0): MdsSong {
  const lossy = new Lossy();
  const sys = m.systems;
  const fmOnly = sys.length === 1 && sys[0] === 0x83;
  if (!fmOnly && !(sys.length === 1 && sys[0] === 0x02) && !(sys.length === 2 && sys[0] === 0x83 && sys[1] === 0x03)) {
    throw new Error(`MDSDRV export needs a Genesis song (YM2612 + SN76489); systems are ${sys.map((x) => x.toString(16)).join(',')}`);
  }
  const s = m.subsongs[subsong];
  const nCh = fmOnly ? 6 : KIND.length;
  // Driver: each NTSC VINT adds tempo+1 to a counter and steps one tick per 128 (Phase 0), so ticks/s = (dd+1)*NTSC/128.
  const rate = s.hz * (s.virtualTempo || 1) / (s.virtualTempoD || 1);
  const tempo = Math.max(0, Math.min(255, Math.round(rate * 128 / NTSC_HZ) - 1));
  // Furnace runs per-tick effects and macros at s.hz; virtual tempo only moves the row counter (playback.cpp tempoAccum), so a sequence
  // tick holds fpt Furnace ticks (1 without virtual tempo; 5/6 at 180/150).
  const fpt = s.hz / rate;
  if (Math.abs(rate - NTSC_HZ) > 0.5) lossy.add(`tick rate ${rate.toFixed(2)} Hz: ticks land on NTSC frames (up to 1 frame early or late)`);
  if (rate * 128 / NTSC_HZ < 1 || rate * 128 / NTSC_HZ > 256) lossy.add(`tick rate ${rate.toFixed(2)} Hz outside the driver's ${(NTSC_HZ / 128).toFixed(2)}-${(2 * NTSC_HZ).toFixed(2)} Hz range (clamped)`);
  if (Math.abs((m.tuning || 440) - 440) > 0.5) lossy.add(`tuning ${m.tuning} Hz: played at 440 Hz`);
  // An effect with no value plays as value 0 (playback.cpp: effectVal==-1 -> 0); the parser keeps -1 (0D with no value meant row -1).
  const cellAt = (ch: number, o: number, r: number) => {
    const c = m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];
    return c?.effects?.some((e) => e.type >= 0 && e.value < 0) ? { ...c, effects: c.effects.map((e) => (e.type >= 0 && e.value < 0 ? { ...e, value: 0 } : e)) } : c;
  };

  // 1. Order flow: (order, start row) pairs until one repeats (the loop target) or FFxx stops the song.
  const speeds = s.speedPattern?.length ? [...s.speedPattern] : [s.speed1, s.speed2];
  const chunks: Array<{ o: number; rows: number[]; ticks: number[] }> = [];
  const seen = new Map<string, number>();
  let o = 0, start = 0, speedIdx = 0, loopChunk = -1;
  while (chunks.length < 4096) {
    const key = `${o}:${start}`;
    if (seen.has(key)) { loopChunk = seen.get(key)!; break; }
    seen.set(key, chunks.length);
    const c = { o, rows: [] as number[], ticks: [] as number[] };
    chunks.push(c);
    let next: [number, number] | null = null, stop = false;
    for (let r = start; r < s.patLen && !next && !stop; r++) {
      for (let ch = 0; ch < nCh; ch++) for (const e of cellAt(ch, o, r)?.effects ?? []) {
        if (e.type === 0x09 && e.value > 0) speeds[0] = e.value;
        if (e.type === 0x0f && e.value > 0) speeds[speeds.length > 1 ? 1 : 0] = e.value;
        if (e.type === 0x0b) next = [e.value, 0];
        if (e.type === 0x0d && !next) next = [o + 1, e.value];
        if (e.type === 0xff) stop = true;
      }
      c.rows.push(r);
      c.ticks.push(Math.max(1, speeds[speedIdx++ % speeds.length]));
    }
    if (stop) break;
    [o, start] = next ?? [o + 1, 0];
    if (o >= s.ordersLen) o = 0;
    if (start >= s.patLen) start = 0;
  }

  // 2. Song table items.
  const items: number[][] = [];
  const item = (bytes: number[]): number => { items.push(bytes); return items.length - 1; };
  // Song table entries for `pat` subroutines and macro tables are offsets from tbase, all others from sdtop (mdsseq.md, mdsdrv.68k @cmd_pat / @cmd_mtab).
  const tbaseRel = new Set<number>();
  const tbItem = (bytes: number[]): number => { const i = item(bytes); tbaseRel.add(i); return i; };
  const slideItems = new Map<string, number>();
  const slideItem = (b: number[]) => { const k = b.join(','); if (!slideItems.has(k)) slideItems.set(k, item(b)); return slideItems.get(k)!; };
  // Extended pitch envelopes (mdsseq.md: entry has bit 15 set, 6-byte nodes with a word delta) for 01xx/02xx.
  const extRel = new Set<number>();
  const extItem = (b: number[]) => { const i = slideItem(b); extRel.add(i); return i; };
  // FM6 samples: Furnace steps the sample at c4Rate * 2^((freq note - C-4) / 12) with no interpolation (genesis.cpp softPCM);
  // each (sample, freq note) pair is resampled the same way to MDSDRV rate 8 and gets an 8-byte PCM header item (sdtop-relative).
  // shortcut: MDSDRV rate 8 taken as 8 * 2190 Hz (mdsseq.md "~2190 Hz steps"); upgrade if a measured Z80 loop rate differs.
  const PCM_HZ = 8 * 2190, pcm: number[] = [], pcmItems = new Map<string, number>();
  // vol: the FM6 volume at note-on; its residual to the driver's 2 dB PCM step is baked into this copy of the sample (pcmDacScale).
  const pcmRef = (smp: number, freqNote: number, vol: number): number => {
    const k = `${smp}:${freqNote}:${vol}`, sc = pcmDacScale(vol);
    if (pcmItems.has(k)) return pcmItems.get(k)!;
    const sm = m.samples[smp];
    const src = sm.depth === 16 ? Array.from(sm.data, (v) => v >> 8) : Array.from(sm.data);
    if (sm.depth !== 8 && sm.depth !== 16) lossy.add(`FM6 sample depth ${sm.depth} (played as 8-bit data)`);
    if (sm.loop) lossy.add('FM6 sample loop (played once)');
    const step = (sm.c4Rate || 8363) * 2 ** ((freqNote - 108) / 12) / PCM_HZ;
    const data = Array.from({ length: Math.max(1, Math.floor(src.length / step)) }, (_, j) => (Math.max(-128, Math.min(127, Math.round(src[Math.floor(j * step)] * sc))) + 128) & 0xff);
    // MDSDRV volume tables take unsigned samples (mdsdrv.68k: -128 + byte before the multiply); Furnace data is signed.
    // 2-channel mode at rate 8 reads 32-byte blocks (mdssub.z80 alignment table); keep each sample inside one 32 KiB bank when it fits.
    while (pcm.length & 31) pcm.push(0);
    if (data.length <= 0x8000 && (pcm.length & 0x7fff) + data.length > 0x8000) while (pcm.length & 0x7fff) pcm.push(0);
    const at = pcm.length;
    pcm.push(...data, ...new Array(32).fill(0)); // the driver reads a few bytes past the end
    const i = item([8, (at >> 16) & 0xff, (at >> 8) & 0xff, at & 0xff, ...be16(data.length >>> 16), ...be16(data.length & 0xffff)]);
    pcmItems.set(k, i);
    return i;
  };
  // Conductor track on dummy channel 0f. F9 is one byte in 1/128 NTSC frames, so 60 Hz falls between 7f (59.92 Hz) and 80 (60.39 Hz);
  // one fixed value drifts 0.13 percent (measured: highscorefollin 40 ms late at 31.6 s). Dither both per 128-tick block so tick k
  // stays at Furnace's k / rate seconds; each span (intro, loop body) is balanced on its own so loop passes do not accumulate.
  const fIdeal = NTSC_HZ / rate, lo = Math.max(0, Math.min(254, Math.floor(rate * 128 / NTSC_HZ) - 1)), fLo = 128 / (lo + 1), fHi = 128 / (lo + 2);
  const conduct = (n: number): number[] => {
    const nHi = Math.max(0, Math.min(n, Math.round((n * (fLo - fIdeal)) / (fLo - fHi)))), out: number[] = [];
    for (let a = 0; a < n; a += 128) {
      const e = Math.min(n, a + 128), h = Math.round((e * nHi) / n) - Math.round((a * nHi) / n);
      if (h) out.push(0xf9, lo + 1, h - 1);
      if (e - a - h) out.push(0xf9, lo, e - a - h - 1);
    }
    return out;
  };
  const spanTicks = (from: number, to: number) => chunks.slice(from, to).reduce((n, c) => n + c.ticks.reduce((x, y) => x + y, 0), 0);
  const introEnd = loopChunk >= 0 ? loopChunk : chunks.length;
  const nIntro = spanTicks(0, introEnd), nBody = loopChunk >= 0 ? spanTicks(loopChunk, chunks.length) : 0;
  // Virtual tempo above the engine rate: Furnace runs 1 or 2 ticks per engine frame (tempoAccum), so the conductor sets each frame's
  // tick count. One conductor loop holds K bodies: K * nBody ticks is a whole number of Furnace frames (tempoAccum phase repeats) and
  // the fewest whole NTSC frames off per pass, so loop passes keep Furnace's frame phase (measured newer_song_lol: one body, 6399 ticks
  // = 5332.5 Furnace frames, drifted 0.41 NTSC frames per pass). Channel tracks loop on their own, so a longer conductor loop is fine.
  const useFt = fpt < 1 - 1e-9 && rate >= NTSC_HZ;
  let K = 1;
  for (let k = 1, best = Infinity; useFt && nBody && k <= 8; k++) {
    const fF = k * nBody * fpt, x = (fF * NTSC_HZ) / s.hz, e = Math.abs(x - Math.round(x)) / k;
    if (Math.abs(fF - Math.round(fF)) < 1e-6 && e < best - 1e-9) [best, K] = [e, k];
  }
  // One extra body after the loop so the block's last frame tempo leads into the next pass, not into silence.
  const ft = useFt ? frameTempos(nIntro + (K + 1) * nBody, fpt, s.hz) : null;
  const span = (a: number, n: number) => (ft ? encodeTempos(ft.slice(a, a + n)) : conduct(n));
  // Driver frame of each first-pass sequence tick (mdsdrv.68k request loop, as frameTempos models it): frame 0 plays tick 0, then each
  // frame adds the last run tick's F9 + 1 to the counter and runs one tick per 128. PSG envelopes are cut per hit against it.
  const tempoTicks = ft ?? [];
  if (!ft) {
    const cb = [...span(0, nIntro), ...(loopChunk >= 0 ? span(nIntro, K * nBody) : [])]; // conduct(): only F9 vv ll triples
    for (let j = 0; j < cb.length; j += 3) for (let q = 0; q <= cb[j + 2]; q++) tempoTicks.push(cb[j + 1]);
  }
  const frameOfTick = [0];
  for (let g = 1, c = 0; frameOfTick.length < tempoTicks.length + 1; g++) {
    const d = (tempoTicks[frameOfTick.length - 1] ?? 0x7f) + 1, k = (c + d) >> 7;
    c = (c + d) & 127;
    for (let j = 0; j < k; j++) frameOfTick.push(g);
  }
  const phaseOf = (t: number) => ({ f0: frameOfTick[Math.min(t, frameOfTick.length - 1)], k: furnaceTickOf(t, fpt) });
  const noiseArps = new Map<string, number>();
  const insCache = new Map<string, { ins: number; peg: number; mtab: number }>();
  const envItems = new Map<string, number>();
  const insRef = (kind: Kind, idx: number, phase?: HitPhase) => {
    const key = `${kind === 'fm' ? 'fm' : 'psg'}:${idx}`;
    let v = insCache.get(key);
    if (!v) {
      const ins = m.instruments[idx];
      const pm = macro(ins, MACRO_PITCH, m.version), am = macro(ins, MACRO_ARP, m.version);
      // Furnace runs macros once per engine tick at s.hz; virtual tempo only moves the row counter (playback.cpp tempoAccum), so envelopes use s.hz, not `rate`.
      const peg = pm && pitchEnvelope(pm, lossy, s.hz), mt = am && arpTable(am, lossy, undefined, 1 / fpt);
      if (kind === 'fm' && macro(ins, MACRO_VOL, m.version)) lossy.add('FM volume macro (ignored)');
      v = { ins: item(kind === 'fm' ? fmVoice(ins, lossy) : psgEnvelope(ins, m.version, lossy, s.hz)), peg: peg ? item(peg) : -1, mtab: mt ? tbItem(mt) : -1 };
      insCache.set(key, v);
    }
    if (kind === 'fm' || !phase || items.length >= 224) return v; // shortcut: per-hit tables only without virtual tempo and while the 256-item table has room; upgrade by sharing tables across close phases
    // Each hit gets the envelope cut for its own tick phase; hits with the same table share one item (keyed on content).
    const env = psgEnvelope(m.instruments[idx], m.version, new Lossy(), s.hz, phase), ek = env.join();
    let e = envItems.get(ek);
    if (e === undefined) envItems.set(ek, (e = ek === items[v.ins].join() ? v.ins : item(env)));
    return { ...v, ins: e };
  };

  // 3. Per channel, per chunk: standalone command bytes.
  const keyOns: MdsKeyOn[] = [];
  const tracks: Array<{ ch: number; chunks: Array<{ bytes: number[]; tieStart: boolean; head: number }>; wrap: number[] }> = [];
  for (let ch = 0; ch < nCh; ch++) {
    const kind = KIND[ch];
    let envPh: HitPhase | undefined, trs = 0, ins = 0, vol = kind === 'fm' ? 127 : 15, pan = 0xc0, dtn = 0, noise = 3, sounding = false, any = false, tick = 0, slideEnd = 0, prevKey = -1, pegDirty = false, portaXx = 0;
    // 01xx/02xx (linear pitch): rate in 1/128 semitone per Furnace tick, poff = offset after the last tick so far. Furnace keeps the slide
    // running across notes and note offs (playback.cpp 0x01/0x02 leave inPorta false; NOTE_ON resets baseFreq, the slide goes on), so each
    // key-on restarts the envelope from 0 and only 01 00 / 02 00 / 03xx stop it, holding the reached offset until the next note.
    // The slide stops at Furnace's target (01: note 179, 02: note 0, genesis.cpp NOTE_PORTA clamps baseFreq) and targetResetsSlides
    // then clears portaSpeed (playback.cpp per-tick porta), so later notes do not slide. Furnace note = converter note + 60.
    // shortcut: limitSlides (156 / dispatch porta floor) and offsets past the driver's signed 16-bit range are clamped, lossy.
    // The driver key (note byte + transpose) must stay in 0..MAX_NOTE (mds_get_fm_pitch indexes its octave/note tables with it), so a slide
    // past that holds at the driver's end key instead of Furnace's (measured: golden_shit FM1 kick 02 c0 wrapped to 4 kHz below key 0).
    // PSG: E2 $80|v gives attenuation 15-v, added to the envelope attenuation 15-macro and clamped, the same sum as Furnace VOL_SCALE_LOG.
    // FM6 on a sample instrument: the driver turns E2 into one of 16 PCM gains (pcmDacAtt, the step at or above Furnace's dacVolTable) and
    // pcmRef bakes the rest into the sample. noOPN2Vol plays the DAC at full volume (genesis.cpp).
    const dacVol = (v: number) => (m.compatFlags.noOPN2Vol ? 127 : v);
    // Furnace KVS (fmsharedbase.h KVS): an operator takes the channel volume when kvs is 1, or 2 on a carrier; MDSDRV adds it to the carriers
    // of mds_fm_op_table[alg] only (same carriers as Furnace isOutput). An operator whose KVS differs gets base TL tl + att*(kvs - carrier)
    // through EE (fmtl), restated after every E1 (which reloads the voice TLs) and every E2. kvsIns is the voice the driver holds.
    let kvsIns = -1;
    const kvsCmd = (v: number): number[] => {
      const ops = kind === 'fm' ? m.instruments[kvsIns]?.fm?.operators : undefined;
      if (!ops || ops.length < 4 || (ch === 5 && m.instruments[ins]?.type === 4)) return [];
      const alg = m.instruments[kvsIns]!.fm!.algorithm & 7, att = 127 - v, out: number[] = [];
      for (let i = 0; i < 4; i++) {
        const car = i >= MDS_FIRST_CARRIER[alg], k = ops[i].kvs ?? 2, scaled = k === 1 || (k === 2 && car);
        if (scaled === car) continue;
        const base = (ops[i].tl & 127) + (scaled ? att : -att);
        if (base < 0 || base > 127) lossy.add('FM KVS operator TL beyond 0..127 (clamped)');
        out.push(0xee, i, Math.max(0, Math.min(127, base)));
      }
      return out;
    };
    const volCmd = (v: number) => [0xe2, kind === 'fm' ? (ch === 5 && m.instruments[ins]?.type === 4 ? pcmDacAtt(dacVol(v)) : 127 - v) : 0x80 | Math.max(0, Math.min(15, v)), ...kvsCmd(v)];
    // Sequence tick t runs on Furnace tick ceil((t + 1) * fpt) - 1: engine tick f adds N to tempoAccum and consumes every virtual tick
    // that brings it to D (playback.cpp nextTick, accum from 0), so at 180/150 the row ticks 4 and 5 share an engine tick (0,1,2,3,4,4).
    // Counted absolutely so carried phase does not drift.
    const fTick = (t: number) => furnaceTickOf(t, fpt);
    let prate = 0, poff = 0, pInit = false, curNv = -1, curKey = 0, dtnOut = 0;
    // PSG: E6 carries E5xx plus psgFix(key); each PSG chunk restates it, since a subroutine chunk can follow any detune.
    const effDtn = () => kind === 'psg' ? Math.max(-128, Math.min(127, dtn + psgFix(curKey, vDepth ? vibOffsets(vRate, vDepth, vFine) : undefined))) : dtn;
    // 03xx under a running 04xy: MDSDRV has one pitch envelope (E8, the vibrato), so the linear slide goes out per sequence tick as
    // E4 transpose + E6 detune, which mds_pitch_update adds before the envelope (pitch = note + trs + dtn, then + E8 output).
    // sA: slide offset from the target at the note (1/128 semitone, 0 = none), stepped sStep per Furnace tick from Furnace tick sF0.
    // shortcut: the E4 state is not re-set at the song loop point; a slide running across the loop starts the loop transposed.
    // An arp macro table writes t_trs too (`16 tt`, absolute, every step), so while it runs it would overwrite the slide's E4. Under
    // such a slide the slur note gets its own table (arpBake): arp value + slide transpose per sequence tick, and E4 stays out.
    let sA = 0, sStep = 0, sF0 = 0, trsOut = 0, arpT0 = 0, baked = false;
    // sTail: last Furnace tick a keyed-off slide still steps on. Furnace runs NOTE_PORTA while keyOff is set (playback.cpp:2537), so a
    // slide keeps stepping past a note-off until it lands on its target (measured 1:1, newer_song_lol FM1-3 22.75 s and 58.9 s).
    let sTail = -1;
    const slideOff = (f: number) => (sA ? Math.sign(sA) * Math.max(0, Math.abs(sA) - sStep * (f - sF0 + 1)) : 0);
    // Furnace keeps inPorta after a 03xx note until the slide reaches its target (targetResetsSlides), 03 00, 01xx/02xx or a note off:
    // a note in between without 03 only retargets the slide (playback.cpp commit note on: inPorta && keyOn -> portaNote = note, no
    // NOTE_ON), so it slides on from the pitch reached, macros not restarted. fA/fF0: the linear E8 slide in flight, as sA above;
    // pXx: the 03xx speed it runs at (0 = no porta in flight). shortcut: non-linear-pitch slides are not retargeted (fresh note-on).
    let fA = 0, fF0 = 0, pXx = 0;
    const flyOff = (f: number) => (fA ? Math.sign(fA) * Math.max(0, Math.abs(fA) - pXx * pss * (f - fF0 + 1)) : 0);
    const slideCmd = (t: number): number[] => {
      const off = slideOff(fTick(t)), o = 2 * off + effDtn(), tr = Math.floor((o + 128) / 256), d = o - 256 * tr, out: number[] = [];
      if (!off) sA = 0;
      if (baked) trsOut = tr;
      else if (tr !== trsOut) out.push(0xe4, (trsOut = tr) & 0xff);
      if (d !== dtnOut) out.push(0xe6, (dtnOut = d) & 0xff);
      return out;
    };
    // 04xy state: pos was `vPos` at tick `vAt` and advances by vRate per tick while vDepth > 0 (playback.cpp).
    let vDepth = 0, vRate = 0, vPos = 0, vAt = 0, vFine = 15;
    const vSync = (t: number) => { if (vDepth) vPos = (vPos + (fTick(t) - fTick(vAt)) * vRate) % 64; vAt = t; };
    // Driver mtab steps once per sequence tick after the row's commands (mds_update_mtab), from table position 0 at note-on or EB.
    // shortcut: a looping arp macro is not baked (lossy); upgrade by appending its loop body with a jump if a song needs it.
    const arpBake = (t0: number): number | undefined => {
      const am = macro(m.instruments[ins], MACRO_ARP, m.version);
      if (!am || insRef(kind, ins).mtab < 0) return undefined;
      if (am.loop >= 0 && am.loop < am.length && am.loop !== 255) { lossy.add('03xx under 04xy on a looping arp macro (arp overwrites the slide transpose)'); return undefined; }
      const sp = Math.max(1, am.speed), at = (i: number) => Math.round((i * sp) / fpt), vals = am.data.slice(0, am.length).map((v) => (v << 2) >> 2);
      const arpAt = (j: number) => { let i = 0; while (i + 1 < vals.length && at(i + 1) <= j) i++; return vals[i]; };
      const out: number[] = [];
      for (let k = t0; ; k++) {
        const off = slideOff(fTick(k)), v = arpAt(k - arpT0) + Math.floor((2 * off + effDtn() + 128) / 256);
        if (out.length && out[out.length - 3] === (v & 0xff) && out[out.length - 1] < 255) out[out.length - 1]++;
        else out.push(0x16, v & 0xff, 0x81, 0);
        if (!off && k - arpT0 >= at(vals.length - 1)) break;
      }
      out.push(0x80, 0);
      const key = out.join(',');
      if (!noiseArps.has(key)) noiseArps.set(key, tbItem(out));
      return noiseArps.get(key)!;
    };
    const vibCmd = (t: number): number[] => {
      vSync(t);
      // The PSG detune depends on the vibrato (psgFix offsets), so a 04xy change restates E6; a slide in flight owns E6 (slideCmd).
      const d = kind === 'psg' && !sA && effDtn() !== dtnOut ? [0xe6, (dtnOut = effDtn()) & 0xff] : [];
      return [...d, 0xe8, extItem(vibratoEnvelope(vPos, vRate, vDepth, vFine, fpf)) + 1];
    };
    // 0Axy: Furnace keeps volume in 1/256 steps and adds x*64 (or -y*64) every tick, the row's first tick included, until it clamps at
    // 0 or the channel maximum (playback.cpp per-tick volume slides); the driver gets an E2 on every tick where volume>>8 changes.
    const vmax = kind === 'fm' ? 127 : 15;
    let vol256 = vol << 8, vspeed = 0;
    // volStep runs once per sequence tick and steps the slide once per Furnace tick that falls in it (fpt per sequence tick).
    let fAcc = 0;
    const volStep = (): number[] | null => {
      let cmd: number[] | null = null;
      for (fAcc += fpt; fAcc >= 1 - 1e-9; fAcc -= 1) cmd = volStep1() ?? cmd;
      return cmd;
    };
    const volStep1 = (): number[] | null => {
      if (!vspeed) return null;
      const before = vol;
      vol256 += vspeed;
      if (vol256 > vmax << 8) { vol256 = vmax << 8; if (!m.compatFlags.noVolSlideReset) vspeed = 0; }
      else if (vol256 < 0) { vol256 = m.compatFlags.legacyVolumeSlides ? (vmax << 8) + 1 : 0; if (!m.compatFlags.noVolSlideReset) vspeed = 0; }
      vol = vol256 >> 8;
      return vol !== before ? volCmd(vol) : null;
    };
    // tpf: sequence ticks per frame; fpf: Furnace ticks per frame (what per-frame pitch envelopes step through).
    const pss = Number(m.compatFlags.pitchSlideSpeed) || 1, tpf = (tempo + 1) / 128, fpf = tpf * fpt;
    const pLimit = () => (prate > 0 ? Math.min(119 - curNv, MAX_NOTE - curKey) : -Math.min(curNv + 60, curKey)) * 128;
    // MDSDRV extended node: frame k of a node is init + (k+1)*delta, held len+1 frames (mdsdrv.68k @extended).
    // Node 0 runs the slide up to the frame before the target, node 1 holds the target.
    const pslideCmd = (): number[] => {
      const w = (v: number) => { const c = Math.max(-0x8000, Math.min(0x7fff, Math.round(v))); if (c !== Math.round(v)) lossy.add('01xx/02xx offset beyond 128 semitones (clamped)'); return c & 0xffff; };
      const node = (v: number, dv: number, len: number, next: number) => { const a = w(v), d = w(dv); return [a >> 8, a & 0xff, d >> 8, d & 0xff, len, next]; };
      pInit = poff !== 0; pegDirty = true;
      let env: number[];
      if (!prate) env = node(2 * poff, 0, 255, 0);
      else {
        const lim = pLimit(), d = 2 * prate * fpf, j = Math.ceil((2 * (lim - poff)) / d) - 1;
        env = j >= 1 ? [...node(2 * poff, d, Math.min(254, j - 1), 1), ...node(2 * lim, 0, 255, 1)] : node(2 * lim, 0, 255, 0);
      }
      return [0xe8, extItem(env) + 1];
    };
    const out: Array<{ bytes: number[]; tieStart: boolean; head: number }> = [];
    let wrap: number[] = [], mtabOn = false;
    for (const c of chunks) {
      // A slide still running at a chunk start keeps its envelope: E8 would restart it from the instrument's own one.
      const insCmd = (chunkStart = false) => {
        const r = insRef(kind, ins, envPh);
        const peg = (chunkStart ? sounding && (prate || poff) : prate) ? pslideCmd() : chunkStart && tick < slideEnd ? [] : [0xe8, r.peg + 1];
        kvsIns = ins;
        // An arp table's `16 tt` steps write t_trs and EB 00 leaves the last one in force (Solar_Man FM5 47.3 s: an octave up after
        // an 0/12 arp instrument), so an instrument without one restates the transpose; a chunk head can follow any table.
        const tr = r.mtab < 0 && (chunkStart || mtabOn) ? [0xe4, (kind === 'noise' ? (Number.isNaN(trs) ? (trs = 0) : trs) : trsOut || 0) & 0xff] : [];
        mtabOn = r.mtab >= 0;
        return [0xe1, r.ins, ...peg, 0xeb, r.mtab + 1, ...tr, ...kvsCmd(vol)];
      };
      // FM6 with a sample instrument plays PCM (genesis.cpp: dacMode from the instrument type at each note-on); E1 would leave PCM mode.
      const isDac = (n: number) => kind === 'fm' && ch === 5 && m.instruments[n]?.type === 4;
      let curPcm = -1, pcmOn = false;
      baked = false; arpT0 = tick; // insCmd(true) restates EB, which restarts the instrument's arp table
      // Chunk head: the channel state a chunk starts from. The loop chunk's head plays once; the wrap restates it from the song-end state.
      const head = (): number[] => [...(isDac(ins) ? [] : insCmd(true)), ...(vDepth && any ? vibCmd(tick) : []), ...volCmd(vol), ...(kind === 'fm' ? [0xe9, pan] : []), ...(kind === 'noise' ? [0xea, NOISE_EA[noise]] : []), ...(sA && sounding ? (trsOut = dtnOut = NaN, slideCmd(tick)) : kind === 'psg' ? [0xe6, (dtnOut = effDtn()) & 0xff] : dtn ? [0xe6, (dtnOut = dtn) & 0xff] : (dtnOut = 0, []))];
      const bytes = head(), headLen = bytes.length;
      // One sequence tick's mid-row commands: 0Axy volume step and the per-tick slide.
      const tickPre = (t: number): number[] | null => { const v = volStep(), sl = sA && (sounding || fTick(t) <= sTail) ? slideCmd(t) : []; return v || sl.length ? [...(v ?? []), ...sl] : null; };
      let curIns = ins;
      type Tok = { cmd: 'note' | 'tie' | 'rest'; n: number; t: number; pre: number[] };
      const tok: Tok[] = [];
      const emit = (t: Tok) => {
        bytes.push(...t.pre);
        let left = t.t, first = true;
        while (left > 0) {
          const len = Math.min(128, left);
          if (t.cmd === 'note' && first) bytes.push(0x82 + t.n, len - 1);
          else if (t.cmd === 'rest') bytes.push(len - 1);
          else bytes.push(0x81, len - 1);
          left -= len; first = false;
        }
      };
      let tieStart = false;
      // One sequence tick of the current state; `pre` or `cut` starts a new tie/rest token there (0A steps, ECxx, EDxx split rows).
      const addTick = (pre: number[] | null, cut = false) => {
        if (cut) sounding = false;
        if (pre || cut || !tok.length) {
          if (!tok.length && i0) tieStart = sounding;
          if (tok.length) emit(tok.pop()!);
          tok.push({ cmd: sounding ? 'tie' : 'rest', n: 0, t: 0, pre: pre ?? [] });
        }
        tok[tok.length - 1].t += 1;
      };
      let i0 = false;
      c.rows.forEach((r, i) => {
        const cell = cellAt(ch, c.o, r);
        let nv = cell ? convertFurnaceNoteValue(cell) : -1, shY = 0, shX = 0, shFrom = NaN;
        if (cell && cell.instrument >= 0) ins = cell.instrument;
        const cmds: number[] = [];
        let pChanged = false, vChanged = false, dacOff = false;
        // EDxx runs the whole row xx ticks late; ECxx keys off xx ticks after the row runs (playback.cpp rowDelay / cut, delayBehavior 2).
        // Both count Furnace engine ticks (s.hz), so under virtual tempo they land on the nearest sequence tick.
        const fxv = (t: number) => cell?.effects?.find((e) => e.type === t && e.value > 0)?.value ?? 0;
        const seqAt = (f: number) => Math.round(f / fpt) - tick, edF = fTick(tick) + fxv(0xed);
        let delay = fxv(0xed) ? Math.max(0, seqAt(edF)) : 0, cutAt = fxv(0xec);
        if (delay >= c.ticks[i]) { lossy.add('EDxx delay not shorter than the row (played on the row)'); delay = 0; }
        cutAt = cutAt ? Math.max(delay + 1, seqAt((fxv(0xed) ? edF : fTick(tick)) + cutAt)) : 0;
        if (cutAt >= c.ticks[i]) { lossy.add('ECxx cut not inside the row (ignored)'); cutAt = 0; }
        i0 = i === 0;
        for (let k = 0; k < delay; k++) addTick(tickPre(tick + k));
        if (cell && cell.volume >= 0) { vol = cell.volume; vol256 = vol << 8; cmds.push(...volCmd(vol)); }
        for (const e of cell?.effects ?? []) {
          if (e.type < 0 || FX_FLOW.has(e.type)) continue;
          if (e.type === 0x08 && kind === 'fm') { const l = e.value >> 4, rr = e.value & 15; pan = l && rr ? 0xc0 : l ? 0x80 : rr ? 0x40 : 0xc0; cmds.push(0xe9, pan); continue; }
          // E5xx: Furnace linear pitch offset xx-80 in 1/128 semitone (playback.cpp); MDSDRV dtn is 1/256 semitone, signed byte.
          if (e.type === 0xe5) {
            const d = (e.value - 0x80) * 2;
            if (d < -128 || d > 127) lossy.add('E5xx beyond 1/2 semitone (clamped)');
            dtn = Math.max(-128, Math.min(127, d)); dtnOut = effDtn(); cmds.push(0xe6, dtnOut & 0xff); continue;
          }
          if (e.type === 0x20 && kind === 'noise') {
            noise = ((e.value >> 4) & 1) << 1 | (e.value & 1);
            if (!(noise & 2)) lossy.add('noise fixed-rate mode (20xy, x=0)');
            cmds.push(0xea, NOISE_EA[noise]); continue;
          }
          if (e.type === 0x0a) { vspeed = !e.value ? 0 : e.value & 15 ? -(e.value & 15) * 64 : (e.value >> 4) * 64; continue; }
          if (e.type === 0xec || e.type === 0xed) continue;
          // 17xx sets dacMode; the next note-on sets it again from the instrument, so only 1700 over a playing sample is heard (it stops).
          if (e.type === 0x17 && kind === 'fm') { if (!e.value && pcmOn && sounding) dacOff = true; continue; }
          if (e.type === 0xe3 && !e.value) continue; // E3 00: Furnace's default vibrato direction (up and down), what vibratoEnvelope plays
          if ((e.type === 0x04 || e.type === 0xe4) && (kind === 'psg' || kind === 'fm') && m.compatFlags.linearPitch) {
            vSync(tick + delay);
            if (e.type === 0xe4) vFine = e.value; else { vDepth = e.value & 15; vRate = e.value >> 4; }
            vChanged = true; continue;
          }
          // E1xy/E2xy: shortcut for 03 (x*4) toward note +-y (playback.cpp 0xe1); y 0 or x 0 never moves the pitch.
          if ((e.type === 0xe1 || e.type === 0xe2) && (kind === 'psg' || kind === 'fm') && m.compatFlags.linearPitch) {
            // E1/E2 set portaNote/portaSpeed, the fields 01xx/02xx slide on, so they end a running 01xx/02xx (Solar_Man FM4 o3 r25).
            if (e.value & 15 && e.value >> 4) { shY = (e.type === 0xe1 ? 1 : -1) * (e.value & 15); shX = (e.value >> 4) * 4; if (prate) { prate = 0; pChanged = true; } }
            continue;
          }
          if (e.type === 0x03 && (kind === 'psg' || kind === 'fm')) { portaXx = e.value; if (!e.value) pXx = 0; if (prate) { prate = 0; pChanged = true; } continue; } // 03 00 only stops the porta
          if ((e.type === 0x01 || e.type === 0x02) && (kind === 'psg' || kind === 'fm') && m.compatFlags.linearPitch) {
            prate = (e.type === 0x01 ? 1 : -1) * e.value * pss; pChanged = true; portaXx = 0; sA = 0; pXx = 0; // 01xx/02xx end a 03xx (playback.cpp: inPorta false)
            if (m.compatFlags.limitSlides) lossy.add('01xx/02xx with limitSlides (slide range not limited)');
            if (!Number.isInteger(2 * e.value * pss * fpf)) lossy.add('01xx/02xx at a fractional sequence-tick-per-frame rate (rounded per frame)');
            continue;
          }
          lossy.add(`effect ${e.type.toString(16).padStart(2, '0').toUpperCase()}`);
        }
        const vs = volStep();
        if (vs) cmds.push(...vs);
        // With a note, Furnace keys the note on (shorthandPorta skips the porta commit) and slides from it to note +-y; without one
        // it slides from the pitch playing to the current note +-y, as a 03xx slur. Both become a slide onto the target note.
        // shortcut: a note-less E1/E2 on a keyed-off channel (Furnace slides the release tail) is dropped.
        if (shY && !(kind === 'fm' && isDac(ins))) {
          if (nv >= 0 && nv < 253) { shFrom = nv * 128; nv += shY; portaXx = shX; }
          else if (sounding && prevKey >= 0 && nv < 0) { nv = prevKey + shY; portaXx = shX; }
        }
        // A sample instrument (DIV_INS_AMIGA = 4) on FM6 plays the DAC (genesis.cpp note-on): the note map (Furnace note = nv + 60)
        // picks sample and freq note, an unmapped note plays nothing. One F0 header per (sample, freq note) replaces drum mode.
        // DAC volume: driver PCM step (pcmDacAtt) times the residual baked per note-on volume (pcmRef) = dacVolTable[vol] >> 7.
        // shortcut: a volume change mid-note moves only the driver step (sample keeps its note-on residual, under 2 dB), and a DAC volume
        // macro is not applied; upgrade with a header per (sample, volume) at each change if a song needs it.
        const dac = nv >= 0 && nv < 253 && isDac(ins);
        let dacHdr = -1;
        if (dac) {
          const a = m.instruments[ins].amiga, fn = Math.max(0, Math.min(179, nv + 60));
          // No SM feature in the file means the DivInstrumentAmiga defaults (instrument.h: initSample 0, no note map).
          const smp = a?.useNoteMap ? a.noteMap?.[fn]?.map ?? -1 : a?.initSample ?? 0;
          if (smp >= 0 && smp < m.samples.length && m.samples[smp].length > 0) dacHdr = pcmRef(smp, a?.useNoteMap ? a.noteMap?.[fn]?.freq ?? fn : fn, dacVol(vol));
        }
        const isNote = nv >= 0 && nv < 253 && (!dac || dacHdr >= 0), isOff = (dac && dacHdr < 0) || nv >= 253 || (dacOff && !isNote);
        if (pcmOn && !isNote && cell && cell.volume >= 0 && isDac(ins) && !m.compatFlags.noOPN2Vol) lossy.add('FM6 DAC volume change mid-note (driver 2 dB step only)');
        if (dac && isNote) { curIns = ins; pcmOn = true; if (dacHdr !== curPcm) { curPcm = dacHdr; cmds.unshift(0xf0, dacHdr); } }
        else if (isNote) { pcmOn = false; curPcm = -1; }
        const rowPoff = poff; // 01xx/02xx offset reached so far: a slide from the playing pitch starts there (baseFreq holds it)
        if (isNote) { poff = 0; curNv = nv; }
        // 03xx without a note slides to the note already playing, so it ends on its first tick and targetResetsSlides drops it
        // (playback.cpp NOTE_PORTA == 2): the next note keys on. shortcut: a 03xx row that retunes a slide still in flight is not kept.
        else if (portaXx && m.compatFlags.targetResetsSlides) portaXx = 0;
        else if (pChanged && sounding && (prate || poff)) cmds.push(...pslideCmd());
        if (!isNote && sounding && (sA || trsOut)) cmds.push(...slideCmd(tick + delay));
        // 04xy without a note retunes the vibrato whatever the key state, also before the first note: Furnace runs vibrato per tick on
        // every channel, and a loop back into this chunk replays it on a release tail (FM4 newer_song_lol o2 r2, 10.83 s and 96.0 s).
        if (!isNote && vChanged) { cmds.push(...(vDepth ? vibCmd(tick + delay) : [0xe8, insRef(kind, ins).peg + 1])); pegDirty = true; }
        const hitPh = isNote && kind !== 'fm' && fpt === 1 ? phaseOf(tick + delay) : undefined;
        if (isNote && (ins !== curIns || (hitPh && insRef(kind, ins, hitPh).ins !== insRef(kind, ins, envPh).ins))) { curIns = ins; envPh = hitPh; cmds.unshift(...insCmd()); }
        if (isNote || isOff || cmds.length || i === 0) {
          if (tok.length) emit(tok.pop()!);
          if (isNote) {
            let n = kind === 'fm' ? nv : kind === 'noise' && noise & 2 ? noiseKey(m, nv, lossy) : nv;
            // Keys above the note-byte range go through track transpose (E4). shortcut: trs state is linear, not re-set at the loop point.
            if (kind === 'noise' && !(n - trs >= 0 && n - trs <= MAX_NOTE)) { trs = n > MAX_NOTE ? n - MAX_NOTE : 0; cmds.push(0xe4, trs); }
            n -= trs;
            if (n < 0 || n > MAX_NOTE) { lossy.add(`${kind.toUpperCase()} note out of range (clamped)`); n = Math.max(0, Math.min(MAX_NOTE, n)); }
            curKey = n + trs;
            // Easy noise steps the PSG3 period linearly per semitone, so an arp step is a noiseKey per (note + step), not a
            // tone-table transpose. The table's `16 tt` writes t_trs (the E4 transpose), so tt is absolute and trs is unknown after.
            const am = kind === 'noise' && noise & 2 ? macro(m.instruments[ins], MACRO_ARP, m.version) : undefined;
            if (am && insRef(kind, ins).mtab >= 0) {
              const nb = n, t = arpTable(am, lossy, (v) => noiseKey(m, nv + v, lossy) - nb, 1 / fpt);
              if (t) { const k = t.join(','); if (!noiseArps.has(k)) noiseArps.set(k, tbItem(t)); cmds.push(0xeb, noiseArps.get(k)! + 1); trs = NaN; }
            }
            if (kind === 'psg' && effDtn() !== dtnOut) { dtnOut = effDtn(); cmds.push(0xe6, dtnOut & 0xff); }
            // 03xx: slur into the note (no key-off, envelope keeps running) and slide from the previous key; E7 00 turns it off again.
            // 03xx on a keyed-off channel is a plain note-on in Furnace (playback.cpp keeps doNote, NOTE_ON sets baseFreq to the target): no slide, PSG too.
            // Pitch reached at the end of the previous Furnace tick: this tick's porta step runs after the row (playback.cpp nextTick).
            const fNow = fTick(tick + delay), from = Number.isNaN(shFrom) ? prevKey * 128 + slideOff(fNow - 1) + flyOff(fNow - 1) + rowPoff : shFrom;
            // A retarget (no 03 on the row) still commits the note (doNote stays true), so it resets the vibrato phase (playback.cpp commit note on).
            const retarget = !portaXx && pXx > 0 && sounding && from !== prevKey * 128;
            if (retarget) portaXx = pXx;
            const slide = (kind === 'psg' || kind === 'fm') && (Number.isNaN(shFrom) ? sounding && prevKey >= 0 : true) && portaXx > 0 && from !== nv * 128;
            // 03xx on a keyed-on channel is no note-on (playback.cpp: doNote=false), so the vibrato phase is not reset.
            const portaSlur = portaXx > 0 && sounding && Number.isNaN(shFrom);
            // E0 slurs every such note, also a PSG 03xx onto the note already reached (no slide): a key-on would restart the macros.
            if ((kind === 'fm' || kind === 'psg') && portaSlur) cmds.push(0xe0);
            sA = 0; fA = 0; pXx = slide && m.compatFlags.linearPitch ? portaXx : 0;
            if (slide && vDepth && m.compatFlags.linearPitch) {
              sA = from - nv * 128; sStep = portaXx * pss; sF0 = fTick(tick + delay);
              const bt = arpBake(tick + delay);
              if (bt !== undefined) { cmds.push(0xeb, bt + 1); baked = true; }
            } else if (slide) {
              const lin = !!m.compatFlags.linearPitch;
              if (lin) { fA = from - nv * 128; fF0 = fNow; }
              const env = portaEnvelope(lin ? from / 128 : prevKey, nv, portaXx, kind === 'fm', m.compatFlags.linearPitch ? portaXx * (Number(m.compatFlags.pitchSlideSpeed) || 1) : 0, fpf);
              cmds.push(0xe8, slideItem(env) + 1); slideEnd = tick + Math.round((env[env.length - 1] + 1) * (tempo + 1) / 128);
            }
            else if (prate) { if (pChanged || pInit || !pegDirty) cmds.push(...pslideCmd()); }
            else if (pegDirty) cmds.push(0xe8, insRef(kind, ins).peg + 1);
            if (trsOut || sA || (kind === 'fm' && dtnOut !== effDtn())) cmds.push(...slideCmd(tick + delay));
            pegDirty = slide || prate !== 0; portaXx = 0;
            if (!m.compatFlags.continuousVibrato && (!portaSlur || retarget)) { vPos = 0; vAt = tick + delay; }
            if (!portaSlur) { arpT0 = tick + delay; if (baked && insRef(kind, ins).mtab >= 0) cmds.push(0xeb, insRef(kind, ins).mtab + 1); baked = false; }
            if (vDepth) {
              if ((slide && !sA) || prate || insRef(kind, ins).peg >= 0) lossy.add('04xy with a pitch slide or pitch macro (vibrato replaces it)');
              cmds.push(...vibCmd(tick + delay)); pegDirty = true;
            }
            prevKey = kind === 'psg' || kind === 'fm' ? nv : -1;
            tok.push({ cmd: 'note', n, t: 0, pre: cmds }); sounding = true; any = true;
            keyOns.push({ tick: tick + delay, ch, note: nv });
          } else if (isOff) { tok.push({ cmd: 'rest', n: 0, t: 0, pre: cmds }); if (sounding) sTail = Infinity; sounding = false; }
          else { tok.push({ cmd: sounding ? 'tie' : 'rest', n: 0, t: 0, pre: cmds }); if (i === 0) tieStart = sounding; }
        }
        tok[tok.length - 1].t += 1;
        for (let k = delay + 1; k < c.ticks[i]; k++) addTick(tickPre(tick + k), k === cutAt);
        if (prate && curNv >= 0) {
          const lim = pLimit();
          poff += prate * c.ticks[i] * fpt;
          if (prate > 0 ? poff >= lim : poff <= lim) {
            if (lim !== (prate > 0 ? 119 - curNv : -(curNv + 60)) * 128) lossy.add('01xx/02xx past the driver key range (held at the end key)');
            poff = lim; if (m.compatFlags.targetResetsSlides) prate = 0;
          }
        }
        tick += c.ticks[i];
      });
      if (tok.length) emit(tok.pop()!);
      out.push({ bytes, tieStart, head: headLen });
      if (loopChunk >= 0 && c === chunks[chunks.length - 1]) wrap = head();
    }
    if (any) tracks.push({ ch, chunks: out, wrap });
  }

  // 4. Subroutines: repeated chunk bytes, only where neither this chunk nor the next starts with a tie
  //    (the driver looks ahead for 81 to skip the key-off; a call or return hides it).
  const uses = new Map<string, number>();
  const key = (b: number[]) => b.join(',');
  for (const t of tracks) for (const c of t.chunks) uses.set(key(c.bytes), (uses.get(key(c.bytes)) ?? 0) + 1);
  const subs = new Map<string, number>();
  const streams = tracks.map((t) => {
    const b: number[] = [];
    t.chunks.forEach((c, i) => {
      // FA after the loop chunk's head: the loop pass enters with the song-end state (t.wrap), not the first pass's (FM4 newer_song_lol 96.0 s).
      if (i === loopChunk) { b.push(...c.bytes.slice(0, c.head), 0xfa, ...c.bytes.slice(c.head)); return; }
      const k = key(c.bytes);
      const nextTie = t.chunks[(i + 1) % t.chunks.length]?.tieStart ?? false;
      if (c.bytes.length > 2 && (uses.get(k) ?? 0) > 1 && !c.tieStart && !nextTie && items.length < 255) {
        if (!subs.has(k)) subs.set(k, tbItem([...c.bytes, 0xff]));
        b.push(0xfe, subs.get(k)!);
      } else b.push(...c.bytes);
    });
    // shortcut: a loop chunk that starts with a tie loses its legato at the wrap; Furnace songs rarely do this.
    b.push(...(loopChunk >= 0 ? [...t.wrap, 0xfb, 0x00] : []), 0xff);
    return b;
  });
  if (items.length > 256) throw new Error(`MDSDRV song table holds 256 items; this song needs ${items.length}`);
  streams.push([...span(0, nIntro), ...(loopChunk >= 0 ? [0xfa, ...span(nIntro, K * nBody), 0xfb, 0x00] : []), 0xff]);
  const chanIds = [...tracks.map((t) => MDS_CHAN[t.ch]), 0x0f];

  // 5. Layout.
  const sd: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // two dc.l + pcm_tab dc.w 0
  const even = () => { if (sd.length & 1) sd.push(0); };
  const itemOff = items.map((it) => { even(); const at = sd.length; sd.push(...it); return at; });
  even();
  const bgm = sd.length;
  sd.push(0, 0, 0, streams.length);
  const trackHdr = sd.length;
  streams.forEach(() => sd.push(0, 0, 0, 0));
  // The driver reads streams as 0(tbase,pos.w): pos is a signed word, so stream bytes must sit within
  // tbase-32 KiB .. tbase+32 KiB. Streams that do not fit after the tbase table go in front of it.
  const place = (st: number[], i: number) => { sd.splice(trackHdr + i * 4, 4, chanIds[i], 0, ...be16(sd.length - tbase)); sd.push(...st); };
  let after = items.length * 2 + streams.reduce((n, st) => n + st.length, 0), nBefore = 0, tbase: number;
  while (after > 0x7fff && nBefore < streams.length) after -= streams[nBefore++].length;
  const preLen = sd.length + streams.slice(0, nBefore).reduce((n, st) => n + st.length, 0);
  tbase = preLen + (preLen & 1); // the table is read with move.w
  streams.slice(0, nBefore).forEach(place);
  even();
  if (sd.length !== tbase) throw new Error('MDSDRV layout: stream placement out of step');
  if (itemOff.some((a, i) => extRel.has(i) && a >= 0x8000)) throw new Error('MDSDRV extended pitch envelope beyond 32 KiB of song data');
  if (itemOff.some((a, i) => tbaseRel.has(i) && a - tbase < -0x8000) || after > 0x7fff || trackHdr - tbase < -0x8000)
    throw new Error('MDSDRV song data does not fit the signed 32 KiB window around the track table');
  itemOff.forEach((a, i) => sd.push(...be16(tbaseRel.has(i) ? a - tbase : extRel.has(i) ? a | 0x8000 : a)));
  streams.slice(nBefore).forEach((st, k) => place(st, nBefore + k));
  even();
  if (sd.length > 0xffff) throw new Error('MDSDRV sequence over 64 KiB');
  sd.splice(0, 4, 0, 0, 0, 8);       // pcm_tab-sdtop
  sd.splice(4, 4, 0, 0, ...be16(bgm));
  sd.splice(bgm, 2, ...be16(tbase - bgm));
  return { seq: Uint8Array.from([0x10, 0x01, 0x1f, 0x00, 0x00, 0x03, 0x00, 0x02, ...sd]), lossy: lossy.list(), keyOns, pcm: Uint8Array.from(pcm) };
}
