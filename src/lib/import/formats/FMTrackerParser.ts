/**
 * FMTrackerParser.ts — Tim Follin Player (.tf) Amiga music format parser
 *
 * Tim Follin wrote a proprietary Amiga music player used for Ghouls 'n' Ghosts,
 * Sly Spy, and other Ocean/US Gold games. Files are Amiga executables that start
 * with a BRA opcode followed by the player code and embedded music data.
 *
 * Detection (empirical, from reference files):
 *   byte[0] == 0x60 (BRA short opcode)
 *   byte[1] == 0x1a (displacement = 26; target PC = 0x1c)
 *   byte[0x1c] == 0x10
 *   byte[0x1d] == 0x10
 *
 * The format is a single-file binary (player + data). Actual audio playback
 * is delegated to UADE. This parser creates a metadata-only TrackerSong stub.
 *
 * UADE eagleplayer.conf: TimFollin  prefixes=tf
 *
 * Reference:
 *   UADE players/TimFollin
 *   Reference Music/Follin Player II/Tim Follin/ (empirical analysis)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────────

const NUM_CHANNELS = 4;
const MIN_FILE_SIZE = 0x1e; // need at least 30 bytes for signature check

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a Tim Follin player module.
 *
 * Detection signature (empirical from all reference .tf files):
 *   byte[0] == 0x60  (BRA short opcode)
 *   byte[1] == 0x1a  (displacement 26 → target 0x1c)
 *   byte[0x1c] == 0x10
 *   byte[0x1d] == 0x10
 */
export function isFMTrackerFormat(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_FILE_SIZE) return false;
  return (
    bytes[0] === 0x60 &&
    bytes[1] === 0x1a &&
    bytes[0x1c] === 0x10 &&
    bytes[0x1d] === 0x10
  );
}

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a Tim Follin player module into a metadata-only TrackerSong stub.
 * Actual audio playback is delegated to UADE.
 * Returns null if not recognised as Tim Follin format (never throws).
 */
export function parseFMTrackerFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isFMTrackerFormat(bytes)) return null;

  const songName = filename.replace(/\.[^/.]+$/, '');

  const instruments: InstrumentConfig[] = Array.from({ length: 16 }, (_, i) => ({
    id:        i + 1,
    name:      `Sample ${i + 1}`,
    type:      'synth' as const,
    synthType: 'Synth' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig));

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  // Amiga LRRL panning
  const CHAN_PAN = [-50, 50, 50, -50];

  const pattern = {
    id:      'pattern-0',
    name:    'Pattern 0',
    length:  64,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          CHAN_PAN[ch],
      instrumentId: null,
      color:        null,
      rows:         emptyRows,
    })),
    importMetadata: {
      sourceFormat:            'TF' as const,
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name:            `${songName} [Tim Follin]`,
    format:          'MOD' as TrackerFormat,
    patterns:        [pattern],
    instruments,
    songPositions:   [0],
    songLength:      1,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
