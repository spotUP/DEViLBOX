/**
 * UFOParser.ts — MicroProse UFO format (.ufo / .mus) native parser
 *
 * UFO is a 4-channel Amiga music format created by MicroProse (1994),
 * used in games like UFO: Enemy Unknown (X-COM). It uses IFF structure
 * with a custom DDAT form type.
 *
 * Two-file format: song data (*.mus) + samples (SMP.set).
 * This parser handles song data only; UADE handles actual audio playback.
 *
 * Detection (from UADE DTP_Check2):
 *   bytes[0..3]   = 'FORM' (IFF magic)
 *   bytes[8..11]  = 'DDAT' (form type)
 *   bytes[12..15] = 'BODY' (first chunk)
 *   bytes[20..23] = 'CHAN' (channel chunk)
 *
 * File structure (IFF-based):
 *   [0..3]    'FORM'
 *   [4..7]    u32BE total size
 *   [8..11]   'DDAT' (data type identifier)
 *   [12..15]  'BODY' (chunk name)
 *   [16..19]  u32BE body size
 *   [20..23]  'CHAN' (channel count chunk)
 *   [24..27]  u32BE chan chunk size
 *   [28..31]  u32BE channel count (always 4)
 *
 * The format supports up to 40 samples (hardcoded in SampleInit: moveq #39,D5).
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/UFO/src/UFO_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// -- Constants ----------------------------------------------------------------

/** Maximum number of samples supported by the UFO player (SampleInit: moveq #39,D5). */
const UFO_MAX_SAMPLES = 40;

/** Minimum buffer size to contain the IFF header up through the CHAN chunk value. */
const UFO_MIN_HEADER_SIZE = 32;

// -- Utility ------------------------------------------------------------------

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off]     << 24) |
     (buf[off + 1] << 16) |
     (buf[off + 2] <<  8) |
      buf[off + 3]) >>> 0
  );
}

function fourCC(buf: Uint8Array, off: number): string {
  return (
    String.fromCharCode(buf[off]) +
    String.fromCharCode(buf[off + 1]) +
    String.fromCharCode(buf[off + 2]) +
    String.fromCharCode(buf[off + 3])
  );
}

// -- Format detection ---------------------------------------------------------

/**
 * Detect whether the buffer is a UFO/MicroProse IFF-DDAT song file.
 *
 * All four IFF markers must be present at their exact offsets (matching the
 * UADE DTP_Check2 detection routine in UFO_v1.asm):
 *   bytes[0..3]   = 'FORM'
 *   bytes[8..11]  = 'DDAT'
 *   bytes[12..15] = 'BODY'
 *   bytes[20..23] = 'CHAN'
 *
 * @param buf - Raw file bytes (Uint8Array)
 */
export function isUFOFormat(buf: Uint8Array): boolean {
  if (buf.length < UFO_MIN_HEADER_SIZE) return false;

  if (fourCC(buf,  0) !== 'FORM') return false;
  if (fourCC(buf,  8) !== 'DDAT') return false;
  if (fourCC(buf, 12) !== 'BODY') return false;
  if (fourCC(buf, 20) !== 'CHAN') return false;

  return true;
}

// -- Empty pattern helpers ----------------------------------------------------

function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function createEmptyPattern(filename: string) {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: 'channel-' + ch,
      name: 'Channel ' + (ch + 1),
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      // Amiga standard LRRL stereo panning
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat:            'MOD',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    4,
      originalPatternCount:    1,
      originalInstrumentCount: UFO_MAX_SAMPLES,
    },
  };
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a UFO/MicroProse song file into a TrackerSong.
 *
 * Only the IFF header is decoded here — actual audio is produced by UADE
 * using the companion SMP.set sample archive. All 40 instrument slots are
 * created as named placeholders so that the tracker can display them.
 *
 * @param buffer   - Raw file ArrayBuffer
 * @param filename - Original filename (used to derive the module name)
 */
export async function parseUFOFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isUFOFormat(buf)) {
    throw new Error('Buffer is not a UFO/MicroProse DDAT song file');
  }

  // -- IFF header fields -----------------------------------------------------
  // [4..7]  total FORM size (excludes the leading 8 bytes 'FORM' + size field)
  const formSize = u32BE(buf, 4);

  // [24..27] CHAN chunk data size (always 4 — one u32BE channel count)
  // [28..31] channel count (always 4 for this player)
  const channelCount = u32BE(buf, 28);
  const numChannels = channelCount > 0 && channelCount <= 16 ? channelCount : 4;

  // -- Derive module name from filename ----------------------------------------
  const baseName = filename.split('/').pop() ?? filename;
  // Strip extension (.mus, .ufo, or any suffix after the last dot)
  const moduleName = baseName.replace(/\.[^.]+$/, '') || baseName;

  // -- Build placeholder instruments ------------------------------------------
  // The UFO player hardcodes 40 sample slots (SampleInit: moveq #39,D5 = 40).
  // Samples live in the companion SMP.set file, so we create named placeholders.
  const instruments: InstrumentConfig[] = Array.from(
    { length: UFO_MAX_SAMPLES },
    (_, i) => ({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
      metadata: {
        ufoSample: {
          index: i,
          formSize,
          channelCount: numChannels,
        },
      },
    } as InstrumentConfig),
  );

  // -- Single empty pattern (song data is in the BODY chunks; UADE plays it) ---
  const pattern = createEmptyPattern(filename);

  return {
    name: `${moduleName} [UFO/MicroProse] (${numChannels}ch)`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
