/**
 * MarkIIParser.ts — Mark II Sound System (Darius Zendeh / Cachet Software), mk2.* / mkii.* / .mk2 / .mkii
 *
 * The module is a 68k executable: replay code, then its variables, then the song. Playback is the nuade port
 * (third-party/nuade/players/markii); this parser only reads the song.
 *
 * Grammar (markii.c, mk2_module.c): the version is named by an FNV-1a 64 hash of the code (the 16 envelope bytes
 * skipped). Its variables give the row table (`data`: `rows` rows of 8 bytes, a (sequence, flags) pair per column;
 * flags & $1F = transpose, $80 = transpose down, $40/$20 = volume rise/fall), the sequences (data + long at
 * `sequence_offset`, `block_size` bytes each, a 4-byte step per row step: sample (bit 7 = slide in the sliding
 * versions), note (bit 7 = slide by the rest), volume (bit 7 = swap with the voice below), parameter (bit 0 = keep
 * DMA, no retrigger)) and the period table. Paula channel v reads the pair at row + 2v. Every voice advances one step
 * per two ticks; after block_size / 4 steps the song moves to the next row.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the row table and every played sequence are file blocks whose
 * `blockRows` carry their bytes; the display is one pattern per song row, a row per step, with `noteBytes` naming the
 * note byte of every shown note.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { markIIEncoder } from '@/engine/uade/encoders/MarkIIEncoder';

export function isMarkIIFormat(_buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('mk2.') || base.startsWith('mkii.') ||
        base.endsWith('.mk2') || base.endsWith('.mkii')) return true;
  }
  return false;
}

// ── The versions (mk2_module.c mk2_layouts) ──────────────────────────────────────────────────────────────────

export interface MarkIILayout {
  codeHash: bigint;
  codeSize: number;
  envelope: number;
  sequenceOffset: number;
  songRows: number;
  blockSize: number;
  periods: number;
  data: number;
  holdsNote: boolean;
  masksSample: boolean;
}

const LAYOUTS: MarkIILayout[] = [
  { codeHash: 0x99FECD64AA8E2BA4n, codeSize: 0x330, envelope: 0x2B2, sequenceOffset: 0x38A, songRows: 0x392, blockSize: 0x394, periods: 0x556, data: 0x5BA, holdsNote: true, masksSample: true },
  { codeHash: 0x318302C3E5D5F251n, codeSize: 0x324, envelope: 0x2A6, sequenceOffset: 0x37E, songRows: 0x386, blockSize: 0x388, periods: 0x54A, data: 0x5AE, holdsNote: false, masksSample: true },
  { codeHash: 0xEF3286FED5ACEF71n, codeSize: 0x2A0, envelope: 0x222, sequenceOffset: 0x2E2, songRows: 0x2EA, blockSize: 0x2EC, periods: 0x4AE, data: 0x512, holdsNote: false, masksSample: false },
  { codeHash: 0xD06229BF65B510EEn, codeSize: 0x2A0, envelope: 0x222, sequenceOffset: 0x2E2, songRows: 0x2EA, blockSize: 0x2EC, periods: 0x4AE, data: 0x512, holdsNote: false, masksSample: false },
  { codeHash: 0x3095C288A4A4DE55n, codeSize: 0x2A2, envelope: 0x224, sequenceOffset: 0x2DA, songRows: 0x2E2, blockSize: 0x2E4, periods: 0x4A6, data: 0x50A, holdsNote: false, masksSample: false },
];

const MASK64 = (1n << 64n) - 1n;
const ENVELOPE_BYTES = 16;

/** The version of a module, or null (mk2_module.c identify: the code hash without the envelope bytes). */
export function identifyMarkII(b: Uint8Array): MarkIILayout | null {
  for (const l of LAYOUTS) {
    if (b.length < l.data) continue;
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < l.codeSize; i++) {
      if (i >= l.envelope && i < l.envelope + ENVELOPE_BYTES) continue;
      h = ((h ^ BigInt(b[i])) * 0x100000001b3n) & MASK64;
    }
    if (h === l.codeHash) return l;
  }
  return null;
}

const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** The notes the period table names: its words up to the $FFFF end (at most 96). */
export function markIIPeriodCount(b: Uint8Array, l: MarkIILayout): number {
  let n = 0;
  while (n < 96 && l.periods + 2 * n + 1 < b.length && u16(b, l.periods + 2 * n) !== 0xffff) n++;
  return n;
}

/**
 * Grid note of a note byte under its row's transpose: the table index + 1. shortcut: assumes the module's period table
 * is the standard chromatic one from C-0 (index 24 = 428 = C-2, as in every known module); a retuned table would show
 * shifted notes, upgrade to periodToGridNote of the table entry if one turns up.
 */
export const markIIGridNote = (byte: number, transpose: number, down: boolean): number =>
  ((down ? byte - transpose : byte + transpose) & 0xff) + 1;

const ROW_BYTES = 8;
const STEP_BYTES = 4;
const NUM_CHANNELS = 4;
const HOLD_NOTE = 0x32;

function carrierRows(b: Uint8Array, start: number, size: number, token: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let t = start; t < start + size; t += token) {
    for (let p = t, left = token; left > 0;) {
      const n = Math.min(3, left);
      rows.push({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
      } as TrackerCell);
      p += n;
      left -= n;
    }
  }
  return rows;
}

export function parseMarkIIFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName
    .replace(/^mk2\./i, '').replace(/^mkii\./i, '')
    .replace(/\.mk2$/i, '').replace(/\.mkii$/i, '') || baseName;

  const l = identifyMarkII(buf);
  const rows = l ? u16(buf, l.songRows) : 0;
  const blockSize = l ? u16(buf, l.blockSize) : 0;
  const seqStart = l ? l.data + u32(buf, l.sequenceOffset) : 0;
  const steps = blockSize / STEP_BYTES;
  const periodCount = l ? markIIPeriodCount(buf, l) : 0;
  // An unknown version, or tables outside the file, keep an empty grid with no layout.
  let ok = l !== null && rows > 0 && blockSize > 0 && blockSize % STEP_BYTES === 0
    && l.data + rows * ROW_BYTES <= buf.length;

  // mulu.w, then the low word of the product, sign-extended (markii.c play_column).
  const seqAt = (seq: number): number => seqStart + (((seq * blockSize) & 0xffff) << 16 >> 16);
  const blocks = new Map<number, { size: number; token: number }>();
  if (ok && l) blocks.set(l.data, { size: rows * ROW_BYTES, token: 2 });

  const numPatterns = ok ? rows : 1;
  const patternRows = ok ? steps : 64;
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, pi) => ({
    id: `pattern-${pi}`,
    name: `Pattern ${pi}`,
    length: patternRows,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: patternRows }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
  }));

  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const usedInstruments = new Set<number>();
  if (ok && l) {
    const lastNote = [-1, -1, -1, -1];
    for (let r = 0; r < rows && ok; r++) {
      for (let ch = 0; ch < NUM_CHANNELS && ok; ch++) {
        const cellAt = l.data + r * ROW_BYTES + 2 * ch;
        const seq = buf[cellAt];
        const flags = buf[cellAt + 1];
        const start = seqAt(seq);
        if (start < l.data + rows * ROW_BYTES || start + blockSize > buf.length) { ok = false; break; }
        if (!blocks.has(start)) blocks.set(start, { size: blockSize, token: STEP_BYTES });
        for (let j = 0; j < steps; j++) {
          const p = start + STEP_BYTES * j;
          const note = buf[p + 1];
          const keepDma = (buf[p + 3] & 1) !== 0;
          // A slide or a held note plays no note byte of its own: the next note is shown again.
          if ((note & 0x80) || (l.holdsNote && note === HOLD_NOTE)) { lastNote[ch] = -1; continue; }
          const grid = markIIGridNote(note, flags & 0x1f, (flags & 0x80) !== 0);
          if (keepDma && grid === lastNote[ch]) continue;
          lastNote[ch] = grid;
          if (grid > periodCount) continue;
          const instrument = (l.masksSample ? buf[p] & 0x7f : buf[p]) + 1;
          const cell = patterns[r].channels[ch].rows[j];
          cell.note = grid;
          cell.instrument = instrument;
          usedInstruments.add(instrument);
          noteBytes.push({ pattern: r, channel: ch, row: j, offset: p + 1, note: grid });
        }
      }
    }
  }

  const sorted = ok ? [...blocks.entries()].sort((a, c) => a[0] - c[0]) : [];
  // Blocks must not overlap: two streams sharing bytes would encode them twice.
  for (let i = 1; i < sorted.length && ok; i++) ok = sorted[i - 1][0] + sorted[i - 1][1].size <= sorted[i][0];

  const layout: UADEVariablePatternLayout | undefined = ok && sorted.length ? {
    formatId: 'markII',
    numChannels: NUM_CHANNELS,
    numFilePatterns: sorted.length,
    rowsPerPattern: patternRows,
    moduleSize: buf.length,
    encoder: markIIEncoder,
    filePatternAddrs: sorted.map(([start]) => start),
    filePatternSizes: sorted.map(([, s]) => s.size),
    // The display is a step grid, not the file streams: no display pattern maps to a block.
    trackMap: patterns.map(() => Array.from({ length: NUM_CHANNELS }, () => -1)),
    blockRows: sorted.map(([start, s]) => carrierRows(buf, start, s.size, s.token)),
    noteBytes,
  } : undefined;

  const instruments: InstrumentConfig[] = [...usedInstruments].sort((a, c) => a - c).map((id) => ({
    id, name: `Sample ${id - 1}`, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const songPositions = patterns.map((_, i) => i);
  return {
    name: `${moduleName} [Mark II]`,
    format: 'MOD' as TrackerFormat,
    patterns: layout ? patterns : patterns.map((p) => ({ ...p, channels: p.channels.map((c) => ({ ...c, rows: c.rows.map(() => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })) })) })),
    instruments: layout ? instruments : [],
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 2,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    ...(layout ? { uadeVariableLayout: layout } : {}),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
