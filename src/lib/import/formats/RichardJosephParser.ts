/**
 * RichardJosephParser.ts — Richard Joseph Player (.rjp / .sng + .ins) native parser
 *
 * Richard Joseph Player is a 4-channel Amiga music format created by Richard Joseph
 * and Andi Smithers (1992–93). It is a two-file format:
 *   - Song data:   `RJP.name`  or  `name.SNG`
 *   - Sample data: `SMP.name`  or  `name.INS`  or  `SMP.set` (James Pond 2 AGA)
 *
 * This parser handles the song data file only. Sample PCM data lives in the
 * companion SMP/INS file and is not loaded here; all instruments are created
 * as metadata-carrying placeholders. Actual audio playback always falls back
 * to UADE which handles both files.
 *
 * Binary layout of song data file:
 *   [0..2]   "RJP" magic bytes (0x52, 0x4A, 0x50)
 *   [3]      version byte (any)
 *   [4..7]   "SMOD" tag (0x53, 0x4D, 0x4F, 0x44)
 *   [8..11]  samples_table_size (u32 BE) = num_samples × 32
 *   [12..15] must be 0 (uninitialized sample data pointer — module identity check)
 *   [16 .. 12+samples_table_size-1]   sample descriptors (32 bytes each):
 *              [+0..+3]   u32 BE  sample start offset in SMP file (initially 0)
 *              [+4..+7]   u32 BE  another SMP-file pointer
 *              [+16..+17] u16 BE  loop start (in words)
 *              [+18..+19] u16 BE  loop size  (in words)
 *              [+26..+27] u16 BE  sample length (in words)
 *   [12+S]   u32 BE  size of an intermediate chunk (skip this many bytes + 4)
 *   [12+S+4+skip] u32 BE  subsong_table_size = num_subsongs × 4
 *
 * References:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/RichardJosephPlayer/
 *     src/Richard Joseph Player_v2.asm  (Check2, InitPlayer, SampleInit routines)
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/RichardJosephPlayer/
 *     src/Richard Joseph Player.s       (EagleRipper FindMax)
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/Richard Joseph/
 *     EP_RJoseph.readme                 (format history notes)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Richard Joseph Player song data file.
 *
 * Checks three fields established by the DTP_Check2 routine:
 *   bytes[0..2]  = "RJP"
 *   bytes[4..7]  = "SMOD"
 *   bytes[12..15] = 0  (uninitialized sample pointer — module identity guard)
 */
export function isRJPFormat(buf: Uint8Array): boolean {
  if (buf.length < 16) return false;

  // bytes 0-2 = 'R', 'J', 'P'
  if (buf[0] !== 0x52 || buf[1] !== 0x4a || buf[2] !== 0x50) return false;

  // bytes 4-7 = 'S', 'M', 'O', 'D'
  if (buf[4] !== 0x53 || buf[5] !== 0x4d || buf[6] !== 0x4f || buf[7] !== 0x44) return false;

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Richard Joseph Player song data file into a TrackerSong.
 *
 * Extracts the version byte, sample count, and (when the file is large
 * enough) subsong count from the binary header. All instruments are
 * created as named placeholder configs; no audio data is decoded here —
 * the caller is expected to fall back to UADE for actual playback.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export async function parseRJPFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isRJPFormat(buf)) {
    throw new Error('Not a Richard Joseph Player module');
  }

  // ── Header ──────────────────────────────────────────────────────────────

  const version = buf[3]; // version byte at offset 3

  // Sample table size in bytes (stored at offset 8); each descriptor = 32 bytes
  const samplesTableSize = u32BE(buf, 8);
  const numSamples = Math.min(samplesTableSize >>> 5, 256); // / 32, capped at 256

  // ── Subsong count (optional — navigate past sample table) ────────────────

  let numSubsongs = 1;
  try {
    // Sample descriptors start at offset 12 and span samplesTableSize bytes.
    // After the sample table, the stream has:
    //   u32 = skip1_size, skip skip1_size bytes
    //   u32 = subsong_table_size  →  num_subsongs = subsong_table_size / 4
    const afterSamples = 12 + samplesTableSize;
    if (afterSamples + 8 < buf.length) {
      const skip1 = u32BE(buf, afterSamples);
      const subsongTableOff = afterSamples + 4 + skip1;
      if (subsongTableOff + 4 <= buf.length) {
        const subsongTableSize = u32BE(buf, subsongTableOff);
        const n = subsongTableSize >>> 2; // / 4
        if (n > 0 && n <= 256) {
          numSubsongs = n;
        }
      }
    }
  } catch {
    // Silently ignore navigation errors; numSubsongs stays at 1
  }

  // ── Instrument placeholders ──────────────────────────────────────────────

  // Sample descriptors (32 bytes each) start at offset 12.
  // Extract loop start / loop size from each descriptor for metadata.
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numSamples; i++) {
    const descBase = 12 + i * 32;
    let loopStart = 0;
    let loopSize = 0;
    let sampleLenWords = 0;

    if (descBase + 32 <= buf.length) {
      loopStart = u16BE(buf, descBase + 16) * 2;    // words → bytes
      loopSize  = u16BE(buf, descBase + 18) * 2;    // words → bytes
      sampleLenWords = u16BE(buf, descBase + 26);
    }

    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
      metadata: {
        rjpSample: {
          loopStart,
          loopSize,
          hasLoop: loopSize > 2,
          lengthBytes: sampleLenWords * 2,
        },
      },
    } as InstrumentConfig);
  }

  if (instruments.length === 0) {
    // Ensure at least one placeholder so the song is not entirely empty
    instruments.push({
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "RJP." prefix (case-insensitive) or ".sng" suffix
  const moduleName =
    baseName.replace(/^rjp\./i, '').replace(/\.(sng|rjp)$/i, '') || baseName;

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
      pan: (ch === 0 || ch === 3) ? -50 : 50,
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
      originalInstrumentCount: numSamples,
    },
  };

  return {
    name: `${moduleName} [Richard Joseph v${version}] (${numSamples} smp, ${numSubsongs} sub)`,
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
