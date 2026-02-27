/**
 * SpeedySystemParser.ts — Speedy System (.ss) and Speedy A1 System (.sas)
 * Amiga music format detector/stub loader
 *
 * Two distinct Amiga formats share this parser:
 *
 * 1. Speedy System (.ss) by Michael Winterberg
 *    Magic: 'SPEEDY-SYSTEM\x00' (14 ASCII bytes) at offset 0.
 *    UADE eagleplayer.conf: SpeedySystem  prefixes=ss
 *
 * 2. Speedy A1 System (.sas) — a variant by the same author
 *    No ASCII magic. Heuristic detection (empirical from reference files):
 *      bytes[0..2]  == 0x00, 0x00, 0x00
 *      bytes[3]     in 1..31  (track/channel count — always small and nonzero)
 *      bytes[14..15] == 0x02, 0x00
 *    UADE eagleplayer.conf: SpeedyA1System  prefixes=sas
 *
 * Actual audio playback is always delegated to UADE. This parser creates a
 * metadata-only TrackerSong stub.
 *
 * Reference: UADE eagleplayer.conf, empirical analysis of reference files.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const SS_MAGIC     = 'SPEEDY-SYSTEM\x00'; // 14 bytes
const NUM_CHANNELS = 4;
const MIN_SS_SIZE  = 14;
const MIN_SAS_SIZE = 16;

// ── Format detection ──────────────────────────────────────────────────────────

function checkSSMagic(buf: Uint8Array): boolean {
  if (buf.length < MIN_SS_SIZE) return false;
  for (let i = 0; i < SS_MAGIC.length; i++) {
    if (buf[i] !== SS_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function checkSASSignature(buf: Uint8Array): boolean {
  if (buf.length < MIN_SAS_SIZE) return false;
  // bytes[0..2] must all be 0x00
  if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) return false;
  // bytes[3] must be a small nonzero value (track/channel count)
  if (buf[3] === 0x00 || buf[3] > 31) return false;
  // bytes[14..15] == 0x02, 0x00 (observed in all reference .sas files)
  if (buf[14] !== 0x02 || buf[15] !== 0x00) return false;
  return true;
}

/**
 * Returns true if the buffer is a Speedy System (.ss) or Speedy A1 System (.sas) module.
 */
export function isSpeedySystemFormat(buffer: ArrayBuffer): boolean {
  const buf = new Uint8Array(buffer);
  return checkSSMagic(buf) || checkSASSignature(buf);
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a Speedy System or Speedy A1 System module into a metadata-only
 * TrackerSong stub. Actual audio playback is delegated to UADE.
 * Returns a resolved promise (never throws).
 */
export async function parseSpeedySystemFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  const isSAS = !checkSSMagic(buf) && checkSASSignature(buf);
  const label = isSAS ? 'Speedy A1 System' : 'Speedy System';

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
      sourceFormat:            'MOD' as const,
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name:            `${songName} [${label}]`,
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
