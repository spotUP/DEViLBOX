/**
 * Furnace AY song -> ProTracker 3 module bytes (Vortex Tracker II format) for the standard PT3 player
 * (public/zx/pt3player.asm, S.V.Bulba's universal PT2/PT3 player) on a ZX Spectrum 128. Replaces the register-stream
 * capture route (zxAyStream) once tools/zx-pt3-check.ts passes. Layout follows the player's INIT/PTDECOD:
 * header (201 bytes), position list, pattern table, samples, ornaments, then the three channel streams per pattern.
 *
 * Mapping: Furnace instrument -> PT3 sample (volume, waveform and noise macros, one tick per macro step) plus a PT3
 * ornament (arpeggio macro); order -> position; pattern rows -> one skip-counted row per PT3 line. Hardware envelope,
 * pitch macros and slide effects are not converted and are reported lossy.
 */

import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import type { FurnacePatternCell } from '../../import/formats/furnace/FurnacePatternParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import { tapBlock, header, codeBlocks, basicLoader } from './zxTap';

export interface Pt3Song { module: Uint8Array; lossy: string[]; channelsWithNotes: boolean[]; frames: number }

class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
}

const AY8910 = 0x80, AY8930 = 0x9a; // Furnace file system ids (FurnaceSongParser.ts)
const CHANNELS = 3;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_NOISE = 2, MACRO_WAVE = 3;
const MAX_SAMPLES = 31, MAX_ORNAMENTS = 15, MAX_TICKS = 64;
/** Furnace flat note C-0 = 0; PT3 note 0 = C-1. */
const NOTE_OFFSET = 12;
const PT3_TONE_TABLE = 2; // ASM table, tuned for the Spectrum AY clock (1.7734 MHz)
const FRAME_HZ = 50;
const MODULE_BASE = 0xC000, MODULE_CAP = 0x4000;

/** Macro value per tick; the last value holds, or the loop restarts. */
function expand(mac: FurnaceMacro | undefined, ticks: number, fallback: number): number[] {
  if (!mac) return new Array<number>(ticks).fill(fallback);
  const raw: number[] = [];
  const speed = Math.max(1, mac.speed || 1);
  for (let i = 0; i < Math.max(0, mac.delay || 0); i++) raw.push(mac.data[0]);
  for (const v of mac.data.slice(0, mac.length)) for (let i = 0; i < speed; i++) raw.push(v);
  const loop = mac.loop >= 0 && mac.loop < mac.length ? (mac.delay || 0) + mac.loop * speed : -1;
  return Array.from({ length: ticks }, (_, t) => (t < raw.length ? raw[t] : loop >= 0 ? raw[loop + ((t - raw.length) % (raw.length - loop))] : raw[raw.length - 1]));
}

function sampleBytes(macros: FurnaceMacro[], lossy: Lossy): number[] {
  const pick = (code: number): FurnaceMacro | undefined => macros.find((x) => x.code === code && x.length > 0);
  for (const mac of macros) if (mac.length > 0 && ![MACRO_VOL, MACRO_ARP, MACRO_NOISE, MACRO_WAVE].includes(mac.code)) lossy.add(`macro code ${mac.code} (hardware envelope, pitch)`);
  const vol = pick(MACRO_VOL), wave = pick(MACRO_WAVE), noise = pick(MACRO_NOISE);
  const span = (m: FurnaceMacro | undefined): number => (m ? (m.delay || 0) + m.length * Math.max(1, m.speed || 1) : 1);
  const longest = [vol, wave, noise].reduce((a, m) => (span(m) > span(a) ? m : a), undefined as FurnaceMacro | undefined);
  let ticks = span(longest);
  if (ticks > MAX_TICKS) { lossy.add(`macro longer than ${MAX_TICKS} ticks (cut)`); ticks = MAX_TICKS; }
  const loop = longest && longest.loop >= 0 && longest.loop < longest.length ? Math.min(ticks - 1, (longest.delay || 0) + longest.loop * Math.max(1, longest.speed || 1)) : ticks - 1;
  const v = expand(vol, ticks, 15), w = expand(wave, ticks, 1), n = expand(noise, ticks, 0);
  const out: number[] = [loop, ticks];
  for (let t = 0; t < ticks; t++) {
    const toneOn = (w[t] & 1) !== 0 || (w[t] & 3) === 0 ? ((w[t] & 3) !== 0 ? (w[t] & 1) !== 0 : true) : false;
    const noiseOn = (w[t] & 2) !== 0;
    const b0 = noiseOn ? 0x01 | ((n[t] & 31) << 1) : 0x01;
    const b1 = (Math.max(0, Math.min(15, v[t])) & 15) | (toneOn ? 0 : 0x10) | (noiseOn ? 0 : 0x80);
    out.push(b0, b1, 0, 0);
  }
  return out;
}

function ornamentBytes(mac: FurnaceMacro, lossy: Lossy): number[] {
  if (mac.data.some((x) => (x & 0x40000000) !== 0)) lossy.add('arp macro fixed-note steps (played relative)');
  let ticks = Math.min(MAX_TICKS, Math.max(1, (mac.delay || 0) + mac.length * Math.max(1, mac.speed || 1)));
  if (ticks >= MAX_TICKS) lossy.add(`arp macro longer than ${MAX_TICKS} ticks (cut)`);
  const loop = mac.loop >= 0 && mac.loop < mac.length ? Math.min(ticks - 1, (mac.delay || 0) + mac.loop * Math.max(1, mac.speed || 1)) : ticks - 1;
  ticks = Math.max(1, ticks);
  return [loop, ticks, ...expand(mac, ticks, 0).map((x) => Math.max(-128, Math.min(127, (x << 1) >> 1)) & 0xff)];
}

export function furnaceToPt3(m: FurnaceModule, subsong = 0, title = '', author = ''): Pt3Song {
  const lossy = new Lossy();
  const s = m.subsongs[subsong];
  if (!s) throw new Error(`subsong ${subsong} missing`);
  if (m.systems[0] !== AY8910 && m.systems[0] !== AY8930) throw new Error(`first chip is system ${m.systems[0]}, not an AY`);
  if (m.systems[0] === AY8930) lossy.add('AY8930 enhanced mode (played as AY-3-8910)');
  for (const sys of m.systems.slice(1)) lossy.add(`second chip system ${sys} (channels dropped; one AY only)`);
  if (m.subsongs.length > 1) lossy.add('other subsongs (only one exported)');
  if (s.speed2 !== s.speed1) lossy.add(`speed 2 (${s.speed2}) and groove: played at speed 1 (${s.speed1})`);
  if (s.hz !== FRAME_HZ) lossy.add(`tick rate ${s.hz} Hz (PT3 player runs at ${FRAME_HZ} Hz; speeds rescaled)`);
  const toDelay = (spd: number): number => Math.max(1, Math.min(255, Math.round((spd * FRAME_HZ) / (s.hz > 0 ? s.hz : FRAME_HZ))));
  const cellAt = (ch: number, o: number, r: number): FurnacePatternCell | undefined => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];

  const orderLen: number[] = [];
  let loopOrder = 0, endOrder = s.ordersLen;
  for (let o = 0; o < endOrder; o++) {
    let len = s.patLen;
    for (let r = 0; r < s.patLen && len === s.patLen; r++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        for (const e of cellAt(ch, o, r)?.effects ?? []) {
          if (e.type === 0x0d) len = r + 1;
          if (e.type === 0x0b) { len = r + 1; if (e.value <= o) { loopOrder = e.value; endOrder = o + 1; } }
        }
      }
    }
    orderLen.push(len);
  }

  // Samples and ornaments by first use.
  const samples: number[][] = [], ornaments: number[][] = [[0, 1, 0]];
  const insSample = new Map<number, { sample: number; orn: number }>();
  const instrument = (i: number): { sample: number; orn: number } => {
    const hit = insSample.get(i);
    if (hit) return hit;
    const macros = m.instruments[i]?.macros ?? [];
    let sample = 1, orn = 0;
    if (samples.length >= MAX_SAMPLES) lossy.add(`instruments past ${MAX_SAMPLES} (sample ${MAX_SAMPLES} reused)`);
    else { samples.push(sampleBytes(macros, lossy)); sample = samples.length; }
    const arp = macros.find((x) => x.code === MACRO_ARP && x.length > 0);
    if (arp) {
      if (ornaments.length > MAX_ORNAMENTS) lossy.add(`arpeggio macros past ${MAX_ORNAMENTS} (ornament dropped)`);
      else { ornaments.push(ornamentBytes(arp, lossy)); orn = ornaments.length - 1; }
    }
    const e = { sample, orn };
    insSample.set(i, e);
    return e;
  };

  // Channel streams per order: one entry per PT3 line; skip counts pack empty rows after an event.
  const channelsWithNotes = [false, false, false];
  let speed = s.speed1, curDelay = toDelay(s.speed1), frames = 0;
  const patternBytes: number[][][] = []; // [order][channel]
  for (let o = 0; o < endOrder; o++) {
    const rows: Array<{ ops: number[]; note: number; args: number[] }[]> = [[], [], []];
    let lastRowSpeed = speed;
    for (let r = 0; r < orderLen[o]; r++) {
      let newSpeed = speed;
      for (let ch = 0; ch < CHANNELS; ch++) for (const e of cellAt(ch, o, r)?.effects ?? []) if ((e.type === 0x09 || e.type === 0x0f) && e.value > 0) newSpeed = e.value;
      if (newSpeed !== lastRowSpeed || (o === 0 && r === 0 && false)) { speed = newSpeed; lastRowSpeed = newSpeed; }
      frames += toDelay(speed);
      for (let ch = 0; ch < CHANNELS; ch++) {
        const cell = cellAt(ch, o, r);
        const ops: number[] = [], args: number[] = [];
        let note = 0xd0;
        if (cell) {
          if (cell.instrument >= 0) { const ins = instrument(cell.instrument); ops.push(0xf0 | ins.orn, ins.sample * 2); }
          if (cell.volume >= 0) ops.push(cell.volume === 0 ? 0xc0 : 0xc0 | Math.min(15, cell.volume));
          const nv = convertFurnaceNoteValue(cell);
          if (nv === 253 || nv === 254 || nv === 255) note = 0xc0;
          else if (nv >= 0) {
            channelsWithNotes[ch] = true;
            let n = nv - NOTE_OFFSET;
            if (n < 0 || n > 95) { lossy.add('note outside PT3 range C-1..B-8 (clamped)'); n = Math.max(0, Math.min(95, n)); }
            note = 0x50 + n;
            if (cell.instrument < 0 && !rows[ch].some((x) => x.ops.some((p) => p >= 0xf0))) ops.push(0xf0, instrument(0).sample * 2);
          }
          for (const e of cell.effects) {
            if (e.type < 0 || e.type === 0x09 || e.type === 0x0f || e.type === 0x0b || e.type === 0x0d) continue;
            lossy.add(`effect ${e.type.toString(16).toUpperCase().padStart(2, '0')}`);
          }
        }
        if (ch === 0 && newSpeed !== curDelay && toDelay(newSpeed) !== curDelay) { curDelay = toDelay(newSpeed); ops.push(0x09); args.push(curDelay); }
        rows[ch].push({ ops, note, args });
      }
    }
    patternBytes.push(rows.map((chRows) => {
      const out: number[] = [];
      let skip = -1;
      for (let i = 0; i < chRows.length;) {
        let j = i + 1;
        while (j < chRows.length && chRows[j].ops.length === 0 && chRows[j].note === 0xd0) j++;
        const want = j - i;
        if (want !== skip) { out.push(0xb1, want); skip = want; }
        out.push(...chRows[i].ops, chRows[i].note, ...chRows[i].args);
        i = j;
      }
      out.push(0);
      return out;
    }));
  }

  // Module layout.
  const patKey = new Map<string, number>();
  const patList: number[][][] = [];
  const positions: number[] = [];
  for (const p of patternBytes) {
    const k = p.map((c) => c.join(',')).join('|');
    if (!patKey.has(k)) { patKey.set(k, patList.length); patList.push(p); }
    positions.push(patKey.get(k)! * 3);
  }
  const posAt = 201, patTab = posAt + positions.length + 1;
  const blobs: number[][] = [...samples, ...ornaments];
  const body: number[] = [];
  const blobPtr: number[] = [];
  let at = patTab + patList.length * 6;
  for (const b of blobs) { blobPtr.push(at); body.push(...b); at += b.length; }
  const patPtr: number[][] = patList.map((p) => p.map((c) => { const a = at; body.push(...c); at += c.length; return a; }));
  const mod = new Uint8Array(at);
  const put = (o: number, text: string, len: number): void => { for (let i = 0; i < len; i++) mod[o + i] = text.charCodeAt(i) || 0x20; };
  put(0, 'ProTracker 3.6 compilation of ', 30);
  put(30, title.replace(/[^\x20-\x7E]/g, '?'), 32);
  put(62, ' by ', 4);
  put(66, author.replace(/[^\x20-\x7E]/g, '?'), 32);
  mod[99] = PT3_TONE_TABLE; mod[100] = toDelay(s.speed1); mod[101] = positions.length + 1;
  mod[102] = Math.min(loopOrder, positions.length - 1);
  const w = (o: number, v: number): void => { mod[o] = v & 0xff; mod[o + 1] = v >> 8; };
  w(103, patTab);
  const nS = samples.length;
  for (let i = 0; i < 32; i++) w(105 + i * 2, i >= 1 && i <= nS ? blobPtr[i - 1] : blobPtr[0] ?? posAt);
  for (let i = 0; i < 16; i++) w(169 + i * 2, i < ornaments.length ? blobPtr[nS + i] : blobPtr[nS]);
  positions.forEach((p, i) => { mod[posAt + i] = p; });
  mod[posAt + positions.length] = 0xff;
  patPtr.forEach((p, i) => p.forEach((a, c) => w(patTab + i * 6 + c * 2, a)));
  mod.set(body, patTab + patList.length * 6);
  if (mod.length > MODULE_CAP) throw new Error(`The PT3 module is ${mod.length} bytes; one 16 KB bank holds ${MODULE_CAP}. Shorten the song.`);
  if (!channelsWithNotes.some(Boolean)) lossy.add('no notes in the first three channels');
  return { module: mod, lossy: lossy.list(), channelsWithNotes, frames };
}

export interface Pt3Player { bytes: Uint8Array; loadAddress: number; entry: number; dataAddress: number; bankOffset: number }

/** BASIC loader, player code block at 32768, the module in bank 0 at 49152 (CLEAR 32767; LOAD ""CODE; OUT 32765; RANDOMIZE USR). */
export function buildZxPt3Tap(module: Uint8Array, player: Pt3Player, title = 'devilbox'): Uint8Array {
  const code = Uint8Array.from(player.bytes);
  code[player.bankOffset] = 0x10;
  const name = title.replace(/[^\x20-\x7E]/g, '?').slice(0, 10);
  const loader = basicLoader([0], player);
  const parts = [
    tapBlock(0x00, header(0, name, loader.length, 10, loader.length)), tapBlock(0xFF, loader),
    ...codeBlocks('player', player.loadAddress, code),
    ...codeBlocks('song', player.dataAddress, module),
  ];
  const tap = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { tap.set(p, o); o += p.length; }
  return tap;
}

export { MODULE_BASE };
