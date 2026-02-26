/**
 * AMFParser.ts — AMF format detector (ASYLUM Music Format + DSMI Advanced Music Format)
 *
 * Two distinct formats share the .amf extension:
 *
 * 1. ASYLUM Music Format
 *    Used in Crusader: No Remorse, Crusader: No Regret (Origin Systems, 1995–96).
 *    Fixed 8-channel, 64-sample, 64-pattern format.
 *
 *    Header (38 bytes):
 *      +0   signature[32] — "ASYLUM Music Format V1.0\0" (null at byte 24)
 *      +32  defaultSpeed  (uint8)
 *      +33  defaultTempo  (uint8, BPM)
 *      +34  numSamples    (uint8, 0–64)
 *      +35  numPatterns   (uint8, 0–64)
 *      +36  numOrders     (uint8)
 *      +37  restartPos    (uint8)
 *    Then: 256-byte order list (uint8 each)
 *    Then: 64 × AsylumSampleHeader (37 bytes each):
 *            name[22] + finetune(uint8LE) + volume(uint8LE) + transpose(int8LE) +
 *            length(uint32LE) + loopStart(uint32LE) + loopLength(uint32LE)
 *    Then: numPatterns × pattern blocks (64 rows × 8 channels × 4 bytes)
 *    Then: sample PCM data (8-bit signed, little-endian)
 *
 * 2. DSMI Advanced Music Format (used in various DOS games, e.g. Pinball World)
 *    Magic: "AMF" (3 bytes) followed by version byte at offset 3.
 *    Versions 8–14 are supported by OpenMPT.
 *    Variable number of channels (up to 32), 16-bit little-endian samples.
 *
 *    Header (at least 5 bytes):
 *      +0   "AMF" (3 bytes)
 *      +3   version (uint8, 8–14)
 *      +4   songTitle[32] (versions ≥10 only)
 *      ... (structure varies by version)
 *
 * 3. DMF variant (used in Webfoot games: Tronic, H2O, PowBall)
 *    Similar to DSMI AMF but with song/sample names removed and delta-encoded samples.
 *    Magic: "AMF" + version, same detection as DSMI AMF.
 *
 * Reference: OpenMPT Load_amf.cpp (Olivier Lapicque, OpenMPT Devs)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number { return v.getUint8(off); }

// ── Format detection ──────────────────────────────────────────────────────────

/** Returns true if buffer matches the ASYLUM Music Format signature. */
function isAsylumAMF(v: DataView, size: number): boolean {
  if (size < 38) return false;
  // Signature: "ASYLUM Music Format V1.0" + null byte at offset 24
  const expected = 'ASYLUM Music Format V1.0\0';
  for (let i = 0; i < 25; i++) {
    if (v.getUint8(i) !== expected.charCodeAt(i)) return false;
  }
  const numSamples = u8(v, 34);
  return numSamples <= 64;
}

/** Returns true if buffer matches the DSMI "AMF" magic with valid version. */
function isDSMI_AMF(v: DataView, size: number): boolean {
  if (size < 4) return false;
  if (v.getUint8(0) !== 0x41 || v.getUint8(1) !== 0x4D || v.getUint8(2) !== 0x46) return false; // "AMF"
  const version = u8(v, 3);
  return version >= 8 && version <= 14;
}

/**
 * Returns true if the buffer is either an ASYLUM AMF or DSMI AMF module.
 */
export function isAMFFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const v = new DataView(buffer);
  return isAsylumAMF(v, buffer.byteLength) || isDSMI_AMF(v, buffer.byteLength);
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * AMF covers multiple format variants (ASYLUM, DSMI, DMF) with different channel
 * counts and effect systems. Native parsing is deferred to OpenMPT which
 * implements all AMF variants with correct effect translation.
 */
export async function parseAMFFile(
  _buffer: ArrayBuffer,
  _filename: string,
): Promise<TrackerSong> {
  throw new Error('[AMFParser] Delegating to OpenMPT for full ASYLUM/DSMI AMF support');
}
