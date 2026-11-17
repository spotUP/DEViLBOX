/**
 * SynthPackParser.ts — SynthPack format detection and stub parser
 *
 * Detection (from eagleplayer.conf: SynthPack  prefixes=osp):
 *   Magic: "OBISYNTHPACK" (12 bytes) at offset 0.
 *   Files are prefixed: osp.songname
 *
 * Minimum file size: 12 bytes (magic string length).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeSynthPackCell, encodeSynthPackCell } from '@/engine/uade/encoders/SynthPackEncoder';

const MAGIC = 'OBISYNTHPACK';
const MIN_FILE_SIZE = MAGIC.length;

/**
 * Detect SynthPack format.
 * Primary check: first 12 bytes == "OBISYNTHPACK".
 * Secondary check: prefix osp.* (case-insensitive) for files without the magic.
 */
export function isSynthPackFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Magic check
  let match = true;
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC.charCodeAt(i)) { match = false; break; }
  }
  if (match) return true;

  // Prefix fallback
  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  return base.startsWith('osp.');
}

const NUM_CH = 4;
const POSITIONS_AT = 0x0c;
const LINES_AT = 0x10c;
const NOTES_AT = 0x50c;
const EVENT = 6;
const END_CONTROLS = new Set([0xfc, 0xfe, 0xff]);

/**
 * Walk positions -> pattern line -> per-column note list (third-party/nuade/players/synthpack/sp_longs.c). One grid
 * pattern per position; the event whose row byte equals the grid row is that cell's file place, other rows have none.
 * Lists shared by several positions or columns map to the same bytes, so an edit reaches every use. Longs layout only
 * (u16 0x0100 at 0x50c); the Words layout is not walked.
 */
function walkSong(buf: Uint8Array): { rows: number; at: number[][] }[] {
  const u16 = (o: number) => (o + 1 < buf.length ? (buf[o] << 8) | buf[o + 1] : 0);
  const out: { rows: number; at: number[][] }[] = [];
  for (let p = 0; p < 64; p++) {
    const o = POSITIONS_AT + 4 * p;
    const rows = buf[o];
    if (!rows) break;
    const line = LINES_AT + 16 * buf[o + 1];
    const at: number[][] = Array.from({ length: rows }, () => [-1, -1, -1, -1]);
    for (let c = 0; c < NUM_CH; c++) {
      if (!(buf[o + 3] & (1 << c))) continue;
      const list = NOTES_AT + u16(NOTES_AT + 2 * buf[line + 4 * c]);
      for (let e = list; e + EVENT <= buf.length; e += EVENT) {
        if (buf[e] === 0xff && buf[e + 1] === 0xff && buf[e + 2] === 0xff && buf[e + 3] === 0xff) break;
        const r = buf[e + 4];
        if (r < rows && at[r][c] < 0) at[r][c] = e;
      }
    }
    out.push({ rows, at });
    if (END_CONTROLS.has(buf[o + 2])) break;
  }
  return out;
}

export function parseSynthPackFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSynthPackFormat(buf, filename)) throw new Error('Not a SynthPack module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^osp\./i, '') || baseName;
  const longs = buf.length > NOTES_AT + 2 && buf[NOTES_AT] === 0x01 && buf[NOTES_AT + 1] === 0x00;
  const song = longs ? walkSong(buf) : [];

  const instruments: InstrumentConfig[] = [{
    id: 1, name: '', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];
  const empty = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const shown = song.length > 0 ? song : [{ rows: 64, at: Array.from({ length: 64 }, () => [-1, -1, -1, -1]) }];

  const patterns = shown.map((pos, k) => ({
    id: `pattern-${k}`, name: `Pattern ${k}`, length: pos.rows,
    channels: Array.from({ length: NUM_CH }, (_, c) => ({
      id: `channel-${c}`, name: `Channel ${c + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: c === 0 || c === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: pos.at.map((r) => (r[c] < 0 ? empty : decodeSynthPackCell(buf.subarray(r[c], r[c] + EVENT)))),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CH, originalPatternCount: shown.length, originalInstrumentCount: 0,
    },
  }));

  return {
    name: `${moduleName} [SynthPack]`, format: 'MOD' as TrackerFormat,
    patterns, instruments, songPositions: patterns.map((_, k) => k),
    songLength: patterns.length, restartPosition: 0, numChannels: NUM_CH,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'synthPack',
      patternDataFileOffset: 0,
      bytesPerCell: EVENT,
      rowsPerPattern: 64,
      numChannels: NUM_CH,
      numPatterns: shown.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodeSynthPackCell,
      encodeOverStored: true,
      decodeCell: decodeSynthPackCell,
      getCellFileOffset: (p, r, c) => shown[p]?.at[r]?.[c] ?? -1,
    } satisfies UADEPatternLayout,
  };
}
