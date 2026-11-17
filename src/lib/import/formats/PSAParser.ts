/**
 * PSAParser.ts — Professional Sound Artists (PSA) Amiga music format native parser
 *
 * PSA is an Amiga music format created by Professional Sound Artists.
 * The format has a clear 4-byte magic signature at the start of the file.
 *
 * Detection (from UADE PSA_v2.asm, DTP_Check2 routine):
 *   bytes[0..3] == 0x50534100  ("PSA\0")
 *   Single magic check — no further structural validation needed.
 *
 * Metadata extraction (from DTP_InitPlayer):
 *   offset 40 (u32BE) = data offset; subsong count = (dataOffset - 56) >> 3
 *   offset 44 (u32BE) = instrument table start; offset 48 (u32BE) = instrument table end
 *   instrument count = (u32BE(44) - u32BE(40)) >> 6
 *
 * Single-file format: player code + music data in one binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/PSA/PSA_v2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodePSACell, encodePSACell } from '@/engine/uade/encoders/PSAEncoder';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to hold the PSA magic and basic header. */
const MIN_FILE_SIZE = 52;

/** Maximum instruments to create as placeholders. */
const MAX_INSTRUMENTS = 64;

/** Maximum subsong count to report. */
const MAX_SUBSONGS = 128;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Professional Sound Artists (PSA) module.
 *
 * Detection mirrors DTP_Check2 from PSA_v2.asm:
 *   cmp.l #$50534100,(A0)  → bytes[0..3] == "PSA\0"
 */
export function isPSAFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return false;
  return buf[0] === 0x50 && buf[1] === 0x53 && buf[2] === 0x41 && buf[3] === 0x00;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a PSA module file into a TrackerSong.
 *
 * Extracts subsong and instrument counts from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parsePSAFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isPSAFormat(buf)) {
    throw new Error('Not a PSA module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "PSA." prefix (case-insensitive) or ".psa" extension
  const moduleName =
    baseName.replace(/^psa\./i, '').replace(/\.psa$/i, '') || baseName;

  // ── Metadata extraction ───────────────────────────────────────────────────

  // From InitPlayer: D2 = u32BE(40) (data offset)
  // subsong count = (D2 - 56) >> 3
  let subsongCount = 1;
  let instrumentCount = 0;

  if (buf.length >= MIN_FILE_SIZE) {
    const dataOffset = u32BE(buf, 40);
    if (dataOffset >= 56 && dataOffset < buf.length) {
      const rawSubs = (dataOffset - 56) >> 3;
      if (rawSubs > 0) subsongCount = Math.min(rawSubs, MAX_SUBSONGS);
    }

    // instrument count = (u32BE(44) - u32BE(40)) >> 6
    const instTableStart = u32BE(buf, 40);
    const instTableEnd = u32BE(buf, 44);
    if (instTableEnd > instTableStart && instTableEnd < buf.length) {
      const rawInst = (instTableEnd - instTableStart) >> 6;
      if (rawInst > 0) instrumentCount = Math.min(rawInst, MAX_INSTRUMENTS);
    }
  }

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instruments: InstrumentConfig[] = Array.from(
    { length: instrumentCount || 1 },
    (_, i) =>
      ({
        id: i + 1,
        name: '',
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      }) as InstrumentConfig,
  );

  // ── Patterns: 1024 bytes each, 64 rows x 4 voices x [note, inst, effect, param] ──

  const NUM_CH = 4;
  const ROWS = 64;
  const patStart = u32BE(buf, 48);
  const posBase = u32BE(buf, 44);
  const subStart = (n: number): number => 56 + n * 8;
  // Position table of subsong n: u16 words from [start, end) at posBase (Init / SetPosition).
  const positionsOf = (n: number): number[] => {
    const lo = (buf[subStart(n)] << 8) | buf[subStart(n) + 1];
    const hi = (buf[subStart(n) + 2] << 8) | buf[subStart(n) + 3];
    const out: number[] = [];
    for (let o = lo; o < hi && posBase + o + 2 <= buf.length; o += 2) out.push((buf[posBase + o] << 8) | buf[posBase + o + 1]);
    return out;
  };
  const allSubs = Array.from({ length: subsongCount }, (_, n) => positionsOf(n));
  const fitting = Math.max(0, Math.floor((buf.length - patStart) / 1024));
  const numPatterns = Math.min(fitting, Math.max(1, ...allSubs.flat().map((p) => p + 1)));
  const cellOffset = (p: number, row: number, ch: number): number =>
    p < 0 || p >= numPatterns || row < 0 || row >= ROWS || ch < 0 || ch >= NUM_CH ? -1 : patStart + p * 1024 + row * 16 + ch * 4;

  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: ROWS,
    channels: Array.from({ length: NUM_CH }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: ROWS }, (_, r) => decodePSACell(buf.subarray(cellOffset(p, r, ch), cellOffset(p, r, ch) + 4))),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CH, originalPatternCount: numPatterns, originalInstrumentCount: instrumentCount,
    },
  }));
  const order = (allSubs[0] ?? []).filter((p) => p < numPatterns);

  const nameParts: string[] = [`${moduleName} [PSA]`];
  if (subsongCount > 1) nameParts.push(`(${subsongCount} subsongs)`);
  if (instrumentCount > 0) nameParts.push(`(${instrumentCount} smp)`);

  return {
    name: nameParts.join(' '),
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: order.length ? order : [0],
    songLength: order.length || 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'psa',
      patternDataFileOffset: patStart,
      bytesPerCell: 4,
      rowsPerPattern: ROWS,
      numChannels: NUM_CH,
      numPatterns,
      moduleSize: buffer.byteLength,
      encodeCell: encodePSACell,
      encodeOverStored: true,
      decodeCell: decodePSACell,
      getCellFileOffset: cellOffset,
    } satisfies UADEPatternLayout,
  };
}
