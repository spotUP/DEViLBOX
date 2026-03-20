/**
 * DavidWhittakerExporter.ts — Export TrackerSong as David Whittaker (.dw) format
 *
 * David Whittaker modules are compiled 68k Amiga executables with player code
 * and music data fused into a single binary. The parser stores the original
 * binary in `uadeEditableFileData` and creates placeholder patterns.
 *
 * Export strategy:
 *   1. If `uadeEditableFileData` exists, return it verbatim. Any live edits
 *      made via UADE chip RAM patching are already baked into this buffer.
 *   2. If no original binary is available, encode pattern data using standard
 *      ProTracker MOD 4-byte cell encoding as a best-effort fallback.
 *
 * Reference: DavidWhittakerParser.ts (import), DavidWhittakerEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeDavidWhittakerCell } from '@/engine/uade/encoders/DavidWhittakerEncoder';

// ── Result type ─────────────────────────────────────────────────────────────

export interface DavidWhittakerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name
    .replace(/\s*\[David Whittaker\].*$/i, '')
    .replace(/[^\w\s.-]/g, '')
    .trim() || 'untitled';
}

function deriveFilename(baseName: string, originalFilename?: string): string {
  if (originalFilename) {
    const name = originalFilename.split('/').pop() ?? originalFilename;
    if (name.length > 0) return name;
  }
  return baseName.endsWith('.dw') ? baseName : `${baseName}.dw`;
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportDavidWhittaker(
  song: TrackerSong,
): Promise<DavidWhittakerExportResult> {
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
    'No original David Whittaker binary available. Exporting pattern data only — ' +
    'the resulting file will not contain a valid 68k player.'
  );

  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const BYTES_PER_CELL = 4;

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `DW supports 4 channels but song has ${song.numChannels}. Extra channels truncated.`
    );
  }

  const numPatterns = Math.max(1, song.patterns.length);

  // Build a minimal binary: just encoded pattern cells
  // DW detection marker: 0x47FA (lea x,a3) at offset 0 as a rudimentary header
  const HEADER_SIZE = 4;
  const patternBlockSize = numPatterns * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
  const totalSize = HEADER_SIZE + patternBlockSize;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // Write the 0x47FA marker so the file is at least detectable
  view.setUint16(0, 0x47FA, false);
  view.setUint16(2, 0x0000, false);

  // ── Encode pattern data ─────────────────────────────────────────────────
  let offset = HEADER_SIZE;

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const numRows = pat ? Math.min(pat.length, ROWS_PER_PATTERN) : ROWS_PER_PATTERN;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (pat && ch < pat.channels.length && row < numRows) {
          const cell = pat.channels[ch].rows[row];
          const encoded = encodeDavidWhittakerCell(cell);
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
