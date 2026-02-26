/**
 * AndrewPartonParser.ts — Andrew Parton Amiga music format (bye.*) native parser
 *
 * Andrew Parton is a 4-channel Amiga music format. Files are identified by a
 * 4-byte "BANK" magic at offset 0, followed by tables of Amiga chip-RAM
 * pointers and sample lengths.
 *
 * Detection (from UADE "Andrew Parton_v2.asm", DTP_Check2 routine):
 *   1. u32BE(buf, 0) == 0x42414E4B  ('BANK')  — magic at start; A0 advances past it
 *   2. 20 consecutive uint32 BE values (offsets 4..83) must each be < 0x200000
 *      (max Amiga chip RAM = 2 MB). The check uses bls.b Fault which fails if
 *      value >= 0x200000 (i.e. D1 minus the value is ≤ 0, i.e. value ≥ D1).
 *      D2 = 19 (dbf counts 0..19 = 20 iterations).
 *   3. Next 40 consecutive uint32 BE values (offsets 84..243) must each be < 0x10000
 *      (max sample length = 64 KB). The check uses bls.b Fault; D2 = 19+20 = 39
 *      (dbf counts 0..39 = 40 iterations).
 *
 *   Full decode:
 *     cmp.l #'BANK',(A0)+          ; read 4 bytes magic, A0 now at offset 4
 *     D1 = 0x200000
 *     D2 = 19
 *     loop: cmp.l (A0)+,D1         ; read and advance, fail if value >= D1
 *     D1 = 0x10000
 *     D2 = 19+20 = 39
 *     loop: cmp.l (A0)+,D1         ; read and advance, fail if value >= D1
 *
 * Prefix: bye
 * UADE eagleplayer.conf: AndrewParton  prefixes=bye
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/Andrew Parton/SRC_AndrewParton/Andrew Parton_v2.asm
 * Reference parsers: BenDaglishParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

// 4 (magic) + 20×4 (chip-RAM offsets) + 40×4 (sample lengths) = 244 bytes minimum
const MIN_FILE_SIZE = 244;

const DEFAULT_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the DTP_Check2 detection algorithm
 * from Andrew Parton_v2.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`bye.`). The binary scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isAndrewPartonFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('bye.')) return false;
  }

  if (buf.length < MIN_FILE_SIZE) return false;

  // 'BANK' magic at offset 0
  if (u32BE(buf, 0) !== 0x42414e4b) return false; // 'BANK'

  // 20 chip-RAM offset entries at offsets 4..83: each must be < 0x200000
  const MAX_CHIP_RAM = 0x200000;
  let off = 4;
  for (let i = 0; i < 20; i++, off += 4) {
    if (u32BE(buf, off) >= MAX_CHIP_RAM) return false;
  }

  // 40 sample-length entries at offsets 84..243: each must be < 0x10000
  const MAX_SAMPLE_LEN = 0x10000;
  for (let i = 0; i < 40; i++, off += 4) {
    if (u32BE(buf, off) >= MAX_SAMPLE_LEN) return false;
  }

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an Andrew Parton module file into a TrackerSong.
 *
 * The format contains tables of chip-RAM pointers and sample lengths. This
 * parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseAndrewPartonFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isAndrewPartonFormat(buffer, filename)) {
    throw new Error('Not an Andrew Parton module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "bye." prefix (case-insensitive)
  const moduleName = baseName.replace(/^bye\./i, '') || baseName;

  // ── Instrument placeholders ───────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < DEFAULT_INSTRUMENTS; i++) {
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

  // ── Empty pattern (placeholder — UADE handles actual audio) ───────────────

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
      originalInstrumentCount: DEFAULT_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Andrew Parton]`,
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
