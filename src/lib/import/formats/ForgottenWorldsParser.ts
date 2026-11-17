/**
 * ForgottenWorldsParser.ts - Forgotten Worlds (.fw) Amiga game music, editable stream grid.
 *
 * Layout (third-party/nuade/players/forgottenworlds/forgottenworlds.c): "FWMP", three longs (pattern table,
 * instrument table, sample table; offsets from 0x10), then at 0x10 four words, one per voice, each the distance from
 * 0x10 to that voice's stream. A stream holds notes (byte < 0x80 + length byte), instrument/rest/call (0x84/0x86/0x88
 * + one argument byte) and end/loop/return (0x80/0x82/0x8A). Call n jumps to the stream at patterns + s16(patterns + 2n).
 *
 * Grid pattern 0 is the four voice streams, one row per byte; every called sub-pattern follows as its own grid
 * pattern (voice 1 channel). Playback is delegated to UADE.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeForgottenWorldsCell, decodeForgottenWorldsCell } from '@/engine/uade/encoders/ForgottenWorldsEncoder';

const DATA_BASE = 0x10;
const NUM_CH = 4;
const CALL = 0x88;
const MAX_PATTERNS = 256;

function u16BE(b: Uint8Array, o: number): number { return o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0; }
function s16BE(b: Uint8Array, o: number): number { const v = u16BE(b, o); return v & 0x8000 ? v - 0x10000 : v; }
function u32BE(b: Uint8Array, o: number): number { return ((u16BE(b, o) << 16) | u16BE(b, o + 2)) >>> 0; }

export function isForgottenWorldsFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return b.length >= DATA_BASE + 2 * NUM_CH && u32BE(b, 0) === 0x46574d50;
}

interface Stream { start: number; len: number; argAt: Set<number> }

/** Bytes of one stream: through its end/loop/return; a command's argument byte (and a note's length) is a row. */
function readStream(b: Uint8Array, start: number): Stream {
  const argAt = new Set<number>();
  let at = start;
  while (at >= 0 && at < b.length) {
    const c = b[at];
    if (c < 0x80 || c === 0x84 || c === 0x86 || c === CALL) { argAt.add(at + 1 - start); at += 2; continue; }
    at++;
    break; // 0x80 end, 0x82 loop, 0x8a return (or an unknown byte the player stalls on)
  }
  return { start, len: Math.max(0, Math.min(at, b.length) - start), argAt };
}

function streamCells(b: Uint8Array, s: Stream) {
  return Array.from({ length: s.len }, (_, i) => decodeForgottenWorldsCell(new Uint8Array([b[s.start + i]]), s.argAt.has(i) ? -1 : 0));
}

export function parseForgottenWorldsFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isForgottenWorldsFormat(buf)) throw new Error('Not a Forgotten Worlds module');
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/\.fw$/i, '') || baseName;

  const patternTable = DATA_BASE + u32BE(buf, 4);
  const voices = Array.from({ length: NUM_CH }, (_, v) => readStream(buf, DATA_BASE + u16BE(buf, DATA_BASE + 2 * v)));

  // Called sub-patterns, found transitively, one grid pattern per distinct stream start.
  const subs: Stream[] = [];
  const seen = new Set<number>();
  const queue = [...voices];
  for (let q = 0; q < queue.length && subs.length < MAX_PATTERNS; q++) {
    const s = queue[q];
    for (let i = 0; i < s.len; i++) {
      if (buf[s.start + i] !== CALL || s.argAt.has(i) || i + 1 >= s.len) continue;
      const n = (buf[s.start + i + 1] << 24) >> 24;
      const start = patternTable + s16BE(buf, patternTable + 2 * n);
      if (start < 0 || start >= buf.length || seen.has(start)) continue;
      seen.add(start);
      const sub = readStream(buf, start);
      subs.push(sub);
      queue.push(sub);
    }
  }

  const empty = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const grid: Stream[][] = [voices, ...subs.map((s) => [s, ...Array.from({ length: NUM_CH - 1 }, () => ({ start: -1, len: 0, argAt: new Set<number>() }))])];
  const maxRows = Math.max(1, ...grid.flat().map((s) => s.len));

  const patterns: Pattern[] = grid.map((row, k) => {
    const len = Math.max(1, ...row.map((s) => s.len));
    return {
      id: `pattern-${k}`,
      name: k === 0 ? 'Voices' : `Pattern ${k - 1}`,
      length: len,
      channels: row.map((s, c) => {
        const cells = streamCells(buf, s);
        return {
          id: `channel-${c}`, name: `Voice ${c + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
          instrumentId: null, color: null,
          rows: Array.from({ length: len }, (_, r) => cells[r] ?? empty),
        };
      }),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CH, originalPatternCount: grid.length, originalInstrumentCount: 0,
      },
    };
  });

  const instruments: InstrumentConfig[] = [{
    id: 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${moduleName} [Forgotten Worlds]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, k) => k),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: NUM_CH,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'forgottenWorlds',
      patternDataFileOffset: 0,
      bytesPerCell: 1,
      rowsPerPattern: maxRows,
      numChannels: NUM_CH,
      numPatterns: grid.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodeForgottenWorldsCell,
      encodeOverStored: true,
      decodeCell: (b) => decodeForgottenWorldsCell(b, 0),
      getCellFileOffset: (p, r, c) => {
        const s = grid[p]?.[c];
        return s && r >= 0 && r < s.len ? s.start + r : -1;
      },
      propagateSharedCells: true,
    } satisfies UADEPatternLayout,
  };
}
