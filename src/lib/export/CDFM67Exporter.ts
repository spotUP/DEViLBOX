/**
 * CDFM67Exporter.ts — Export TrackerSong to Composer 670 (.c67) format.
 *
 * Reconstructs the binary layout from TrackerSong data, reversing what
 * CDFM67Parser.ts does on import.
 *
 * Binary layout:
 *   C67FileHeader (1954 bytes):
 *     +0    speed (uint8)
 *     +1    restartPos (uint8)
 *     +2    sampleNames[32][13]          — 32 x 13-byte null-terminated PCM names
 *     +418  samples[32]                  — 32 x C67SampleHeader (16 bytes each = 512)
 *           C67SampleHeader: unknown(4) length(4) loopStart(4) loopEnd(4)
 *     +930  fmInstrNames[32][13]         — 32 x 13-byte null-terminated OPL names
 *     +1346 fmInstr[32][11]              — 32 x 11-byte OPL2 register dump
 *     +1698 orders[256]                  — order list (0xFF = end)
 *
 *   After header (at offset 1954):
 *     patOffsets[128] x uint32LE         — pattern data offsets (relative to 2978)
 *     patLengths[128] x uint32LE         — pattern data lengths
 *     Pattern data at 2978 + patOffsets[i]
 *
 *   After pattern data:
 *     PCM sample data (8-bit unsigned), concatenated sequentially
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeC67Pattern } from '@/engine/uade/encoders/CDFM67Encoder';

// ── Constants ────────────────────────────────────────────────────────────────

const HDR_SIZE         = 1954;
const PAT_DATA_BASE    = 2978; // 1954 + 512 (offsets) + 512 (lengths)
const NUM_PCM_CHANNELS = 4;
const NUM_FM_CHANNELS  = 9;
const NUM_CHANNELS     = NUM_PCM_CHANNELS + NUM_FM_CHANNELS; // 13
const NUM_PCM_INSTRS   = 32;
const NUM_FM_INSTRS    = 32;
const ROWS_PER_PATTERN = 64;
const NUM_PATTERNS     = 128;
const NO_LOOP          = 0xFFFFF;

// ── Binary write helpers ─────────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU32LE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = val & 0xFF;
  buf[off + 1] = (val >>> 8) & 0xFF;
  buf[off + 2] = (val >>> 16) & 0xFF;
  buf[off + 3] = (val >>> 24) & 0xFF;
}

function writeString(buf: Uint8Array, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── Exporter ─────────────────────────────────────────────────────────────────

export async function exportCDFM67(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  const speed = Math.max(1, Math.min(15, song.initialSpeed ?? 6));
  const restartPos = Math.max(0, Math.min(255, song.restartPosition ?? 0));

  // ── Collect instrument data ──────────────────────────────────────────────

  // PCM sample buffers (raw 8-bit unsigned)
  const samplePCMs: Uint8Array[] = [];
  const sampleHeaders: Array<{ length: number; loopStart: number; loopEnd: number }> = [];
  const sampleNames: string[] = [];

  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    const inst = song.instruments[i];
    if (inst?.sample?.audioBuffer) {
      const wavBuf = inst.sample.audioBuffer;
      const wavView = new DataView(wavBuf);

      // Parse WAV to get raw PCM (16-bit signed → 8-bit unsigned)
      let pcm: Uint8Array;
      let sampleLen = 0;
      try {
        const dataLen = wavView.getUint32(40, true);
        const frames = Math.floor(dataLen / 2);
        pcm = new Uint8Array(frames);
        for (let j = 0; j < frames; j++) {
          const s16 = wavView.getInt16(44 + j * 2, true);
          // Convert 16-bit signed → 8-bit unsigned (0x80 = silence)
          pcm[j] = ((s16 >> 8) + 128) & 0xFF;
        }
        sampleLen = frames;
      } catch {
        pcm = new Uint8Array(0);
        warnings.push(`PCM instrument ${i + 1} "${inst.name}": failed to decode WAV data`);
      }

      const loopStart = inst.sample?.loopStart ?? 0;
      const loopEnd = inst.sample?.loopEnd ?? 0;
      const hasLoop = loopEnd > loopStart && loopEnd > 0;

      samplePCMs.push(pcm);
      sampleHeaders.push({
        length: sampleLen,
        loopStart: hasLoop ? loopStart : 0,
        loopEnd: hasLoop ? loopEnd : NO_LOOP,
      });
      sampleNames.push((inst.name ?? '').slice(0, 12));
    } else {
      samplePCMs.push(new Uint8Array(0));
      sampleHeaders.push({ length: 0, loopStart: 0, loopEnd: NO_LOOP });
      sampleNames.push(inst?.name?.slice(0, 12) ?? '');
    }
  }

  // FM instrument names and register dumps
  const fmNames: string[] = [];
  const fmRegDumps: Uint8Array[] = [];

  for (let i = 0; i < NUM_FM_INSTRS; i++) {
    const inst = song.instruments[NUM_PCM_INSTRS + i];
    fmNames.push((inst?.name ?? '').slice(0, 12));
    // FM register data is not preserved in TrackerSong — write zeros
    fmRegDumps.push(new Uint8Array(11));
    if (inst?.name && inst.name.length > 0) {
      // We have a named FM instrument but no OPL register data
      // Only warn if it seems like a real instrument (not just "FM N")
      if (!inst.name.match(/^FM \d+$/)) {
        warnings.push(`FM instrument ${i + 1} "${inst.name}": OPL2 register data not preserved`);
      }
    }
  }

  // ── Encode patterns ──────────────────────────────────────────────────────

  const usedPatternIndices = new Set<number>();
  for (const pos of song.songPositions) {
    usedPatternIndices.add(pos);
  }

  const encodedPatterns: Uint8Array[] = [];
  for (let pat = 0; pat < NUM_PATTERNS; pat++) {
    const songPat = song.patterns[pat];
    if (!songPat || !usedPatternIndices.has(pat) && pat >= song.patterns.length) {
      // Empty pattern — just end marker
      encodedPatterns.push(new Uint8Array([0x60]));
      continue;
    }

    if (!songPat) {
      encodedPatterns.push(new Uint8Array([0x60]));
      continue;
    }

    // Build allChannelRows array for encodeC67Pattern
    const numRows = Math.min(songPat.length, ROWS_PER_PATTERN);
    const allChannelRows = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const channelData = songPat.channels[ch];
      if (!channelData) {
        return Array.from({ length: numRows }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        }));
      }
      return channelData.rows.slice(0, numRows);
    });

    encodedPatterns.push(encodeC67Pattern(allChannelRows, numRows));
  }

  // ── Compute pattern offsets ──────────────────────────────────────────────

  const patOffsets: number[] = [];
  const patLengths: number[] = [];
  let runningOffset = 0;

  for (let i = 0; i < NUM_PATTERNS; i++) {
    const encoded = encodedPatterns[i];
    patOffsets.push(runningOffset);
    patLengths.push(encoded.length);
    runningOffset += encoded.length;
  }

  const totalPatternData = runningOffset;

  // ── Compute total sample data size ───────────────────────────────────────

  const totalSampleData = samplePCMs.reduce((sum, pcm) => sum + pcm.length, 0);

  // ── Build output buffer ──────────────────────────────────────────────────

  const totalSize = PAT_DATA_BASE + totalPatternData + totalSampleData;
  const output = new Uint8Array(totalSize);

  // ── Write header (1954 bytes) ────────────────────────────────────────────

  writeU8(output, 0, speed);
  writeU8(output, 1, restartPos);

  // Sample names: 32 x 13 bytes at offset 2
  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    writeString(output, 2 + i * 13, sampleNames[i], 13);
  }

  // Sample headers: 32 x 16 bytes at offset 418
  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    const base = 418 + i * 16;
    writeU32LE(output, base, 0); // unknown field = 0
    writeU32LE(output, base + 4, sampleHeaders[i].length);
    writeU32LE(output, base + 8, sampleHeaders[i].loopStart);
    writeU32LE(output, base + 12, sampleHeaders[i].loopEnd);
  }

  // FM instrument names: 32 x 13 bytes at offset 930
  for (let i = 0; i < NUM_FM_INSTRS; i++) {
    writeString(output, 930 + i * 13, fmNames[i], 13);
  }

  // FM instrument register dumps: 32 x 11 bytes at offset 1346
  for (let i = 0; i < NUM_FM_INSTRS; i++) {
    output.set(fmRegDumps[i], 1346 + i * 11);
  }

  // Order list: 256 bytes at offset 1698
  for (let i = 0; i < 256; i++) {
    if (i < song.songPositions.length) {
      writeU8(output, 1698 + i, song.songPositions[i]);
    } else {
      writeU8(output, 1698 + i, 0xFF); // end marker
    }
  }

  // ── Write pattern offset/length tables (at HDR_SIZE = 1954) ──────────────

  for (let i = 0; i < NUM_PATTERNS; i++) {
    writeU32LE(output, HDR_SIZE + i * 4, patOffsets[i]);
    writeU32LE(output, HDR_SIZE + 512 + i * 4, patLengths[i]);
  }

  // ── Write pattern data (at PAT_DATA_BASE = 2978) ─────────────────────────

  let patCursor = PAT_DATA_BASE;
  for (let i = 0; i < NUM_PATTERNS; i++) {
    output.set(encodedPatterns[i], patCursor);
    patCursor += encodedPatterns[i].length;
  }

  // ── Write sample PCM data ────────────────────────────────────────────────

  let sampleCursor = PAT_DATA_BASE + totalPatternData;
  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    output.set(samplePCMs[i], sampleCursor);
    sampleCursor += samplePCMs[i].length;
  }

  // ── Return result ────────────────────────────────────────────────────────

  const baseName = (song.name ?? 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '');
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.c67`,
    warnings,
  };
}
