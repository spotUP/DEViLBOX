/**
 * MadnessParser.ts — Digitrakker / MDL (.mdl) format detector
 *
 * Digitrakker (also called "Madness Tracker") is a PC DOS tracker by Marc
 * Espie and others. Files start with the "DMDL" magic followed by a version
 * byte, then a series of IFF-style 16-bit-ID chunks.
 *
 * File layout (little-endian throughout):
 *   +0    "DMDL" (4 bytes) — file identifier
 *   +4    version (uint8)  — format version (values: 0, 0x10, 0x11, 0x12, 0x20)
 *   +5    IFF-style chunks (each 6 bytes header):
 *           id     (uint16LE, 2-char ASCII)
 *           length (uint32LE, chunk data size, not counting this 6-byte header)
 *
 *   Chunk IDs (2-byte little-endian ASCII):
 *     "IN"  — MDLInfoBlock:
 *               title[32] + composer[20] + numOrders(uint16LE) + restartPos(uint16LE) +
 *               globalVol(uint8) + speed(uint8) + tempo(uint8) + chnSetup[32]
 *     "ME"  — message text
 *     "PA"  — pattern list (numOrders × uint8 pattern indices, then numPatterns blocks)
 *     "PN"  — pattern names
 *     "TR"  — track data (MDL uses a track-per-channel-per-pattern approach with LZW compression)
 *     "II"  — instrument list
 *     "VE"  — volume envelopes
 *     "PE"  — panning envelopes
 *     "FE"  — frequency envelopes
 *     "IS"  — sample info
 *     "SA"  — sample data (may use LZW or delta+LZW compression)
 *
 * MDLInfoBlock channel setup byte (per channel):
 *   bit7 = 1 → channel is disabled
 *   bits 6:0 → panning (0=left, 64=center, 127=right)
 *   Number of active channels = highest non-disabled channel index + 1
 *
 * Sample compression in "SA" chunk:
 *   bit0 of sample flags → delta encoded
 *   bit1 of sample flags → LZW compressed (Digitrakker proprietary)
 *
 * Reference: OpenMPT Load_mdl.cpp
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary helpers ────────────────────────────────────────────────────────────

function readFourCC(v: DataView, off: number): string {
  return String.fromCharCode(
    v.getUint8(off),
    v.getUint8(off + 1),
    v.getUint8(off + 2),
    v.getUint8(off + 3),
  );
}

// ── Format detection ──────────────────────────────────────────────────────────

/** Known Digitrakker format versions. */
const VALID_MDL_VERSIONS = new Set([0x00, 0x10, 0x11, 0x12, 0x20]);

/**
 * Returns true if the buffer starts with "DMDL" and has a recognised version byte.
 */
export function isMDLFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const v = new DataView(buffer);
  if (readFourCC(v, 0) !== 'DMDL') return false;
  const version = v.getUint8(4);
  return VALID_MDL_VERSIONS.has(version);
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Digitrakker uses proprietary LZW compression for tracks and sample data,
 * plus complex envelope/instrument structures. Native parsing is deferred to
 * OpenMPT which implements the full MDL spec including decompression.
 */
export async function parseMDLFile(
  _buffer: ArrayBuffer,
  _filename: string,
): Promise<TrackerSong> {
  throw new Error('[MadnessParser] Delegating to OpenMPT for full Digitrakker MDL support');
}
