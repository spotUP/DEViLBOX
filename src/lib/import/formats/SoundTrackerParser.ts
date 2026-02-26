/**
 * SoundTrackerParser.ts — Original SoundTracker (.stk) format detector
 *
 * The original SoundTracker by Karsten Obarski (1987) is the ancestor of all
 * ProTracker MOD formats. It uses 15 sample slots and 4 channels. Unlike later
 * MOD formats it has NO magic bytes — identification is entirely structural.
 *
 * The format has evolved through multiple versions:
 *   UST 1.0–1.21  (K. Obarski) — no finetune, restartPos used as tempo
 *   UST 1.8–2.0   (K. Obarski) — same structure
 *   ST 2.0        (The Exterminator / D.O.C.) — D.O.C. SoundTracker II
 *   ST III        (Il Scuro / Defjam) — Defjam SoundTracker III / Alpha Flight ST IV
 *   ST IX         (D.O.C.) — D.O.C. SoundTracker IX
 *   MST 1.00      (Tip / The New Masters) — Master SoundTracker 1.0
 *   ST 2.00–2.2   (Unknown / D.O.C.)
 *
 * Binary layout (header is exactly 600 bytes):
 *   +0    songname[20]          — null-padded ASCII title
 *   +20   15 × sample header (30 bytes each = 450 bytes):
 *           +0  name[22]        — null-padded sample name
 *           +22 length          (uint16BE, in words; max 37000)
 *           +24 finetune        (uint8; UST modules: must be 0)
 *           +25 volume          (uint8, 0–64)
 *           +26 loopStart       (uint16BE, in words)
 *           +28 loopLength      (uint16BE, in words; ≥1)
 *   +470  numOrders             (uint8, 1–128)
 *   +471  restartPos            (uint8, ≤220; early ST uses this as tempo)
 *   +472  orderList[128]        (uint8 each, pattern index 0–63)
 *   +600  pattern data (numPatterns × 64 rows × 4 channels × 4 bytes)
 *   followed by sample PCM data (8-bit signed, big-endian)
 *
 * Pattern cell (4 bytes — standard ProTracker encoding):
 *   byte0 bits[7:4] = inst high nibble; bits[3:0] = period high nibble
 *   byte1           = period low byte
 *   byte2 bits[7:4] = inst low nibble;  bits[3:0] = effect
 *   byte3           = effect parameter
 *
 * Heuristic detection rules (from OpenMPT Load_stk.cpp):
 *   - ≤48 invalid ASCII chars across title + all sample names
 *   - ≤5 invalid chars in title alone (unless ≥4 valid sample names)
 *   - All sample volumes ≤64
 *   - All sample lengths ≤37000 words
 *   - At least one sample with non-zero length and volume
 *   - numOrders 1–128, restartPos ≤220
 *   - All pattern indices ≤63
 *   - File large enough to hold all referenced patterns
 *
 * Reference: OpenMPT Load_stk.cpp, Fraggie's SoundTracker analysis
 *            https://www.un4seen.com/forum/?topic=14471.msg100829
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16be(v: DataView, off: number): number { return v.getUint16(off, false); }

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Count characters outside printable ASCII (0x20–0x7E) and not null. */
function countInvalidChars(v: DataView, off: number, len: number): number {
  let count = 0;
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch !== 0 && (ch < 0x20 || ch > 0x7E)) count++;
  }
  return count;
}

/** Classify sample name: returns 'validASCII', 'allNull', or 'invalid'. */
function classifyName(v: DataView, off: number, len: number): 'validASCII' | 'allNull' | 'invalid' {
  let allNull = true;
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch !== 0) {
      allNull = false;
      if (ch < 0x20 || ch > 0x7E) return 'invalid';
    }
  }
  return allNull ? 'allNull' : 'validASCII';
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer matches the original SoundTracker heuristics.
 * Detection is entirely structural — STK has no magic bytes.
 */
export function isSoundTrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 600) return false;
  const v = new DataView(buffer);

  let invalidCharsInTitle = countInvalidChars(v, 0, 20);
  let invalidChars        = invalidCharsInTitle;
  let totalSampleLen      = 0;
  let allVolumes          = 0;
  let validNameCount      = 0;
  let hasInvalidNames     = false;

  for (let s = 0; s < 15; s++) {
    const base     = 20 + s * 30;
    const length   = u16be(v, base + 22);
    const finetune = u8(v, base + 24);
    const volume   = u8(v, base + 25);

    invalidChars += countInvalidChars(v, base, 22);
    // Early ST had no finetune — any non-zero value is suspicious
    if (finetune !== 0) invalidChars += 16;

    const nameClass = classifyName(v, base, 22);
    if (nameClass === 'validASCII') validNameCount++;
    else if (nameClass === 'invalid') hasInvalidNames = true;

    // Hard limits
    if (volume > 64 || length > 37000) return false;
    if (invalidChars > 48)             return false;

    totalSampleLen += length;
    allVolumes |= volume;
  }

  // Reject scramble_2.mod-style garbage titles when sample names are also bad
  if (invalidCharsInTitle > 5 && (validNameCount < 4 || hasInvalidNames)) return false;

  // Must have at least one audible sample
  if (totalSampleLen === 0 || allVolumes === 0) return false;

  // Order list sanity
  const numOrders  = u8(v, 470);
  const restartPos = u8(v, 471);
  if (numOrders < 1 || numOrders > 128) return false;
  if (restartPos > 220)                 return false;

  let maxPat = 0;
  for (let i = 0; i < 128; i++) {
    const p = u8(v, 472 + i);
    if (p > 63) return false;
    if (p > maxPat) maxPat = p;
  }

  // File must be large enough to hold all referenced patterns + at least header
  const numPatterns  = maxPat + 1;
  const minFileSize  = 600 + numPatterns * 64 * 4 * 4;
  if (buffer.byteLength < minFileSize) return false;

  return true;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Route to UADE for authentic SoundTracker playback. The original SoundTracker
 * has unique tempo/effect semantics that UADE replicates faithfully from the
 * original 68k player binary.
 */
export async function parseSoundTrackerFile(
  _buffer: ArrayBuffer,
  _filename: string,
): Promise<TrackerSong> {
  throw new Error('[SoundTrackerParser] Delegating to UADE for authentic SoundTracker playback');
}
