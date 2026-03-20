/**
 * SteveTurnerExporter.ts — Export TrackerSong as Steve Turner (.jpo) format
 *
 * Steve Turner modules are compiled 68k Amiga executables. The parser stores
 * the original binary in `steveTurnerFileData` and decodes the variable-length
 * pattern blocks into standard TrackerSong patterns.
 *
 * Export strategy:
 *   1. If `steveTurnerFileData` exists, return it verbatim. Any live edits
 *      made via UADE chip RAM patching are already baked into this buffer.
 *   2. If no original binary is available, encode pattern data using the
 *      Steve Turner variable-length encoder as a best-effort fallback.
 *
 * Reference: SteveTurnerParser.ts (import), SteveTurnerEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeSteveTurnerPattern } from '@/engine/uade/encoders/SteveTurnerEncoder';

// ── Result type ─────────────────────────────────────────────────────────────

export interface SteveTurnerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name
    .replace(/\s*\[Steve Turner\].*$/i, '')
    .replace(/[^\w\s.-]/g, '')
    .trim() || 'untitled';
}

function deriveFilename(baseName: string, originalFilename?: string): string {
  if (originalFilename) {
    const name = originalFilename.split('/').pop() ?? originalFilename;
    if (name.length > 0) return name;
  }
  return baseName.startsWith('jpo.') ? baseName : `jpo.${baseName}`;
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportSteveTurner(
  song: TrackerSong,
): Promise<SteveTurnerExportResult> {
  const warnings: string[] = [];

  // ── Path 1: Original binary available — return verbatim ─────────────────
  const fileData = song.steveTurnerFileData;
  if (fileData && fileData.byteLength > 0) {
    const baseName = sanitizeName(song.name);
    return {
      data: new Blob([fileData], { type: 'application/octet-stream' }),
      filename: deriveFilename(baseName),
      warnings,
    };
  }

  // ── Path 2: No original binary — build from pattern data ────────────────
  warnings.push(
    'No original Steve Turner binary available. Exporting pattern data only — ' +
    'the resulting file will not contain a valid 68k player.'
  );

  const NUM_CHANNELS = 4;

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `Steve Turner supports 4 channels but song has ${song.numChannels}. Extra channels truncated.`
    );
  }

  // Build the Steve Turner signature header (0x2E = 46 bytes)
  // Four MOVE.L #imm,D(An) at 0,8,16,24 + MOVE.W #$00FF,D0 at 0x20 +
  // MOVE.W D0,D1; JSR at 0x24 + RTS at 0x2C
  const HEADER_SIZE = 0x2E;

  // Encode each channel's pattern data using the variable-length encoder
  const channelBlobs: Uint8Array[] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    // Concatenate all patterns for this channel
    const allRows = song.patterns.flatMap(pat => {
      if (!pat || ch >= pat.channels.length) return [];
      return pat.channels[ch].rows;
    });

    if (allRows.length > 0) {
      channelBlobs.push(encodeSteveTurnerPattern(allRows, ch));
    } else {
      channelBlobs.push(new Uint8Array([0xFF])); // empty: end marker only
    }
  }

  const totalPatternBytes = channelBlobs.reduce((a, b) => a + b.length, 0);
  const totalSize = HEADER_SIZE + totalPatternBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // Write detection signature
  view.setUint16(0x00, 0x2B7C, false);
  view.setUint16(0x08, 0x2B7C, false);
  view.setUint16(0x10, 0x2B7C, false);
  view.setUint16(0x18, 0x2B7C, false);
  view.setUint32(0x20, 0x303C00FF, false);
  view.setUint32(0x24, 0x32004EB9, false);
  view.setUint16(0x2C, 0x4E75, false);

  // Write channel pattern data after header
  let offset = HEADER_SIZE;
  for (const blob of channelBlobs) {
    output.set(blob, offset);
    offset += blob.length;
  }

  const baseName = sanitizeName(song.name);
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: deriveFilename(baseName),
    warnings,
  };
}
