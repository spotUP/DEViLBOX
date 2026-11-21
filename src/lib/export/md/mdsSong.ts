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
}

type Kind = 'fm' | 'psg' | 'noise';
const MDS_CHAN: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const KIND: Kind[] = ['fm', 'fm', 'fm', 'fm', 'fm', 'fm', 'psg', 'psg', 'psg', 'noise'];
/**
 * With voice transpose $30 the FM note equals the Furnace note value. PSG key k writes period PSG_TAB[k%12] >> (k/12)
 * (key 0 = 1710), which is the period Furnace 0.6.8.3 writes for note value k (sms.cpp, toneDivider 64), so the PSG
 * key is the note value with no offset.
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
 * a 72-tick slide), so `tpf` (sequence ticks per frame, (tempo + 1) / 128) picks the Furnace tick each frame node lands on.
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

class Lossy {
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

/** PSG envelope: `xy` nodes (x frames 1..15, y attenuation), `01` sustain + `00` end, or `02 pos` loop. */
function psgEnvelope(ins: FurnaceInstrument | undefined, version: number, lossy: Lossy): number[] {
  const m = macro(ins, MACRO_VOL, version);
  if (!m) return [0x10, 0x01, 0x00];
  const { vals, loop } = ticksOf(m, lossy, 'PSG volume');
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
function pitchEnvelope(m: FurnaceMacro, lossy: Lossy): number[] | undefined {
  if (m.mode & 1) { lossy.add('relative pitch macro'); return undefined; }
  const { vals, loop } = ticksOf(m, lossy, 'pitch');
  const nodes: Array<[number, number]> = []; // [value, ticks]
  for (let t = 0; t < vals.length; t++) {
    const last = nodes[nodes.length - 1];
    if (last && last[0] === vals[t] && last[1] < 256 && t !== loop) last[1]++; else nodes.push([vals[t], 1]);
  }
  const loopNode = loop < 0 ? nodes.length - 1 : nodes.findIndex((_, i) => nodes.slice(0, i).reduce((a, n) => a + n[1], 0) === loop);
  if (loop < 0) nodes[nodes.length - 1][1] = 256; // hold the last value
  const out: number[] = [];
  for (const [v, n] of nodes) { const w = Math.max(-0x8000, Math.min(0x7eff, v * 2)) & 0xffff; out.push(w >> 8, w & 0xff, 0, n - 1); } // a node lasts length+1 ticks (mdsdrv.68k @do_peg)
  return [...out, 0x7f, Math.max(0, loopNode)];
}

/** Macro table for a relative arpeggio: `16 tt` set transpose, `81 nn` hold nn+1 ticks, `80 nn` jump / `80 00` end. */
function arpTable(m: FurnaceMacro, lossy: Lossy): number[] | undefined {
  if (m.data.slice(0, m.length).some(arpIsFixed)) { lossy.add('fixed arpeggio macro'); return undefined; }
  const sp = Math.max(1, m.speed);
  const out: number[] = [];
  const loop = m.loop >= 0 && m.loop < m.length && m.loop !== 255 ? m.loop : -1;
  if (m.delay > 0) lossy.add('arpeggio macro delay (ignored)');
  m.data.slice(0, m.length).forEach((v) => out.push(0x16, ((v << 2) >> 2) & 0xff, 0x81, sp - 1));
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
 * frame, looping over the 64/gcd(64, x)-tick cycle; `tpf` (sequence ticks per frame) picks the Furnace tick each node lands on.
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
  if (Math.abs(rate - NTSC_HZ) > 0.5) lossy.add(`tick rate ${rate.toFixed(2)} Hz: ticks land on NTSC frames (up to 1 frame early or late)`);
  if (rate * 128 / NTSC_HZ < 1 || rate * 128 / NTSC_HZ > 256) lossy.add(`tick rate ${rate.toFixed(2)} Hz outside the driver's ${(NTSC_HZ / 128).toFixed(2)}-${(2 * NTSC_HZ).toFixed(2)} Hz range (clamped)`);
  if (Math.abs((m.tuning || 440) - 440) > 0.5) lossy.add(`tuning ${m.tuning} Hz: played at 440 Hz`);
  const cellAt = (ch: number, o: number, r: number) => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];

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
  const insCache = new Map<string, { ins: number; peg: number; mtab: number }>();
  const insRef = (kind: Kind, idx: number) => {
    const key = `${kind === 'fm' ? 'fm' : 'psg'}:${idx}`;
    let v = insCache.get(key);
    if (!v) {
      const ins = m.instruments[idx];
      const pm = macro(ins, MACRO_PITCH, m.version), am = macro(ins, MACRO_ARP, m.version);
      const peg = pm && pitchEnvelope(pm, lossy), mt = am && arpTable(am, lossy);
      if (kind === 'fm' && macro(ins, MACRO_VOL, m.version)) lossy.add('FM volume macro (ignored)');
      v = { ins: item(kind === 'fm' ? fmVoice(ins, lossy) : psgEnvelope(ins, m.version, lossy)), peg: peg ? item(peg) : -1, mtab: mt ? tbItem(mt) : -1 };
      insCache.set(key, v);
    }
    return v;
  };

  // 3. Per channel, per chunk: standalone command bytes.
  const keyOns: MdsKeyOn[] = [];
  const tracks: Array<{ ch: number; chunks: Array<{ bytes: number[]; tieStart: boolean }> }> = [];
  for (let ch = 0; ch < nCh; ch++) {
    const kind = KIND[ch];
    let trs = 0, ins = 0, vol = kind === 'fm' ? 127 : 15, pan = 0xc0, dtn = 0, noise = 3, sounding = false, any = false, tick = 0, slideEnd = 0, prevKey = -1, pegDirty = false, portaXx = 0;
    // 01xx/02xx (linear pitch): rate in 1/128 semitone per Furnace tick, poff = offset after the last tick so far. Furnace keeps the slide
    // running across notes and note offs (playback.cpp 0x01/0x02 leave inPorta false; NOTE_ON resets baseFreq, the slide goes on), so each
    // key-on restarts the envelope from 0 and only 01 00 / 02 00 / 03xx stop it, holding the reached offset until the next note.
    // The slide stops at Furnace's target (01: note 179, 02: note 0, genesis.cpp NOTE_PORTA clamps baseFreq) and targetResetsSlides
    // then clears portaSpeed (playback.cpp per-tick porta), so later notes do not slide. Furnace note = converter note + 60.
    // shortcut: limitSlides (156 / dispatch porta floor) and offsets past the driver's signed 16-bit range are clamped, lossy.
    // The driver key (note byte + transpose) must stay in 0..MAX_NOTE (mds_get_fm_pitch indexes its octave/note tables with it), so a slide
    // past that holds at the driver's end key instead of Furnace's (measured: golden_shit FM1 kick 02 c0 wrapped to 4 kHz below key 0).
    // PSG: E2 $80|v gives attenuation 15-v, added to the envelope attenuation 15-macro and clamped, the same sum as Furnace VOL_SCALE_LOG.
    const volCmd = (v: number) => [0xe2, kind === 'fm' ? 127 - v : 0x80 | Math.max(0, Math.min(15, v))];
    let prate = 0, poff = 0, pInit = false, curNv = -1, curKey = 0;
    // 04xy state: pos was `vPos` at tick `vAt` and advances by vRate per tick while vDepth > 0 (playback.cpp).
    let vDepth = 0, vRate = 0, vPos = 0, vAt = 0, vFine = 15;
    const vSync = (t: number) => { if (vDepth) vPos = (vPos + (t - vAt) * vRate) % 64; vAt = t; };
    const vibCmd = (t: number): number[] => { vSync(t); return [0xe8, extItem(vibratoEnvelope(vPos, vRate, vDepth, vFine, tpf)) + 1]; };
    // 0Axy: Furnace keeps volume in 1/256 steps and adds x*64 (or -y*64) every tick, the row's first tick included, until it clamps at
    // 0 or the channel maximum (playback.cpp per-tick volume slides); the driver gets an E2 on every tick where volume>>8 changes.
    const vmax = kind === 'fm' ? 127 : 15;
    let vol256 = vol << 8, vspeed = 0;
    const volStep = (): number[] | null => {
      if (!vspeed) return null;
      const before = vol;
      vol256 += vspeed;
      if (vol256 > vmax << 8) { vol256 = vmax << 8; if (!m.compatFlags.noVolSlideReset) vspeed = 0; }
      else if (vol256 < 0) { vol256 = m.compatFlags.legacyVolumeSlides ? (vmax << 8) + 1 : 0; if (!m.compatFlags.noVolSlideReset) vspeed = 0; }
      vol = vol256 >> 8;
      return vol !== before ? volCmd(vol) : null;
    };
    const pss = Number(m.compatFlags.pitchSlideSpeed) || 1, tpf = (tempo + 1) / 128;
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
        const lim = pLimit(), d = 2 * prate * tpf, j = Math.ceil((2 * (lim - poff)) / d) - 1;
        env = j >= 1 ? [...node(2 * poff, d, Math.min(254, j - 1), 1), ...node(2 * lim, 0, 255, 1)] : node(2 * lim, 0, 255, 0);
      }
      return [0xe8, extItem(env) + 1];
    };
    const out: Array<{ bytes: number[]; tieStart: boolean }> = [];
    for (const c of chunks) {
      // A slide still running at a chunk start keeps its envelope: E8 would restart it from the instrument's own one.
      const insCmd = (chunkStart = false) => {
        const r = insRef(kind, ins);
        const peg = (chunkStart ? sounding && (prate || poff) : prate) ? pslideCmd() : chunkStart && tick < slideEnd ? [] : [0xe8, r.peg + 1];
        return [0xe1, r.ins, ...peg, 0xeb, r.mtab + 1];
      };
      const bytes: number[] = [...insCmd(true), ...(vDepth && sounding ? vibCmd(tick) : []), ...volCmd(vol), ...(kind === 'fm' ? [0xe9, pan] : []), ...(kind === 'noise' ? [0xea, NOISE_EA[noise]] : []), ...(dtn ? [0xe6, dtn & 0xff] : [])];
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
        const nv = cell ? convertFurnaceNoteValue(cell) : -1;
        if (cell && cell.instrument >= 0) ins = cell.instrument;
        const cmds: number[] = [];
        let pChanged = false, vChanged = false;
        // EDxx runs the whole row xx ticks late; ECxx keys off xx ticks after the row runs (playback.cpp rowDelay / cut, delayBehavior 2).
        const fxv = (t: number) => cell?.effects?.find((e) => e.type === t && e.value > 0)?.value ?? 0;
        let delay = fxv(0xed), cutAt = fxv(0xec);
        if (delay >= c.ticks[i]) { lossy.add('EDxx delay not shorter than the row (played on the row)'); delay = 0; }
        cutAt = cutAt ? delay + cutAt : 0;
        if (cutAt >= c.ticks[i]) { lossy.add('ECxx cut not inside the row (ignored)'); cutAt = 0; }
        i0 = i === 0;
        for (let k = 0; k < delay; k++) addTick(volStep());
        if (cell && cell.volume >= 0) { vol = cell.volume; vol256 = vol << 8; cmds.push(...volCmd(vol)); }
        for (const e of cell?.effects ?? []) {
          if (e.type < 0 || FX_FLOW.has(e.type)) continue;
          if (e.type === 0x08 && kind === 'fm') { const l = e.value >> 4, rr = e.value & 15; pan = l && rr ? 0xc0 : l ? 0x80 : rr ? 0x40 : 0xc0; cmds.push(0xe9, pan); continue; }
          // E5xx: Furnace linear pitch offset xx-80 in 1/128 semitone (playback.cpp); MDSDRV dtn is 1/256 semitone, signed byte.
          if (e.type === 0xe5) {
            const d = (e.value - 0x80) * 2;
            if (d < -128 || d > 127) lossy.add('E5xx beyond 1/2 semitone (clamped)');
            dtn = Math.max(-128, Math.min(127, d)); cmds.push(0xe6, dtn & 0xff); continue;
          }
          if (e.type === 0x20 && kind === 'noise') {
            noise = ((e.value >> 4) & 1) << 1 | (e.value & 1);
            if (!(noise & 2)) lossy.add('noise fixed-rate mode (20xy, x=0)');
            cmds.push(0xea, NOISE_EA[noise]); continue;
          }
          if (e.type === 0x0a) { vspeed = !e.value ? 0 : e.value & 15 ? -(e.value & 15) * 64 : (e.value >> 4) * 64; continue; }
          if (e.type === 0xec || e.type === 0xed) continue;
          if (e.type === 0xe3 && !e.value) continue; // E3 00: Furnace's default vibrato direction (up and down), what vibratoEnvelope plays
          if ((e.type === 0x04 || e.type === 0xe4) && (kind === 'psg' || kind === 'fm') && m.compatFlags.linearPitch) {
            vSync(tick + delay);
            if (e.type === 0xe4) vFine = e.value; else { vDepth = e.value & 15; vRate = e.value >> 4; }
            vChanged = true; continue;
          }
          if (e.type === 0x03 && (kind === 'psg' || kind === 'fm')) { portaXx = e.value; if (prate) { prate = 0; pChanged = true; } continue; } // 03 00 only stops the porta
          if ((e.type === 0x01 || e.type === 0x02) && (kind === 'psg' || kind === 'fm') && m.compatFlags.linearPitch) {
            prate = (e.type === 0x01 ? 1 : -1) * e.value * pss; pChanged = true;
            if (m.compatFlags.limitSlides) lossy.add('01xx/02xx with limitSlides (slide range not limited)');
            if (!Number.isInteger(2 * e.value * pss * tpf)) lossy.add('01xx/02xx at a fractional sequence-tick-per-frame rate (rounded per frame)');
            continue;
          }
          lossy.add(`effect ${e.type.toString(16).padStart(2, '0').toUpperCase()}`);
        }
        const vs = volStep();
        if (vs) cmds.push(...vs);
        const isNote = nv >= 0 && nv < 253, isOff = nv >= 253;
        if (isNote) { poff = 0; curNv = nv; }
        else if (pChanged && sounding && (prate || poff)) cmds.push(...pslideCmd());
        if (!isNote && vChanged && sounding) { cmds.push(...(vDepth ? vibCmd(tick + delay) : [0xe8, insRef(kind, ins).peg + 1])); pegDirty = true; }
        if (isNote && ins !== curIns) { curIns = ins; cmds.unshift(...insCmd()); }
        if (isNote || isOff || cmds.length || i === 0) {
          if (tok.length) emit(tok.pop()!);
          if (isNote) {
            let n = kind === 'fm' ? nv : kind === 'noise' && noise & 2 ? noiseKey(m, nv, lossy) : nv;
            // Keys above the note-byte range go through track transpose (E4). shortcut: trs state is linear, not re-set at the loop point.
            if (kind === 'noise' && (n - trs < 0 || n - trs > MAX_NOTE)) { trs = n > MAX_NOTE ? n - MAX_NOTE : 0; cmds.push(0xe4, trs); }
            n -= trs;
            if (n < 0 || n > MAX_NOTE) { lossy.add(`${kind.toUpperCase()} note out of range (clamped)`); n = Math.max(0, Math.min(MAX_NOTE, n)); }
            curKey = n + trs;
            // 03xx: slur into the note (no key-off, envelope keeps running) and slide from the previous key; E7 00 turns it off again.
            const slide = (kind === 'psg' || (kind === 'fm' && sounding)) && portaXx > 0 && prevKey >= 0 && prevKey !== nv;
            if (kind === 'fm' && portaXx > 0 && sounding) cmds.push(0xe0);
            if (slide) {
              const env = portaEnvelope(prevKey, nv, portaXx, kind === 'fm', m.compatFlags.linearPitch ? portaXx * (Number(m.compatFlags.pitchSlideSpeed) || 1) : 0, (tempo + 1) / 128);
              if (kind === 'psg') cmds.push(0xe0);
              cmds.push(0xe8, slideItem(env) + 1); slideEnd = tick + Math.round((env[env.length - 1] + 1) * (tempo + 1) / 128);
            }
            else if (prate) { if (pChanged || pInit || !pegDirty) cmds.push(...pslideCmd()); }
            else if (pegDirty) cmds.push(0xe8, insRef(kind, ins).peg + 1);
            pegDirty = slide || prate !== 0; portaXx = 0;
            if (!m.compatFlags.continuousVibrato) { vPos = 0; vAt = tick + delay; }
            if (vDepth) {
              if (slide || prate || insRef(kind, ins).peg >= 0) lossy.add('04xy with a pitch slide or pitch macro (vibrato replaces it)');
              cmds.push(...vibCmd(tick + delay)); pegDirty = true;
            }
            prevKey = kind === 'psg' || kind === 'fm' ? nv : -1;
            tok.push({ cmd: 'note', n, t: 0, pre: cmds }); sounding = true; any = true;
            keyOns.push({ tick: tick + delay, ch, note: nv });
          } else if (isOff) { tok.push({ cmd: 'rest', n: 0, t: 0, pre: cmds }); sounding = false; }
          else { tok.push({ cmd: sounding ? 'tie' : 'rest', n: 0, t: 0, pre: cmds }); if (i === 0) tieStart = sounding; }
        }
        tok[tok.length - 1].t += 1;
        for (let k = delay + 1; k < c.ticks[i]; k++) addTick(volStep(), k === cutAt);
        if (prate && curNv >= 0) {
          const lim = pLimit();
          poff += prate * c.ticks[i];
          if (prate > 0 ? poff >= lim : poff <= lim) {
            if (lim !== (prate > 0 ? 119 - curNv : -(curNv + 60)) * 128) lossy.add('01xx/02xx past the driver key range (held at the end key)');
            poff = lim; if (m.compatFlags.targetResetsSlides) prate = 0;
          }
        }
        tick += c.ticks[i];
      });
      if (tok.length) emit(tok.pop()!);
      out.push({ bytes, tieStart });
    }
    if (any) tracks.push({ ch, chunks: out });
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
      if (i === loopChunk) b.push(0xfa);
      const k = key(c.bytes);
      const nextTie = t.chunks[(i + 1) % t.chunks.length]?.tieStart ?? false;
      if (c.bytes.length > 2 && (uses.get(k) ?? 0) > 1 && !c.tieStart && !nextTie && items.length < 255) {
        if (!subs.has(k)) subs.set(k, tbItem([...c.bytes, 0xff]));
        b.push(0xfe, subs.get(k)!);
      } else b.push(...c.bytes);
    });
    // shortcut: a loop chunk that starts with a tie loses its legato at the wrap; Furnace songs rarely do this.
    b.push(...(loopChunk >= 0 ? [0xfb, 0x00] : []), 0xff);
    return b;
  });
  if (items.length > 256) throw new Error(`MDSDRV song table holds 256 items; this song needs ${items.length}`);
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
  streams.push([...conduct(spanTicks(0, introEnd)), ...(loopChunk >= 0 ? [0xfa, ...conduct(spanTicks(loopChunk, chunks.length)), 0xfb, 0x00] : []), 0xff]);
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
  const tbase = sd.length;
  if (itemOff.some((a, i) => extRel.has(i) && a >= 0x8000)) throw new Error('MDSDRV extended pitch envelope beyond 32 KiB of song data');
  itemOff.forEach((a, i) => sd.push(...be16(tbaseRel.has(i) ? a - tbase : extRel.has(i) ? a | 0x8000 : a)));
  streams.forEach((st, i) => {
    const pos = sd.length - tbase;
    sd.splice(trackHdr + i * 4, 4, chanIds[i], 0, ...be16(pos));
    sd.push(...st);
  });
  even();
  if (sd.length > 0xffff) throw new Error('MDSDRV sequence over 64 KiB');
  sd.splice(0, 4, 0, 0, 0, 8);       // pcm_tab-sdtop
  sd.splice(4, 4, 0, 0, ...be16(bgm));
  sd.splice(bgm, 2, ...be16(tbase - bgm));
  return { seq: Uint8Array.from([0x10, 0x01, 0x1f, 0x00, 0x00, 0x03, 0x00, 0x02, ...sd]), lossy: lossy.list(), keyOns };
}
