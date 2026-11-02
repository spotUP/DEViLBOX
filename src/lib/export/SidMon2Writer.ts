/**
 * SidMon2Writer.ts -- build a SidMon II module from a TrackerSong with no original file (the New Song preset path).
 *
 * The inverse of SidMon2Parser's layout: header (offsets 2/3/4 and the u32 lengths at 14/26/30/34/38/50, magic at 58),
 * track data from 90 (pattern numbers, transposes, sound transposes, each ordered voice-major), 32-byte instruments,
 * the wave / arpeggio / vibrato tables (16 bytes per instrument), 64-byte sample records, the pattern pointer table, the
 * variable-length pattern commands and the sample PCM.
 *
 * A grid row becomes one command: [note, sample, effect, param] (effect rows last one row), or [note, sample, ~hold] /
 * [~hold] when no effect, where ~hold counts the empty rows the command also covers. The grid is the parser's simulation,
 * so the writer is its inverse: note = XM note - 12, the effect numbers are the parser's table read backwards.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { SidMonConfig } from '@/types/instrument';

const MAGIC = 'SIDMON II - THE MIDI VERSION';
const HEADER_SIZE = 90;
const DEFAULT_PATTERN_ROWS = 64;
const CYCLE_BYTES = 32;

/** The parser's effect table read backwards: the file effect byte and parameter a grid cell's effect stands for. */
function fileEffect(cell: TrackerCell): { effect: number; param: number } | null {
  const { effTyp, eff } = cell;
  if (effTyp === 0x00 && eff !== 0) return { effect: 0x70, param: eff };
  if (effTyp === 0x01) return { effect: 0x71, param: eff };
  if (effTyp === 0x02) return { effect: 0x72, param: eff };
  if (effTyp === 0x0A) {
    if (eff >> 4) return { effect: 0x73, param: eff >> 4 };
    if (eff & 0x0F) return { effect: 0x74, param: eff & 0x0F };
    return null;
  }
  if (effTyp === 0x0C) return { effect: 0x7C, param: Math.min(64, eff) };
  if (effTyp === 0x0F && eff > 0) return { effect: 0x7F, param: eff & 0x0F };
  return null;
}

/** One voice of one pattern as the file's command stream. */
function encodeVoice(rows: TrackerCell[], length: number, lengthEffect: boolean, skipSpeed: number | null, where: string, warnings: string[]): number[] {
  const out: number[] = [];
  const at = (r: number) => rows[r];
  const content = (r: number): { note: number; sample: number; effect: { effect: number; param: number } | null } | null => {
    const cell = at(r);
    let effect = cell ? fileEffect(cell) : null;
    if (cell && effect && cell.effTyp === 0x0F && r === 0 && skipSpeed !== null && effect.param === skipSpeed) effect = null;
    if (cell && cell.effTyp !== 0 && cell.effTyp !== 0x0F && !effect && cell.effTyp !== 0x0A) warnings.push(`${where} row ${r}: effect ${cell.effTyp.toString(16)} has no SidMon II command; not written`);
    if (r === 0 && lengthEffect) {
      if (effect) warnings.push(`${where} row 0: its effect shares the row with the pattern length; the length wins`);
      effect = { effect: 0x76, param: length };
    }
    let note = 0;
    if (cell && cell.note > 0) {
      note = cell.note - 12;
      if (note < 1 || note > 72) {
        warnings.push(`${where} row ${r}: note ${cell.note} is outside the player's 72 notes; not written`);
        note = 0;
      }
    }
    if (!note && !effect) return null;
    return { note, sample: Math.min(111, Math.max(0, cell?.instrument ?? 0)), effect };
  };
  const emptyRun = (from: number, max: number): number => {
    let n = 0;
    while (from + n < length && n < max && content(from + n) === null) n++;
    return n;
  };
  let r = 0;
  while (r < length) {
    const c = content(r);
    if (!c) {
      const n = emptyRun(r, 128);
      out.push(~(n - 1) & 0xFF);
      r += n;
      continue;
    }
    if (c.note) out.push(c.note, c.sample);
    if (c.effect) {
      out.push(c.effect.effect, c.effect.param & 0xFF);
      r++;
    } else {
      const n = emptyRun(r + 1, 127);
      out.push(~n & 0xFF);
      r += 1 + n;
    }
  }
  return out;
}

function waveCycle(cfg: SidMonConfig): Uint8Array {
  const out = new Uint8Array(CYCLE_BYTES);
  let seed = 0x1234;
  for (let i = 0; i < CYCLE_BYTES; i++) {
    const p = i / CYCLE_BYTES;
    let v: number;
    if (cfg.waveform === 0) v = p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
    else if (cfg.waveform === 1) v = -1 + 2 * p;
    else if (cfg.waveform === 2) v = p < cfg.pulseWidth / 256 ? 1 : -1;
    else { seed = (seed * 25173 + 13849) & 0xFFFF; v = (seed / 32768) - 1; }
    out[i] = Math.round(v * 100) & 0xFF;
  }
  return out;
}

interface WrittenSample { name: string; pcm: Uint8Array; loop: number; repeat: number }

function sampleOf(inst: InstrumentConfig | undefined): WrittenSample {
  const cfg = inst?.sidMon;
  const name = (inst?.name ?? '').slice(0, 31);
  if (!cfg) return { name, pcm: new Uint8Array(0), loop: 0, repeat: 0 };
  if (cfg.type === 'pcm' && cfg.pcmData) {
    const even = cfg.pcmData.length + (cfg.pcmData.length & 1);
    const pcm = new Uint8Array(even);
    pcm.set(cfg.pcmData);
    return { name, pcm, loop: cfg.loopStart ?? 0, repeat: cfg.loopLength ?? 0 };
  }
  return { name, pcm: waveCycle(cfg), loop: 0, repeat: CYCLE_BYTES };
}

const u8 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** The module for `song`, built from its patterns, order and SidMon instruments. */
export function buildSidMon2File(song: TrackerSong): { data: ArrayBuffer; warnings: string[] } {
  const warnings: string[] = [];
  const order = song.songPositions.length ? song.songPositions : [0];
  const songLength = Math.min(256, order.length);
  if (order.length > 256) warnings.push('the order is longer than 256 positions; the rest is not written');

  // Instruments by id: slot i is instrument id i, gaps stay empty.
  const maxId = Math.min(111, song.instruments.reduce((m, i) => Math.max(m, i.id), 0));
  const byId = new Map<number, InstrumentConfig>(song.instruments.map((i) => [i.id, i]));
  const samples: WrittenSample[] = [];
  const instrBytes = new Uint8Array(maxId * 32);
  const waveTable = new Uint8Array(maxId * 16);
  const arpTable = new Uint8Array(maxId * 16);
  const vibTable = new Uint8Array(maxId * 16);
  for (let id = 1; id <= maxId; id++) {
    const inst = byId.get(id);
    const cfg = inst?.sidMon;
    samples.push(sampleOf(inst));
    waveTable[(id - 1) * 16] = id - 1;
    const o = (id - 1) * 32;
    const arp = cfg?.arpTable ?? [];
    for (let a = 0; a < 8; a++) arpTable[(id - 1) * 16 + a] = (arp[a] ?? 0) & 0xFF;
    const rec = [
      id - 1, 0, 0, 0,
      id - 1, arp.some((x) => x !== 0) ? 7 : 0, u8(cfg?.arpSpeed ?? 0), 0,
      id - 1, u8(cfg?.vibDepth ?? 0), u8(cfg?.vibSpeed ?? 0), u8(cfg?.vibDelay ?? 0),
      0, 0, 0, 0,
      255, (15 - (cfg?.attack ?? 0)) * 16,
      u8((cfg?.sustain ?? 0) * 17), (15 - (cfg?.decay ?? 0)) * 16,
      64, 0, (15 - (cfg?.release ?? 0)) * 16,
    ];
    instrBytes.set(rec.map(u8), o);
  }

  // Voice streams, de-duplicated into file patterns.
  const streams: number[][] = [];
  const streamIndex = new Map<string, number>();
  const stepPattern: number[][] = [[], [], [], []];
  for (let p = 0; p < songLength; p++) {
    const pat = song.patterns[order[p]];
    const length = pat ? Math.min(256, pat.length) : DEFAULT_PATTERN_ROWS;
    const needsLength = length !== DEFAULT_PATTERN_ROWS;
    const free = pat ? [0, 1, 2, 3].find((ch) => { const c = pat.channels[ch]?.rows[0]; return !c || (!fileEffect(c) && !(c.effTyp === 0x0F)); }) ?? -1 : 0;
    if (needsLength && free < 0) warnings.push(`position ${p}: every voice has an effect on row 0; the pattern length ${length} is not written`);
    for (let ch = 0; ch < 4; ch++) {
      const rows = pat?.channels[ch]?.rows ?? [];
      const bytes = encodeVoice(rows, length, needsLength && ch === free, p === 0 && ch === 0 ? (song.initialSpeed ?? null) : null, `position ${p} voice ${ch + 1}`, warnings);
      const key = bytes.join(',');
      let idx = streamIndex.get(key);
      if (idx === undefined) {
        idx = streams.length;
        streams.push(bytes);
        streamIndex.set(key, idx);
      }
      stepPattern[ch].push(idx);
    }
  }
  if (streams.length > 256) warnings.push('more than 256 distinct voice patterns; the rest are not written');

  const trackLen = songLength * 4;
  const patternBytes: number[] = [];
  const pointers: number[] = [];
  for (const s of streams) { pointers.push(patternBytes.length); patternBytes.push(...s); }
  const patternPad = patternBytes.length & 1;
  const sampleBytes = samples.reduce((n, s) => n + s.pcm.length, 0);

  const total = HEADER_SIZE + trackLen * 3 + instrBytes.length + waveTable.length + arpTable.length + vibTable.length
    + samples.length * 64 + pointers.length * 2 + patternBytes.length + patternPad + sampleBytes;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint8(2, songLength - 1);
  v.setUint8(3, Math.max(1, Math.min(255, song.initialSpeed || 6)));
  v.setUint16(4, samples.length << 6);
  v.setUint32(14, trackLen);
  v.setUint32(26, instrBytes.length);
  v.setUint32(30, waveTable.length);
  v.setUint32(34, arpTable.length);
  v.setUint32(38, vibTable.length);
  v.setUint32(50, patternBytes.length);
  v.setUint32(54, sampleBytes);
  for (let i = 0; i < MAGIC.length; i++) out[58 + i] = MAGIC.charCodeAt(i);

  let pos = HEADER_SIZE;
  for (let ch = 0; ch < 4; ch++) for (let p = 0; p < songLength; p++) out[pos++] = stepPattern[ch][p] & 0xFF;
  pos += trackLen * 2; // transposes and sound transposes: zero
  for (const t of [instrBytes, waveTable, arpTable, vibTable]) { out.set(t, pos); pos += t.length; }
  for (const s of samples) {
    v.setUint16(pos + 4, s.pcm.length >> 1);
    v.setUint16(pos + 6, s.loop >> 1);
    v.setUint16(pos + 8, s.repeat >> 1);
    for (let i = 0; i < s.name.length; i++) out[pos + 32 + i] = s.name.charCodeAt(i) & 0x7F;
    pos += 64;
  }
  for (const p of pointers) { v.setUint16(pos, p); pos += 2; }
  out.set(patternBytes, pos);
  pos += patternBytes.length + patternPad;
  for (const s of samples) { out.set(s.pcm, pos); pos += s.pcm.length; }
  return { data: out.buffer as ArrayBuffer, warnings };
}
