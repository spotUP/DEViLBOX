/**
 * EasyTraxParser.ts — EarAche (.ea / .mg) module loader
 *
 * EarAche is an Amiga music format by Søren Andersen. Files begin with
 * the 4-byte magic 'EASO'. The UADE player supports extensions .ea and .mg.
 *
 * Binary layout (big-endian):
 *   +0   magic[4]        — 'EASO'
 *   +4   uint32 BE       — offset to sequence/order data (relative to file start)
 *   +8   uint32 BE       — offset to voice-1 pattern data
 *   +12  uint32 BE       — offset to voice-2 pattern data
 *   +16  uint32 BE       — offset to voice-3 pattern data
 *   +20  uint32 BE       — offset to voice-4 pattern data
 *   +24  uint32 BE       — offset to sample data
 *
 * Channels: 4 (Amiga LRRL panning: ch0/3 left, ch1/2 right)
 * Actual audio is delegated to UADE; this parser creates a metadata-only stub.
 *
 * Reference: UADE eagleplayer.conf — EarAche  prefixes=ea,mg
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const EASO_MAGIC   = 'EASO';
const NUM_CHANNELS = 4;
const MIN_HDR_SIZE = 28; // 4 + 6*4 bytes

// ── Binary helpers ────────────────────────────────────────────────────────────

function readFourCC(bytes: Uint8Array, off: number): string {
  return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer starts with the EarAche 'EASO' magic.
 */
export function isEasyTraxFormat(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_HDR_SIZE) return false;
  return readFourCC(bytes, 0) === EASO_MAGIC;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an EarAche (.ea) module into a metadata-only TrackerSong stub.
 * Actual audio playback is delegated to UADE.
 * Returns null if the buffer is not recognised as EarAche format.
 */
export function parseEasyTraxFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isEasyTraxFormat(bytes)) return null;

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
      sourceFormat:            'EA' as const,
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name:            `${songName} [EarAche]`,
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
