/**
 * SCUMMExporter.ts — Export TrackerSong as LucasArts SCUMM music format
 *
 * SCUMM modules are self-contained 68k binaries (player + data fused).
 * The parser does NOT decompose the binary into pattern/instrument data —
 * it stores the entire binary in `uadeEditableFileData` and creates empty
 * stub patterns for the editor grid.
 *
 * Export strategy:
 *   1. If `uadeEditableFileData` exists, return it verbatim. Any live edits
 *      made via UADE chip RAM patching are already baked into this buffer
 *      (UADEChipEditor reads back the full module from emulated Amiga RAM).
 *   2. If no original binary is available, encode whatever pattern data exists
 *      using standard ProTracker MOD 4-byte cell encoding (matching the
 *      SCUMMEncoder) into a minimal binary with the BRA.W signature byte
 *      at offset 4. This is a best-effort fallback — the result won't have
 *      a valid 68k player, but preserves the cell data.
 *
 * Reference: SCUMMParser.ts (import), SCUMMEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeSCUMMCell } from '@/engine/uade/encoders/SCUMMEncoder';

// ── Main export function ─────────────────────────────────────────────────────

export async function exportSCUMM(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
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
    'No original SCUMM binary available. Exporting pattern data only — ' +
    'the resulting file will not contain a valid 68k player.'
  );

  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const BYTES_PER_CELL = 4;

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `SCUMM supports 4 channels but song has ${song.numChannels}. Extra channels truncated.`
    );
  }

  const numPatterns = Math.max(1, song.patterns.length);

  // Header: 6 bytes (4 zero bytes + BRA.W opcode byte + padding)
  // The BRA.W at offset 4 (0x60) is the format signature.
  const HEADER_SIZE = 6;
  const patternBlockSize = numPatterns * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
  const totalSize = HEADER_SIZE + patternBlockSize;

  const output = new Uint8Array(totalSize);

  // Bytes 0-3: zeros (typical for SCUMM header area)
  // Byte 4: BRA.W opcode (0x60) — format signature
  output[4] = 0x60;
  // Byte 5: displacement byte for BRA.W (points past our pattern data)
  output[5] = 0x00;

  // ── Encode pattern data ───────────────────────────────────────────────
  let offset = HEADER_SIZE;

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];

    if (pat && pat.length > ROWS_PER_PATTERN) {
      warnings.push(
        `Pattern ${p} has ${pat.length} rows but SCUMM supports max ${ROWS_PER_PATTERN}. Extra rows truncated.`
      );
    }

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = pat?.channels[ch]?.rows[row] ?? {
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        };
        const encoded = encodeSCUMMCell(cell);
        output.set(encoded, offset);
        offset += BYTES_PER_CELL;
      }
    }
  }

  const baseName = sanitizeName(song.name);

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.scumm`,
    warnings,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeName(name: string | undefined): string {
  return (name || 'untitled')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim() || 'untitled';
}

function deriveFilename(baseName: string, originalFilename?: string): string {
  if (originalFilename) {
    // Preserve original filename (it may have a custom extension)
    return originalFilename;
  }
  return `${baseName}.scumm`;
}
