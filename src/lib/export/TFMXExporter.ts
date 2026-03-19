/**
 * TFMXExporter.ts — Export TrackerSong as TFMX Professional (mdat.*) format.
 *
 * Reconstructs a valid TFMX binary from TrackerSong data, including:
 *   - Header with magic, text area, song table, section offsets
 *   - Pattern pointer table + pattern command streams
 *   - Macro pointer table + macro data
 *   - Trackstep table linking patterns to channels per step
 *
 * TFMX file layout (big-endian):
 *   0x000  10 bytes   Magic: "TFMX-SONG "
 *   0x00A   2 bytes   Reserved
 *   0x00C   4 bytes   Reserved
 *   0x010 240 bytes   Text area (40×6 lines)
 *   0x100  64 bytes   Song start positions (32 × u16BE)
 *   0x140  64 bytes   Song end positions (32 × u16BE)
 *   0x180  64 bytes   Song tempo values (32 × u16BE)
 *   0x1C0  16 bytes   Padding
 *   0x1D0  12 bytes   Section offsets (trackstep, pattern, macro) as u32BE
 *   0x1DC   rest      Padding to 0x200
 *   0x200  ...        Pattern pointer table (u32BE per TFMX pattern)
 *   ...    ...        Macro pointer table (u32BE per macro)
 *   ...    ...        Trackstep table (16 bytes per step)
 *   ...    ...        Pattern command data (4 bytes per command)
 *   ...    ...        Macro data (variable)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeTFMXCell } from '@/engine/uade/encoders/TFMXEncoder';

// ── Constants ─────────────────────────────────────────────────────────────────

const TFMX_MAGIC = new Uint8Array([
  0x54, 0x46, 0x4D, 0x58, 0x2D, 0x53, 0x4F, 0x4E, 0x47, 0x20,
]); // "TFMX-SONG "

const HEADER_SIZE = 0x200; // Fixed header occupies first 512 bytes
const NUM_CHANNELS = 4;
const TRACKSTEP_ENTRY_SIZE = 16; // 8 voices × 2 bytes (we use 4 + 4 padding)

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

// ── Exporter ──────────────────────────────────────────────────────────────────

export interface TFMXExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportTFMX(song: TrackerSong): Promise<TFMXExportResult> {
  const warnings: string[] = [];

  // ── 1. Collect TFMX patterns from all tracker patterns ──────────────────
  // Each tracker pattern has NUM_CHANNELS channels. Each channel's rows become
  // a separate TFMX pattern (command stream). We build a flat list of TFMX
  // pattern command buffers and track the mapping.
  //
  // tfmxPatterns[i] = Uint8Array of 4-byte commands for TFMX pattern i
  // patMap[trackerPatIdx][channel] = tfmxPatternIndex

  const tfmxPatterns: Uint8Array[] = [];
  const patMap: number[][] = [];

  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const chMap: number[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = pat.channels[ch]?.rows ?? [];
      const tfmxIdx = tfmxPatterns.length;
      chMap.push(tfmxIdx);

      // Encode each row as a 4-byte TFMX command
      const cmds: Uint8Array[] = [];
      for (let row = 0; row < rows.length; row++) {
        cmds.push(encodeTFMXCell(rows[row]));
      }

      // Append end-of-pattern command (F0) if not already present
      const lastCmd = cmds.length > 0 ? cmds[cmds.length - 1] : null;
      if (!lastCmd || lastCmd[0] !== 0xF0) {
        cmds.push(new Uint8Array([0xF0, 0x00, 0x00, 0x00]));
      }

      // Flatten to single buffer
      const buf = new Uint8Array(cmds.length * 4);
      for (let i = 0; i < cmds.length; i++) {
        buf.set(cmds[i], i * 4);
      }
      tfmxPatterns.push(buf);
    }
    patMap.push(chMap);
  }

  if (tfmxPatterns.length > 128) {
    warnings.push(
      `TFMX supports up to 128 patterns; ${tfmxPatterns.length} generated. ` +
      `Extra patterns will be truncated.`,
    );
  }
  const numTfmxPatterns = Math.min(128, tfmxPatterns.length);

  // ── 2. Collect macro data from instruments ──────────────────────────────
  const macroDataBuffers: Uint8Array[] = [];
  for (const inst of song.instruments) {
    if (inst?.tfmx?.volModSeqData && inst.tfmx.volModSeqData.length > 0) {
      macroDataBuffers.push(new Uint8Array(inst.tfmx.volModSeqData));
    } else {
      // Empty macro slot — 4 zero bytes
      macroDataBuffers.push(new Uint8Array(4));
    }
  }
  // Ensure at least one macro entry
  if (macroDataBuffers.length === 0) {
    macroDataBuffers.push(new Uint8Array(4));
  }
  const numMacros = macroDataBuffers.length;

  // ── 3. Build trackstep table ────────────────────────────────────────────
  // Each song position maps to a trackstep entry. Each entry assigns
  // TFMX pattern numbers to the 4 channels (+ 4 unused voice slots).
  const songLen = song.songPositions.length;
  const trackstepEntries: Uint8Array[] = [];

  for (let i = 0; i < songLen; i++) {
    const trackerPatIdx = song.songPositions[i] ?? 0;
    const entry = new Uint8Array(TRACKSTEP_ENTRY_SIZE);

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const tfmxPatNum = patMap[trackerPatIdx]?.[ch] ?? 0;
      if (tfmxPatNum >= numTfmxPatterns) {
        entry[ch * 2] = 0xFE; // stop voice
        entry[ch * 2 + 1] = 0;
      } else {
        entry[ch * 2] = tfmxPatNum & 0xFF;
        entry[ch * 2 + 1] = 0; // transpose = 0
      }
    }
    // Voices 4-7: mark as stopped (0xFE)
    for (let ch = NUM_CHANNELS; ch < 8; ch++) {
      entry[ch * 2] = 0xFE;
      entry[ch * 2 + 1] = 0;
    }
    trackstepEntries.push(entry);
  }

  // Append end marker
  const endEntry = new Uint8Array(TRACKSTEP_ENTRY_SIZE);
  endEntry[0] = 0xFF; // TRACK_END
  trackstepEntries.push(endEntry);

  // ── 4. Calculate section sizes and offsets ───────────────────────────────
  // Layout after the 0x200 header:
  //   Pattern pointer table:  numTfmxPatterns × 4 bytes
  //   Macro pointer table:    numMacros × 4 bytes
  //   Trackstep table:        trackstepEntries.length × 16 bytes
  //   Pattern command data:   variable (sum of all pattern buffers)
  //   Macro data:             variable (sum of all macro buffers)

  const patPtrTableSize = numTfmxPatterns * 4;
  const macroPtrTableSize = numMacros * 4;
  const trackstepSize = trackstepEntries.length * TRACKSTEP_ENTRY_SIZE;
  const patternDataSize = tfmxPatterns
    .slice(0, numTfmxPatterns)
    .reduce((sum, buf) => sum + buf.length, 0);
  const macroDataSize = macroDataBuffers.reduce((sum, buf) => sum + buf.length, 0);

  const patPtrTableOffset = HEADER_SIZE;
  const macroPtrTableOffset = patPtrTableOffset + patPtrTableSize;
  const trackstepOffset = macroPtrTableOffset + macroPtrTableSize;
  const patternDataOffset = trackstepOffset + trackstepSize;
  const macroDataOffset = patternDataOffset + patternDataSize;
  const totalSize = macroDataOffset + macroDataSize;

  // ── 5. Allocate and write output buffer ─────────────────────────────────
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // -- Magic at 0x000
  output.set(TFMX_MAGIC, 0);

  // -- Reserved bytes at 0x00A..0x00F (zeros)

  // -- Text area at 0x010 (240 bytes, 40×6)
  const titleStr = (song.name ?? 'Untitled').substring(0, 40);
  for (let i = 0; i < titleStr.length; i++) {
    output[0x010 + i] = titleStr.charCodeAt(i) & 0x7F;
  }

  // -- Song table at 0x100
  // Subsong 0: start=0, end=songLen-1, tempo from song
  const firstStep = 0;
  const lastStep = Math.max(0, songLen - 1);

  // Compute tempo value
  let tempoVal = song.initialBPM ?? 125;
  if (tempoVal <= 15) {
    // Already a TFMX speed value
    tempoVal = Math.max(0, tempoVal);
  }

  writeU16BE(view, 0x100, firstStep);
  writeU16BE(view, 0x140, lastStep);
  writeU16BE(view, 0x180, tempoVal);

  // Fill remaining 31 song slots with zeros (already zero)

  // -- Section offsets at 0x1D0
  writeU32BE(view, 0x1D0, trackstepOffset);
  writeU32BE(view, 0x1D4, patPtrTableOffset);
  writeU32BE(view, 0x1D8, macroPtrTableOffset);

  // ── 6. Write pattern pointer table ──────────────────────────────────────
  let patDataPos = patternDataOffset;
  for (let i = 0; i < numTfmxPatterns; i++) {
    writeU32BE(view, patPtrTableOffset + i * 4, patDataPos);
    patDataPos += tfmxPatterns[i].length;
  }

  // ── 7. Write macro pointer table ───────────────────────────────────────
  let macroDataPos = macroDataOffset;
  for (let i = 0; i < numMacros; i++) {
    writeU32BE(view, macroPtrTableOffset + i * 4, macroDataPos);
    macroDataPos += macroDataBuffers[i].length;
  }

  // ── 8. Write trackstep table ────────────────────────────────────────────
  for (let i = 0; i < trackstepEntries.length; i++) {
    output.set(trackstepEntries[i], trackstepOffset + i * TRACKSTEP_ENTRY_SIZE);
  }

  // ── 9. Write pattern command data ───────────────────────────────────────
  let writePos = patternDataOffset;
  for (let i = 0; i < numTfmxPatterns; i++) {
    output.set(tfmxPatterns[i], writePos);
    writePos += tfmxPatterns[i].length;
  }

  // ── 10. Write macro data ───────────────────────────────────────────────
  writePos = macroDataOffset;
  for (let i = 0; i < numMacros; i++) {
    output.set(macroDataBuffers[i], writePos);
    writePos += macroDataBuffers[i].length;
  }

  // ── 11. Generate filename and return ────────────────────────────────────
  const baseName = (song.name ?? 'untitled').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filename = `mdat.${baseName}`;

  return {
    data: new Blob([output.buffer], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
