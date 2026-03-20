/**
 * RobHubbardExporter.ts — Export TrackerSong as Rob Hubbard (.rh) format
 *
 * Rob Hubbard modules are compiled 68k Amiga executables with player code
 * and music data (including PCM samples) fused into a single binary. The parser
 * stores the original binary in `uadeEditableFileData`.
 *
 * Export strategy:
 *   1. If `uadeEditableFileData` exists, return it verbatim. Any live edits
 *      made via UADE chip RAM patching are already baked into this buffer.
 *   2. If no original binary is available, encode pattern data using standard
 *      ProTracker MOD 4-byte cell encoding as a best-effort fallback.
 *
 * Reference: RobHubbardParser.ts (import), RobHubbardEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeRobHubbardCell } from '@/engine/uade/encoders/RobHubbardEncoder';

// ── Result type ─────────────────────────────────────────────────────────────

export interface RobHubbardExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name
    .replace(/\s*\[Rob Hubbard\].*$/i, '')
    .replace(/[^\w\s.-]/g, '')
    .trim() || 'untitled';
}

function deriveFilename(baseName: string, originalFilename?: string): string {
  if (originalFilename) {
    const name = originalFilename.split('/').pop() ?? originalFilename;
    if (name.length > 0) return name;
  }
  return baseName.startsWith('rh.') ? baseName : `rh.${baseName}`;
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportRobHubbard(
  song: TrackerSong,
): Promise<RobHubbardExportResult> {
  const warnings: string[] = [];

  // ── Path 1: Original binary available — return verbatim ─────────────────
  if (song.uadeEditableFileData && song.uadeEditableFileData.byteLength > 0) {
    const baseName = sanitizeName(song.name);
    return {
      data: new Blob([song.uadeEditableFileData], { type: 'application/octet-stream' }),
      filename: deriveFilename(baseName, song.uadeEditableFileName),
      warnings,
    };
  }

  // ── Path 2: No original binary — build from pattern data ────────────────
  warnings.push(
    'No original Rob Hubbard binary available. Exporting pattern data only — ' +
    'the resulting file will not contain a valid 68k player.'
  );

  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const BYTES_PER_CELL = 4;

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `RH supports 4 channels but song has ${song.numChannels}. Extra channels truncated.`
    );
  }

  const numPatterns = Math.max(1, song.patterns.length);

  // Build a minimal binary with the RH detection signature:
  // Five BRA (0x6000) at offsets 0,4,8,12,16 + LEA (0x41FA) at 20 + RTS+LEA at 28
  const HEADER_SIZE = 32;
  const patternBlockSize = numPatterns * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
  const totalSize = HEADER_SIZE + patternBlockSize;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // Write RH signature bytes
  for (let i = 0; i < 5; i++) {
    view.setUint16(i * 4, 0x6000, false);       // BRA at offsets 0,4,8,12,16
    view.setUint16(i * 4 + 2, 0x0000, false);   // displacement
  }
  view.setUint16(20, 0x41FA, false);             // LEA d16(PC),An
  view.setUint16(22, 0x0000, false);
  view.setUint32(28, 0x4E7541FA, false);         // RTS + LEA

  // ── Encode pattern data ─────────────────────────────────────────────────
  let offset = HEADER_SIZE;

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const numRows = pat ? Math.min(pat.length, ROWS_PER_PATTERN) : ROWS_PER_PATTERN;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (pat && ch < pat.channels.length && row < numRows) {
          const cell = pat.channels[ch].rows[row];
          const encoded = encodeRobHubbardCell(cell);
          output.set(encoded, offset);
        }
        offset += BYTES_PER_CELL;
      }
    }
  }

  const baseName = sanitizeName(song.name);
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: deriveFilename(baseName, song.uadeEditableFileName),
    warnings,
  };
}
