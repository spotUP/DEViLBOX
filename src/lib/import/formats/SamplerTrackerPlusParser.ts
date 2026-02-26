/**
 * SamplerTrackerPlusParser.ts — Soundtracker Pro II (.stp) format detector
 *
 * Soundtracker Pro II (also known as Sampler Tracker Plus) is an Amiga tracker
 * by Olaf Barthel and Chris Hülsbeck (1990). It extends ProTracker with multiple
 * sample loops, fractional speed values, MIDI, and combined auto-effects.
 *
 * Three file versions exist, all sharing the "STP3" magic and a 204-byte header:
 *   Version 0 — earliest; reserved fields after loopLength are always 0
 *   Version 1 — adds defaultPeriod, finetune fields
 *   Version 2 — adds extended data and additional song info
 *   Version 3 — later extension (same core structure)
 *
 * File header layout (204 bytes, big-endian):
 *   +0    magic[4]         — "STP3"
 *   +4    version          (uint16BE; 0, 1, or 2)
 *   +6    numOrders        (uint8, 1–128)
 *   +7    patternLength    (uint8, rows per pattern; typically 64)
 *   +8    orderList[128]   (uint8 each, pattern index)
 *   +136  speed            (uint16BE, initial ticks per row)
 *   +138  speedFrac        (uint16BE, fractional speed)
 *   +140  timerCount       (uint16BE)
 *   +142  flags            (uint16BE)
 *   +144  reserved         (uint32BE)
 *   +148  midiCount        (uint16BE, always 50)
 *   +150  midi[50]         (uint8 each)
 *   +200  numSamples       (uint16BE, 1–31)
 *   +202  sampleStructSize (uint16BE)
 *
 * Then: numSamples × STPSampleHeader (variable size = sampleStructSize):
 *   +0   length     (uint32BE, bytes)
 *   +4   volume     (uint8, 0–64)
 *   +5   reserved1  (uint8)
 *   +6   loopStart  (uint32BE, bytes)
 *   +10  loopLength (uint32BE, bytes)
 *   +14  defaultCommand (uint16BE, ignored for playback)
 *   +16  defaultPeriod  (uint16BE; version ≥1 only)
 *   +18  finetune       (uint8; version ≥1 only)
 *   +19  reserved2      (uint8)
 *   [version ≥2: additional extension data up to sampleStructSize]
 *
 * Then: pattern blocks, then sample names, then sample PCM data.
 *
 * Reference: OpenMPT Load_stp.cpp (Devin Acker, OpenMPT Devs)
 *   "To create shorter patterns, simply create shorter patterns." — STP manual
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16be(v: DataView, off: number): number { return v.getUint16(off, false); }

function readFourCC(v: DataView, off: number): string {
  return String.fromCharCode(
    v.getUint8(off),
    v.getUint8(off + 1),
    v.getUint8(off + 2),
    v.getUint8(off + 3),
  );
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer starts with the "STP3" magic and has a valid header.
 */
export function isSTPFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 204) return false;
  const v = new DataView(buffer);
  if (readFourCC(v, 0) !== 'STP3') return false;

  const version    = u16be(v, 4);
  const numOrders  = u8(v, 6);
  const numSamples = u16be(v, 200);

  if (version > 3)           return false;
  if (numOrders < 1 || numOrders > 128) return false;
  if (numSamples < 1 || numSamples > 31) return false;

  return true;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * STP has complex multiple-loop structures, fractional speed values, and
 * combined auto-effects. Native parsing is deferred to OpenMPT which
 * implements the full STP spec.
 */
export async function parseSTPFile(
  _buffer: ArrayBuffer,
  _filename: string,
): Promise<TrackerSong> {
  throw new Error('[SamplerTrackerPlusParser] Delegating to OpenMPT for full STP support');
}
