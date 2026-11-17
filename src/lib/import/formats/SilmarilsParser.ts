/**
 * SilmarilsParser.ts — Silmarils Amiga music format (3-voice MIDI clone)
 *
 * Used in Silmarils games from "Targhan" to "Ishar I" (ECS), 1989-92.
 * 3-voice format with built-in sample depacking routine.
 *
 * Some modules use an external "main file" (Boston Bomb Club: MOK.BostonBombClub + _??? suffix).
 *
 * UADE eagleplayer.conf: Silmarils  prefixes=mok
 *
 * The grid is the music blocks' command streams (third-party/nuade/players/silmarils/sil_music.c): one pattern per
 * music block, one row per wait byte, a Note command's note byte is the editable cell. Waits, volumes, Select
 * and Tail commands stay carrier bytes.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSilmarilsCell, decodeSilmarilsCell } from '@/engine/uade/encoders/SilmarilsEncoder';

export function isSilmarilsFormat(_buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('mok.') || base.endsWith('.mok')) return true;
  }
  return false;
}

const NUM_CH = 3;
const BLOCK_HEADER = 0x10;
const MAX_BLOCKS = 4096;
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** One music block's rows: `rows[r][c]` is the file offset of voice c's note byte on row r, or -1. */
type Stream = number[][];

/** Walk one command stream (run_batch): 0xFF + command introduces, a byte below 0x80 repeats, from 0x80 a wait. */
function readStream(buf: Uint8Array, start: number, end: number): Stream | null {
  const rows: Stream = [];
  let cur = [-1, -1, -1];
  let used = false;
  const flush = () => { rows.push(cur); cur = [-1, -1, -1]; used = false; };
  let pos = start;
  let command = -1;
  let ch = 0;
  while (pos < end) {
    const byte = buf[pos++];
    if (byte >= 0x80 && byte !== 0xFF) { flush(); continue; }
    if (byte === 0xFF) {
      if (pos >= end) return null;
      const c = buf[pos++];
      command = c & 0x3F;
      ch = c >> 6;
    } else {
      pos--;
    }
    if (command === 0) { if (used) flush(); return rows.length > 0 ? rows : null; }
    if (ch >= NUM_CH) return null;
    if (command === 1) {
      if (pos + 2 > end) return null;
      if (cur[ch] >= 0) flush();
      cur[ch] = pos;
      used = true;
      pos += 2;
    } else if (command === 2) {
      pos += 1;
    } else if (command !== 3) {
      return null;
    }
  }
  return null;
}

/** The music blocks of the container (sil_container_parse): the form at +4 (0 or 6 prefix), the header, the block table. */
function musicStreams(buf: Uint8Array): Stream[] | null {
  const base = u16(buf, 4) === 0x16 ? 0 : u16(buf, 4 + 6) === 0x16 ? 6 : -1;
  if (base < 0 || buf.length < base + 0x12) return null;
  const header = base + u32(buf, base + 0xE);
  if (header + 0x12 > buf.length || u32(buf, header) !== 0x58) return null;
  const table = header + 0x58;
  const streams: Stream[] = [];
  for (let i = 0; i < MAX_BLOCKS; i++) {
    const entry = table + 4 * i;
    if (entry + 4 > buf.length) return null;
    const off = u32(buf, entry);
    if (off === 0 || off >>> 24) break;
    const block = entry + off;
    if (block + BLOCK_HEADER > buf.length) return null;
    if (u16(buf, block + 6) !== 0xFF02) continue;
    const s = readStream(buf, block + 6, Math.min(buf.length, block + u32(buf, block + 2)));
    if (s) streams.push(s);
  }
  return streams.length > 0 ? streams : null;
}

export function parseSilmarilsFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^mok\./i, '').replace(/\.mok$/i, '') || baseName;
  const streams = musicStreams(buf);
  if (!streams) throw new Error('Silmarils: no readable music block');

  const empty = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const patterns: Pattern[] = streams.map((rows, k) => ({
    id: `pattern-${k}`,
    name: `Pattern ${k}`,
    length: rows.length,
    channels: Array.from({ length: NUM_CH }, (_, c) => ({
      id: `channel-${c}`, name: `Voice ${c + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: c === 0 ? -50 : c === 1 ? 0 : 50, instrumentId: null, color: null,
      rows: rows.map((r) => (r[c] < 0 ? empty : decodeSilmarilsCell(buf.subarray(r[c], r[c] + 1)))),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CH, originalPatternCount: streams.length, originalInstrumentCount: 0,
    },
  }));

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < NUM_CH; i++) {
    instruments.push({
      id: i + 1, name: `Silmarils ${i + 1}`,
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  return {
    name: `${moduleName} [Silmarils]`,
    format: 'MOD' as TrackerFormat,
    patterns, instruments,
    songPositions: patterns.map((_, k) => k), songLength: patterns.length, restartPosition: 0,
    numChannels: NUM_CH, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer, uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'silmarils',
      patternDataFileOffset: 0,
      bytesPerCell: 1,
      rowsPerPattern: Math.max(1, ...streams.map((s) => s.length)),
      numChannels: NUM_CH,
      numPatterns: streams.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodeSilmarilsCell,
      encodeOverStored: true,
      decodeCell: decodeSilmarilsCell,
      getCellFileOffset: (p, r, c) => streams[p]?.[r]?.[c] ?? -1,
    } satisfies UADEPatternLayout,
  };
}
