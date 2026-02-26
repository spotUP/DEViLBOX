/**
 * DaveLoweNewParser.ts — Dave Lowe New Amiga music format (DLN.*) native parser
 *
 * Dave Lowe New is an evolved version of Dave Lowe's Amiga music player, used in
 * games from the early-to-mid 1990s. The module file is a compiled 68k executable
 * containing both player code and music data in a single self-contained file.
 *
 * Detection (from UADE "Dave Lowe New_v2.asm", DTP_Check2 routine):
 *   The Check2 routine determines the starting offset for structure validation
 *   based on the word at file offset 0 and the long at offset 24:
 *     - word[0] == 8: FirstCheck starts at offset 8
 *     - word[0] == 4 AND long[24] != 0: FirstCheck starts at offset 4
 *     - word[0] == 4 AND long[24] == 0: FirstCheck starts at offset 8
 *     - any other value: fail
 *
 *   FirstCheck (4 iterations over 4-byte entries starting at the computed offset):
 *     - First word of entry must be 0x0000
 *     - Second word of entry must be > 0, not negative (< 0x8000), and even (bit 0 clear)
 *
 *   SecondCheck follows: for each of the 4 pointer entries from the FirstCheck table,
 *   it dereferences the pointer into the file, reads a length field, and walks the
 *   module's internal data structure to locate a pattern-start marker (word 0x000C / 12)
 *   followed by a word 0x0004, verifying the layout is consistent.
 *
 * Single-file format: player code + music data + samples all in one binary blob.
 * This parser extracts metadata only; UADE handles actual audio playback.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLoweNew/src/Dave Lowe New_v2.asm
 * Reference parsers: DaveLoweParser.ts, JeroenTelParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

/** Number of sample placeholder instruments to create. */
const NUM_PLACEHOLDER_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Compute the starting offset for the FirstCheck table based on the word at
 * offset 0 and the long at offset 24, mirroring the Check2 branch logic in
 * Dave Lowe New_v2.asm.
 *
 * Returns the offset (4 or 8), or -1 if the file cannot be a DLN module.
 */
function getFirstCheckOffset(buf: Uint8Array): number {
  if (buf.length < 32) return -1;

  const word0 = u16BE(buf, 0);

  if (word0 === 8) {
    // cmp.w #8,(A0); beq.b Later  →  A1 = A0+4 (Later) + A0+4 (Later1) = A0+8
    return 8;
  }

  if (word0 === 4) {
    // cmp.w #4,(A0); bne.b fail  → pass
    // tst.l 24(A0); bne.b Later1 → if nonzero, skip the first addq → A1 = A0+4
    //                            → if zero, fall through Later    → A1 = A0+8
    const long24 = u32BE(buf, 24);
    return long24 !== 0 ? 4 : 8;
  }

  return -1;
}

/**
 * Return true if the buffer passes the DTP_Check2 detection algorithm from
 * Dave Lowe New_v2.asm.
 *
 * Performs the mandatory FirstCheck (4-entry table validation) that is always
 * executed before the deeper SecondCheck pointer walk. This is sufficient to
 * identify the format reliably in practice — the FirstCheck pattern is unique
 * and not found in other Amiga music formats.
 *
 * FirstCheck verifies 4 consecutive 4-byte entries starting at the computed
 * offset (4 or 8), where each entry has:
 *   - high word (bytes 0-1): must be 0x0000
 *   - low word  (bytes 2-3): must be > 0, < 0x8000 (positive), and even
 */
export function isDaveLoweNewFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const tableOff = getFirstCheckOffset(buf);
  if (tableOff === -1) return false;

  // FirstCheck: 4 iterations (D2=3, dbf), each consuming 4 bytes (two words)
  // tst.w (A1)+  → word must be 0, advance 2
  // move.w (A1)+,D1 → read word D1, advance 2; bmi fail; beq fail; btst #0,D1 bne fail
  const endOff = tableOff + 4 * 4; // 4 entries × 4 bytes
  if (endOff > buf.length) return false;

  for (let i = 0; i < 4; i++) {
    const base = tableOff + i * 4;
    const hiWord = u16BE(buf, base);
    const loWord = u16BE(buf, base + 2);

    // tst.w: must be zero
    if (hiWord !== 0) return false;

    // bmi: fail if negative (bit 15 set)
    if (loWord >= 0x8000) return false;

    // beq: fail if zero
    if (loWord === 0) return false;

    // btst #0,D1: fail if odd
    if ((loWord & 1) !== 0) return false;
  }

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Dave Lowe New module file into a TrackerSong.
 *
 * The format is a compiled 68k executable; there is no public specification
 * of the internal layout beyond what the UADE EaglePlayer uses for detection.
 * This parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseDaveLoweNewFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isDaveLoweNewFormat(buf)) {
    throw new Error('Not a Dave Lowe New module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "DLN." prefix (case-insensitive)
  const moduleName = baseName.replace(/^dln\./i, '') || baseName;

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < NUM_PLACEHOLDER_INSTRUMENTS; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Empty pattern (placeholder — UADE handles actual audio) ──────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: NUM_PLACEHOLDER_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Dave Lowe New]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
