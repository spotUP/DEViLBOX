/**
 * Anders0landParser.ts — Anders 0land Amiga music format (hot.*) native parser
 *
 * Anders 0land (Anders Öland) is a 4-channel Amiga tracker format. Files are
 * identified by a multi-chunk binary structure with chunk type tags.
 *
 * Detection (from UADE "Anders 0land_v1.asm", DTP_Check2 routine):
 *   The file is a chain of variable-length chunks. Each chunk starts with:
 *     - 3-byte ASCII tag
 *     - 1 byte (padding / reserved)
 *     - uint32 BE: chunk size (D1)
 *   Validation:
 *     D2 = fileSize - u32BE(buf, 4)   ; must not go negative (chunk fits in file)
 *     buf[0..1] == 'mp' (0x6D70)
 *     buf[2]    == 'l'  (0x6C)
 *     D1 (chunk size) must be even (btst #0,D1)
 *   Then advance to next chunk (A0 += D1):
 *     new D1 = u32BE(A0+4)
 *     D2 -= D1 ; must not go negative
 *     buf[0..1] == 'md' (0x6D64)
 *     buf[2]    == 't'  (0x74)
 *     D1 must be even
 *   Then advance again:
 *     new D1 = u32BE(A0+4)
 *     D2 -= D1 ; must not go negative
 *     buf[0..1] == 'ms' (0x6D73)
 *     buf[2]    == 'm'  (0x6D)
 *
 *   Full 3-byte tags: "mpl", "mdt", "msm"
 *   Each stored with the tag at bytes 0-2 and the chunk size at offset 4.
 *
 * Prefix: hot
 * UADE eagleplayer.conf: Anders0land  prefixes=hot
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/Anders0land/SRC_Anders0land/Anders 0land_v1.asm
 * Reference parsers: BenDaglishParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

// Minimum size: 3 chunks × minimum 8 bytes header each
const MIN_FILE_SIZE = 24;

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
 * from Anders 0land_v1.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`hot.`). The binary scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isAnders0landFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('hot.')) return false;
  }

  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;
  let d2 = buf.length;

  // ── Chunk 1: "mpl" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1a = u32BE(buf, off + 4);
  d2 -= d1a;
  if (d2 < 0) return false;

  // Tag at bytes 0-2 of chunk: 'mp' then 'l'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x70) return false; // 'mp'
  if (buf[off + 2] !== 0x6c) return false;                            // 'l'

  // Chunk size must be even
  if (d1a & 1) return false;

  off += d1a;

  // ── Chunk 2: "mdt" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1b = u32BE(buf, off + 4);
  d2 -= d1b;
  if (d2 < 0) return false;

  // Tag: 'md' then 't'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x64) return false; // 'md'
  if (buf[off + 2] !== 0x74) return false;                            // 't'

  // Chunk size must be even
  if (d1b & 1) return false;

  off += d1b;

  // ── Chunk 3: "msm" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1c = u32BE(buf, off + 4);
  d2 -= d1c;
  if (d2 < 0) return false;

  // Tag: 'ms' then 'm'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x73) return false; // 'ms'
  if (buf[off + 2] !== 0x6d) return false;                            // 'm'

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an Anders 0land module file into a TrackerSong.
 *
 * The format is a structured Amiga multi-chunk binary. This parser creates a
 * metadata-only TrackerSong with placeholder instruments. Actual audio
 * playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseAnders0landFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isAnders0landFormat(buffer, filename)) {
    throw new Error('Not an Anders 0land module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "hot." prefix (case-insensitive)
  const moduleName = baseName.replace(/^hot\./i, '') || baseName;

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
    name: `${moduleName} [Anders 0land]`,
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
