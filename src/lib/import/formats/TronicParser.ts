/**
 * TronicParser.ts — Tronic / dp / tro Amiga format detector
 *
 * Tronic is an Amiga tracker by Stefan Hartmann (the same author as PumaTracker).
 * It shares structural DNA with PumaTracker but with different file header layout.
 * Files use the extensions .trc, .dp, and .tro; UADE supports all three under
 * the "Tronic" eagleplayer entry (prefixes=dp,trc,tro,tronic).
 *
 * No OpenMPT loader exists for this format. UADE provides authentic Amiga playback
 * via the original 68k player binary from Stefan Hartmann.
 *
 * Layout (nuade third-party/nuade/players/tronic/tronic_module.c):
 *   16-byte header: 4 voices x (restart word, length word)
 *   4 sequences of `length` bytes: (pattern byte, transpose byte) per step
 *   wave-table block (size word + data), instrument-table block (words 0x0058, 0x00B0, ...),
 *   instrument records (last table offset + 0x58 bytes), waveform-index block, waveform block
 *   pattern-bytes long, then patterns of 16 rows x 4 bytes (cell: TronicEncoder.ts), sample table, samples
 *
 * The grid has one pattern per distinct song step (the 4 voices' pattern + transpose); a shared stored pattern is
 * edited at every step that plays it. Grid notes are the played pitch (note index + step transpose); index 49
 * (period 428) is C-2 as in periodNotes, and indices 13..24 show as the octave below C-0 (noteValue.ts). Playback stays on UADE; edits land in place in the module bytes.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeTronicCell, encodeTronicCell } from '@/engine/uade/encoders/TronicEncoder';
import { noteValueToPitch, pitchToNoteValue } from '@/lib/tracker/noteValue';

const NUM_CHANNELS = 4;
const ROWS = 16;
const PATTERN_BYTES = 64;
const INSTRUMENT_BYTES = 0x58;
const MAX_MODULE_SIZE = 0x10000;
const MAX_BLOCK_SIZE = 0x7fff;
/** Period-table index 49 (428) is pitch C-2 (25); indices 1..72 are chromatic, 13..24 the octave below C-0. */
const INDEX_TO_GRID = 24;
const MAX_NOTE_INDEX = 72;

interface TronicLayout {
  sequences: Array<{ at: number; restart: number; length: number }>;
  instrumentCount: number;
  patterns: number;
  patternBytes: number;
}

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** tronic_module_parse: the module's blocks, or null when it is not a Tronic module. */
function parseLayout(b: Uint8Array): TronicLayout | null {
  if (b.length < 16 || b.length > MAX_MODULE_SIZE) return null;
  let cursor = 16;
  const sequences: TronicLayout['sequences'] = [];
  for (let i = 0; i < NUM_CHANNELS; i++) {
    const restart = u16(b, 4 * i);
    const length = u16(b, 4 * i + 2);
    if (length < 2 || length > MAX_BLOCK_SIZE || (length & 1) || (restart & 1) || restart >= length || cursor + length > b.length) return null;
    sequences.push({ at: cursor, restart, length });
    cursor += length;
  }
  const block = (): { at: number; size: number } | null => {
    if (cursor + 2 > b.length) return null;
    const size = u16(b, cursor);
    const at = cursor + 2;
    if (size > MAX_BLOCK_SIZE || at + size > b.length) return null;
    cursor = at + size;
    return { at, size };
  };
  const waves = block();
  if (!waves || (waves.size & 1)) return null;
  const table = block();
  if (!table || (table.size & 1) || table.size < 4) return null;
  if (u16(b, table.at) !== INSTRUMENT_BYTES || u16(b, table.at + 2) !== 2 * INSTRUMENT_BYTES) return null;
  const records = u16(b, table.at + table.size - 2) + INSTRUMENT_BYTES;
  if (records > MAX_BLOCK_SIZE || cursor + records > b.length) return null;
  cursor += records;
  if (!block() || !block() || cursor + 4 > b.length) return null;
  const patternBytes = u32(b, cursor);
  if (cursor + 4 + patternBytes > b.length || cursor + 4 + patternBytes + 32 > b.length) return null;
  return { sequences, instrumentCount: table.size / 2, patterns: cursor + 4, patternBytes };
}

export function isTronicFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  return parseLayout(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)) !== null;
}

export async function parseTronicFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const b = new Uint8Array(buffer);
  const mod = parseLayout(b);
  if (!mod) throw new Error('Not a Tronic module');
  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^(trc|tro|dp|tronic)\./i, '').replace(/\.(trc|tro|dp|tronic)$/i, '') || baseName;

  // One grid pattern per distinct step: the 4 voices' (stored pattern, transpose). A voice past its sequence end has none.
  const steps = Math.max(...mod.sequences.map((s) => s.length / 2));
  const stepAt = (ch: number, k: number) => {
    const s = mod.sequences[ch];
    return 2 * k < s.length ? { pattern: b[s.at + 2 * k], transpose: (b[s.at + 2 * k + 1] << 24) >> 24 } : null;
  };
  const keyOf = new Map<string, number>();
  const gridSteps: Array<Array<{ pattern: number; transpose: number } | null>> = [];
  const songPositions: number[] = [];
  for (let k = 0; k < steps; k++) {
    const voices = Array.from({ length: NUM_CHANNELS }, (_, ch) => stepAt(ch, k));
    const key = voices.map((v) => (v ? `${v.pattern}:${v.transpose}` : '-')).join(',');
    let idx = keyOf.get(key);
    if (idx === undefined) { idx = gridSteps.length; keyOf.set(key, idx); gridSteps.push(voices); }
    songPositions.push(idx);
  }

  const cellOffset = (pat: number, row: number, ch: number): number => {
    const v = gridSteps[pat]?.[ch];
    if (!v || (v.pattern + 1) * PATTERN_BYTES > mod.patternBytes) return -1;
    return mod.patterns + v.pattern * PATTERN_BYTES + row * 4;
  };
  const playedNote = (pat: number, ch: number, index: number): number | null => {
    const v = gridSteps[pat]?.[ch];
    if (!v || !index) return null;
    const played = (index + v.transpose) & 0xff;
    return played >= 1 && played <= MAX_NOTE_INDEX ? pitchToNoteValue(played - INDEX_TO_GRID) || null : null;
  };

  const patterns: Pattern[] = gridSteps.map((_, pat) => ({
    id: `pattern-${pat}`,
    name: `Pattern ${pat}`,
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS }, (_, row): TrackerCell => {
        const at = cellOffset(pat, row, ch);
        if (at < 0) return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        const cell = decodeTronicCell(b.subarray(at, at + 4));
        return { ...cell, note: playedNote(pat, ch, b[at]) ?? 0 };
      }),
    })),
  }));

  const instruments: InstrumentConfig[] = Array.from({ length: mod.instrumentCount }, (_, i) => ({
    id: i + 1,
    name: `Instrument ${i + 1}`,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 64,
    pan: 0,
  } as InstrumentConfig));

  return {
    name: `${moduleName} [Tronic]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: mod.sequences[0].restart / 2,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'tronic',
      patternDataFileOffset: mod.patterns,
      bytesPerCell: 4,
      rowsPerPattern: ROWS,
      numChannels: NUM_CHANNELS,
      numPatterns: patterns.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodeTronicCell,
      encodeOverStored: true,
      decodeCell: decodeTronicCell,
      getCellFileOffset: cellOffset,
      // A stored pattern plays at every step that names it, each with its own transpose.
      propagateSharedCells: true,
      // The voice plays Periods[(note byte + transpose) & 0xff]; the stored byte is taken back in index space and
      // rides in the `period` carrier. Null for a pitch outside the chromatic span or one that would store as 0.
      storeNote: (pat, _row, ch, gridNote) => {
        const v = gridSteps[pat]?.[ch];
        const pitch = noteValueToPitch(gridNote);
        const index = pitch === null ? 0 : pitch + INDEX_TO_GRID;
        if (!v || index < 1 || index > MAX_NOTE_INDEX) return null;
        const byte = (index - v.transpose) & 0xff;
        return byte === 0 ? null : { period: byte };
      },
      playedNote: (pat, _row, ch, stored) => playedNote(pat, ch, stored.period ?? 0),
    } satisfies UADEPatternLayout,
  };
}
