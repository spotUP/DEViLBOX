/**
 * WantedTeamUtils.ts — Shared utilities for Wanted Team wrapped module formats.
 *
 * Many Amiga music formats were ripped and adapted by the Wanted Team into a
 * standardized wrapper format:
 *
 *   [AmigaOS HUNK header] → code section containing:
 *     [4B security stub: moveq #-1,D0; rts = 0x70FF4E75]
 *     [Magic string (variable length)]
 *     [Pointer table (format-specific)]
 *     [Embedded replay code + pattern/song data]
 *     [Sample data (PCM)]
 *
 * The pointer table contains longwords pointing to routines (Play, Init),
 * string labels (ModuleName, AuthorName), SampleInfo, and size fields.
 * Pointers are relative to the start of the code section (unrelocated).
 */

// ── Binary helpers ─────────────────────────────────────────────────────────

export function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── AmigaOS HUNK parsing ──────────────────────────────────────────────────

const HUNK_HEADER = 0x000003F3;
const HUNK_CODE   = 0x000003E9;
const HUNK_DATA   = 0x000003EA;
const HUNK_BSS    = 0x000003EB;
const HUNK_RELOC32 = 0x000003EC;
const HUNK_END    = 0x000003F2;

/**
 * Find the offset and size of the first CODE or DATA section in an AmigaOS
 * HUNK executable. Returns null if the file is not a valid HUNK file.
 */
export function findHunkCodeSection(buf: Uint8Array): { offset: number; size: number } | null {
  if (buf.length < 24) return null;
  if (u32BE(buf, 0) !== HUNK_HEADER) return null;

  // HUNK_HEADER: resident_libs (0), num_hunks, first_hunk, last_hunk, hunk_sizes[]
  let pos = 4;
  const residentLibs = u32BE(buf, pos); pos += 4;
  if (residentLibs !== 0) return null; // skip resident libs (should be 0)

  const numHunks = u32BE(buf, pos); pos += 4;
  if (numHunks === 0 || numHunks > 100) return null;

  pos += 4; // firstHunk
  pos += 4; // lastHunk

  // Skip hunk size table
  for (let i = 0; i < numHunks; i++) {
    if (pos + 4 > buf.length) return null;
    pos += 4;
  }

  // Walk hunks to find first CODE or DATA section
  while (pos + 8 <= buf.length) {
    const hunkType = u32BE(buf, pos) & 0x3FFFFFFF; // mask MEMF flags
    pos += 4;

    if (hunkType === HUNK_CODE || hunkType === HUNK_DATA) {
      const sizeInLongs = u32BE(buf, pos); pos += 4;
      const sizeInBytes = sizeInLongs * 4;
      if (pos + sizeInBytes > buf.length) return null;
      return { offset: pos, size: sizeInBytes };
    }

    if (hunkType === HUNK_BSS) {
      pos += 4; // skip size
      continue;
    }

    if (hunkType === HUNK_RELOC32) {
      // Skip relocation entries
      while (pos + 4 <= buf.length) {
        const count = u32BE(buf, pos); pos += 4;
        if (count === 0) break;
        pos += 4; // target hunk
        pos += count * 4; // offsets
      }
      continue;
    }

    if (hunkType === HUNK_END) {
      continue;
    }

    // Unknown hunk type — skip
    break;
  }

  return null;
}

// ── Wanted Team Header Parsing ────────────────────────────────────────────

/** Security stub: moveq #-1,D0; rts */
const SECURITY_STUB = 0x70FF4E75;

/**
 * Check if a buffer position has the Wanted Team security stub (0x70FF4E75)
 * followed by the expected magic string.
 */
export function matchWTMagic(buf: Uint8Array, codeStart: number, magic: string): boolean {
  if (codeStart + 4 + magic.length > buf.length) return false;
  if (u32BE(buf, codeStart) !== SECURITY_STUB) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[codeStart + 4 + i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Read a null-terminated ASCII string from the buffer.
 * Returns empty string if the offset is out of bounds or zero.
 */
export function readString(buf: Uint8Array, codeStart: number, ptr: number, maxLen = 128): string {
  const off = codeStart + ptr;
  if (ptr === 0 || off < 0 || off >= buf.length) return '';
  const bytes: number[] = [];
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const b = buf[off + i];
    if (b === 0) break;
    if (b === 10) { bytes.push(32); continue; } // newline → space
    if (b >= 32 && b < 127) bytes.push(b);
  }
  return String.fromCharCode(...bytes).trim();
}

/**
 * Extract 8-bit signed PCM sample data from a module.
 * The sample area is at the end of the code section, sized by `sampleSize`.
 */
export function extractSamplePCM(
  buf: Uint8Array,
  codeStart: number,
  codeSize: number,
  sampleSize: number,
): Uint8Array | null {
  if (sampleSize <= 0 || sampleSize > codeSize) return null;
  const sampleStart = codeStart + codeSize - sampleSize;
  if (sampleStart < codeStart || sampleStart + sampleSize > buf.length) return null;
  return buf.slice(sampleStart, sampleStart + sampleSize);
}

/**
 * Find the Wanted Team security stub + magic anywhere in the file (fallback
 * when HUNK parsing fails — for raw binary modules without hunk headers).
 */
export function scanForMagic(buf: Uint8Array, magic: string): number {
  const searchEnd = Math.min(buf.length - 4 - magic.length, 4096);
  for (let i = 0; i < searchEnd; i += 2) {
    if (matchWTMagic(buf, i, magic)) return i;
  }
  return -1;
}
