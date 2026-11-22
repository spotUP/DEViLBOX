/**
 * KrisHatlelidGrid.ts - the editable grid of a Kris Hatlelid song file (an Amiga hunk executable whose data hunk holds
 * the song). Grammar: third-party/nuade/players/krishatlelid (kh_module.c, krishatlelid.c). The hunks are loaded at
 * 0x10000 and relocated; the song table address is the operand of the stub `lea table,a0` at code+0x1A (embedded
 * drivers and the short stub have no song table here: no grid). Subsong 0: song record u32 at table; voice i's track
 * list is u32(song + 4i); a list entry is 6 bytes (stream address u32, transposition s16). A stream is pairs of bytes:
 * first < 0xD9 is a note (pitch byte, bit 7 = tie; duration byte), 0xD9 next list entry, 0xDA stop, 0xDB start over,
 * 0xDC x instrument x, 0xDD..0xE0 tempo / volume / hold. A note plays pitch + transposition of its list entry.
 * Each stream is a file block whose `blockRows` carry its bytes; `noteBytes` name the pitch byte of each grid note.
 * shortcut: the duration byte indexes a table in the external driver file (songplay), which the importer does not
 * get, so each note takes one row and voices do not share a time axis; the pitch is shown as pitch + transposition
 * (a semitone index), not as the period the driver derives from the instrument. Only subsong 0 and driver versions
 * with the song-table stub are read; the compact-driver variants differ in note flags and are unverified.
 */
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { krisHatlelidEncoder } from '@/engine/uade/encoders/KrisHatlelidEncoder';

const NUM_CHANNELS = 4;
const MAX_ROWS = 4096;
const MAX_ENTRIES = 512;
const LOAD_BASE = 0x10000;
const HUNKS = 3;
const STUB_OPERAND = 0x1a;
const NOTE_LIMIT = 0xd9;
const NEXT = 0xd9, STOP = 0xda, START_OVER = 0xdb, INSTRUMENT = 0xdc;

const u32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : -1);

interface Image { mem: Uint8Array; base: number[]; fileBody: number[]; bodyBytes: number[] }

/** The hunks of the file loaded and relocated like kh_module.c parse_executable, or null. */
function loadImage(b: Uint8Array): Image | null {
  if (u32(b, 0) !== 0x3f3 || u32(b, 4) !== 0 || u32(b, 8) !== HUNKS || u32(b, 12) !== 0 || u32(b, 16) !== HUNKS - 1) return null;
  const base: number[] = [];
  let total = 0;
  for (let i = 0; i < HUNKS; i++) {
    base.push(LOAD_BASE + total);
    total += (u32(b, 20 + i * 4) & 0x3fffffff) * 4;
  }
  if (total <= 0 || total > 0x1000000) return null;
  const mem = new Uint8Array(total);
  const fileBody: number[] = [];
  const bodyBytes: number[] = [];
  let at = 32;
  for (let h = 0; h < HUNKS; h++) {
    const type = u32(b, at);
    const bytes = (u32(b, at + 4) & 0x3fffffff) * 4;
    at += 8;
    if (type !== 0x3e9 && type !== 0x3ea && type !== 0x3eb) return null;
    fileBody.push(at);
    bodyBytes.push(bytes);
    if (type !== 0x3eb) {
      if (at + bytes > b.length) return null;
      mem.set(b.subarray(at, at + bytes), base[h] - LOAD_BASE);
      at += bytes;
    }
    for (;;) {
      const block = u32(b, at);
      at += 4;
      if (block === 0x3f2) break;
      if (block === 0x3ec) {
        for (;;) {
          const count = u32(b, at);
          at += 4;
          if (count === 0) break;
          const target = u32(b, at);
          at += 4;
          if (target >= HUNKS) return null;
          for (let i = 0; i < count; i++, at += 4) {
            const o = base[h] - LOAD_BASE + u32(b, at);
            if (o < 0 || o + 4 > mem.length) return null;
            const v = (u32(mem, o) + base[target]) >>> 0;
            mem[o] = v >>> 24; mem[o + 1] = (v >>> 16) & 255; mem[o + 2] = (v >>> 8) & 255; mem[o + 3] = v & 255;
          }
        }
      } else if (block === 0x3f0) {
        for (let n = u32(b, at); n !== 0 && n >= 0; n = u32(b, at)) at += 4 + (n & 0x3fffffff) * 4 + 4;
        at += 4;
      } else if (block === 0x3f1) at += 4 + u32(b, at) * 4;
      else return null;
    }
  }
  return { mem, base, fileBody, bodyBytes };
}

/** File offset of a memory address, or -1 (outside every hunk body). */
function fileOffset(img: Image, addr: number): number {
  for (let h = 0; h < HUNKS; h++) {
    if (addr >= img.base[h] && addr < img.base[h] + img.bodyBytes[h]) return img.fileBody[h] + addr - img.base[h];
  }
  return -1;
}

const m32 = (img: Image, addr: number): number => u32(img.mem, addr - LOAD_BASE);
const m16s = (img: Image, addr: number): number => ((img.mem[addr - LOAD_BASE] << 8 | img.mem[addr - LOAD_BASE + 1]) << 16) >> 16;

interface KhNote { at: number; pitch: number; inst: number }
interface KhStream { start: number; size: number }

function walkVoice(img: Image, list: number): { notes: KhNote[]; streams: KhStream[] } | null {
  const notes: KhNote[] = [];
  const streams: KhStream[] = [];
  let pos = 0;
  let inst = -1;
  for (let e = 0; e < MAX_ENTRIES; e++) {
    const entry = list + pos;
    const stream = m32(img, entry);
    const transpose = m16s(img, entry + 4);
    if (fileOffset(img, stream) < 0) return null;
    let end = -1;
    for (let p = stream; p - stream < 0x10000; p += 2) {
      const f = img.mem[p - LOAD_BASE];
      const s = img.mem[p - LOAD_BASE + 1];
      if (f < NOTE_LIMIT) {
        notes.push({ at: fileOffset(img, p), pitch: (f & 0x7f) + transpose, inst });
        continue;
      }
      if (f === INSTRUMENT) inst = s;
      if (f === NEXT || f === STOP || f === START_OVER) { end = p + 2; if (f === NEXT) pos += 6; break; }
      if (f > 0xe0) return null;
    }
    if (end < 0 || fileOffset(img, end - 1) < 0) return null;
    streams.push({ start: stream, size: end - stream });
    if (img.mem[end - 2 - LOAD_BASE] !== NEXT) return { notes, streams };
  }
  return null;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function carrierRows(b: Uint8Array, start: number, size: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let p = start; p < start + size;) {
    const n = Math.min(3, start + size - p);
    rows.push({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
    } as TrackerCell);
    p += n;
  }
  return rows;
}

export interface KhGrid { pattern: Pattern; layout: UADEVariablePatternLayout }

/** The grid and layout of subsong 0 of a song file with the song-table stub, or null. */
export function buildKrisHatlelidGrid(buf: Uint8Array): KhGrid | null {
  const img = loadImage(buf);
  if (!img) return null;
  const table = m32(img, img.base[0] + STUB_OPERAND);
  const song = fileOffset(img, table) < 0 ? -1 : m32(img, table);
  if (song < 0 || fileOffset(img, song + 16) < 0) return null;
  const voices: KhNote[][] = [];
  const blocks = new Map<number, KhStream>();
  for (let v = 0; v < NUM_CHANNELS; v++) {
    const list = m32(img, song + 4 * v);
    if (fileOffset(img, list) < 0) return null;
    const w = walkVoice(img, list);
    if (!w) return null;
    voices.push(w.notes);
    w.streams.forEach((s) => blocks.set(s.start, s));
  }
  const sorted = [...blocks.values()].sort((a, c) => a.start - c.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i - 1].start + sorted[i - 1].size > sorted[i].start) return null;
  const files = sorted.map((s) => ({ start: fileOffset(img, s.start), size: s.size }));
  const rowCount = Math.min(MAX_ROWS, Math.max(1, ...voices.map((n) => n.length)));
  const pattern: Pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: rowCount,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: rowCount }, emptyCell),
    })),
  };
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const written = new Set<number>();
  voices.forEach((notes, channel) => {
    notes.slice(0, rowCount).forEach((n, row) => {
      const note = n.pitch + 1;
      if (note < 1 || note > 96 || written.has(n.at)) return;
      written.add(n.at);
      const cell = pattern.channels[channel].rows[row];
      cell.note = note;
      if (n.inst >= 0) cell.instrument = n.inst + 1;
      noteBytes.push({ pattern: 0, channel, row, offset: n.at, note });
    });
  });
  const layout: UADEVariablePatternLayout = {
    formatId: 'krisHatlelid', numChannels: NUM_CHANNELS, numFilePatterns: files.length, rowsPerPattern: rowCount,
    moduleSize: buf.length, encoder: krisHatlelidEncoder,
    filePatternAddrs: files.map((x) => x.start), filePatternSizes: files.map((x) => x.size),
    trackMap: [Array.from({ length: NUM_CHANNELS }, () => -1)],
    blockRows: files.map((x) => carrierRows(buf, x.start, x.size)),
    noteBytes,
  };
  return { pattern, layout };
}
