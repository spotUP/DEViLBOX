/**
 * SpeedySystemParser.ts — Apple IIgs SoundSmith / MegaTracker (.ss) detector
 *
 * SoundSmith was an Apple IIgs music editor by Kyle Hammond. MegaTracker is
 * a variant that shares the same binary layout with a different magic string.
 * Both are tracked with 14 channels and up to 15 instruments, using the
 * Ensoniq ES-5503-DOC wavetable chip for sample playback.
 *
 * Sample data is stored in an external DOC RAM file (extensions: .D, .W,
 * .DOC, .WB, or the generic "DOC.DATA"). These companion files cannot be
 * loaded in a browser without multi-file upload support, so native parsing
 * always falls through to UADE (which bundles the required sample data in its
 * module archive).
 *
 * File header layout (600 bytes, all little-endian):
 *   +0    magic[6]       — "SONGOK" (SoundSmith) / "IAN9OK" / "IAN92a" (MegaTracker)
 *   +6    patBufSize     (uint16LE) — total pattern buffer size in bytes:
 *                          multiple of 14*64 = 896, or exactly 0x8000
 *   +8    speed          (uint16LE, 0–15)
 *   +10   reserved[10]
 *   +20   instruments[15] × SSInstrument (30 bytes each = 450 bytes):
 *           +0  nameLength (uint8)
 *           +1  name[21]
 *           +22 reserved[2]
 *           +24 volume     (uint16LE, 0–255; high byte ignored)
 *           +26 midiProgram  (uint16LE, ignored)
 *           +28 midiVelocity (uint16LE, ignored)
 *   +470  numOrders      (uint16LE, effective count = numOrders & 0xFF, ≤128)
 *   +472  orders[128]    (uint8 each)
 *   +600  pattern notes      buffer (patBufSize bytes)
 *   +600+patBufSize  pattern instrEffect buffer (patBufSize bytes)
 *   +600+2*patBufSize  pattern param buffer (patBufSize bytes)
 *   +600+3*patBufSize  SSFooter (30 bytes): 14 × uint16LE panning + uint16LE flags
 *
 * Reference: OpenMPT Load_ss.cpp
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_MAGICS = ['SONGOK', 'IAN9OK', 'IAN92a'] as const;
const HEADER_SIZE  = 600;

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is an Apple IIgs SoundSmith or MegaTracker module.
 * Detection checks magic bytes, pattern buffer size alignment, and speed range.
 */
export function isSpeedySystemFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const v = new DataView(buffer);

  // Check 6-byte magic
  const magic = String.fromCharCode(
    u8(v, 0), u8(v, 1), u8(v, 2),
    u8(v, 3), u8(v, 4), u8(v, 5),
  );
  if (!(VALID_MAGICS as readonly string[]).includes(magic)) return false;

  // patBufSize must be a multiple of 14*64 = 896, or exactly 0x8000
  const patBufSize = u16le(v, 6);
  if (patBufSize < 14 * 64) return false;
  if (patBufSize !== 0x8000 && patBufSize % (14 * 64) !== 0) return false;

  // Speed must be in range
  const speed = u16le(v, 8);
  if (speed > 15) return false;

  // numOrders (effective) ≤ 128
  const numOrders = u16le(v, 470) & 0xFF;
  if (numOrders > 128) return false;

  // File must be large enough to hold all three pattern buffers
  const minSize = HEADER_SIZE + patBufSize * 3;
  if (buffer.byteLength < minSize) return false;

  return true;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * SoundSmith requires external DOC RAM sample files that cannot be loaded in
 * a browser context. Parsing is always delegated to UADE, which bundles the
 * required samples in its module archive.
 */
export async function parseSpeedySystemFile(
  _buffer: ArrayBuffer,
  _filename: string,
): Promise<TrackerSong> {
  throw new Error('[SpeedySystemParser] External DOC RAM samples required — delegating to UADE');
}
