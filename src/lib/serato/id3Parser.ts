/**
 * Minimal ID3v2 Parser
 *
 * Only extracts GEOB (General Encapsulated Object) frames, which is where
 * Serato stores its metadata (Markers2, Autotags, BeatGrid).
 *
 * ID3v2 header format:
 *   "ID3" (3 bytes) | version (2 bytes) | flags (1 byte) | size (4 bytes syncsafe)
 *
 * Frame format (v2.3/v2.4):
 *   frameId (4 bytes ASCII) | size (4 bytes) | flags (2 bytes) | data
 *
 * GEOB frame data:
 *   encoding (1 byte) | mime-type (null-terminated) | filename (null-terminated) |
 *   description (null-terminated) | binary data
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ID3v2Header {
  version: number;    // 2, 3, or 4
  revision: number;
  flags: number;
  size: number;       // tag size excluding header (10 bytes)
}

export interface GEOBFrame {
  description: string;
  mimeType: string;
  fileName: string;
  data: Uint8Array;
}

// ============================================================================
// SYNCSAFE INTEGER
// ============================================================================

/**
 * Decode a 4-byte syncsafe integer (ID3v2 uses these for sizes).
 * Each byte only uses 7 bits (bit 7 is always 0).
 */
function decodeSyncsafe(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] & 0x7f) << 21) |
    ((data[offset + 1] & 0x7f) << 14) |
    ((data[offset + 2] & 0x7f) << 7) |
    (data[offset + 3] & 0x7f)
  );
}

// ============================================================================
// ID3v2 HEADER PARSER
// ============================================================================

/**
 * Parse the ID3v2 header from the start of a buffer.
 * Returns null if not a valid ID3v2 tag.
 */
export function parseID3v2Header(buffer: ArrayBuffer): ID3v2Header | null {
  const data = new Uint8Array(buffer);
  if (data.length < 10) return null;

  // Check for "ID3" magic
  if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return null;

  const version = data[3];
  const revision = data[4];
  const flags = data[5];
  const size = decodeSyncsafe(data, 6);

  // We only support v2.3 and v2.4
  if (version < 3 || version > 4) return null;

  return { version, revision, flags, size };
}

// ============================================================================
// FRAME PARSER
// ============================================================================

/**
 * Read a null-terminated string from a byte array at given offset.
 * Returns the string and the position after the null terminator.
 */
function readNullTerminatedString(data: Uint8Array, offset: number): [string, number] {
  let end = offset;
  while (end < data.length && data[end] !== 0) end++;
  const str = new TextDecoder('ascii').decode(data.subarray(offset, end));
  return [str, end + 1]; // skip the null terminator
}

/**
 * Read a null-terminated UTF-16 string (with BOM or BE default).
 */
function readNullTerminatedUTF16(data: Uint8Array, offset: number): [string, number] {
  let end = offset;
  // Look for double-null terminator
  while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) end += 2;
  const str = new TextDecoder('utf-16be').decode(data.subarray(offset, end));
  return [str, end + 2]; // skip the double null
}

/**
 * Parse a GEOB frame's data payload.
 */
function parseGEOBData(data: Uint8Array): GEOBFrame | null {
  if (data.length < 4) return null;

  const encoding = data[0]; // 0=ISO-8859-1, 1=UTF-16, 2=UTF-16BE, 3=UTF-8
  let pos = 1;

  // MIME type (always ASCII, null-terminated)
  const [mimeType, afterMime] = readNullTerminatedString(data, pos);
  pos = afterMime;

  // Filename and description depend on encoding
  let fileName: string;
  let description: string;

  if (encoding === 1 || encoding === 2) {
    // UTF-16
    [fileName, pos] = readNullTerminatedUTF16(data, pos);
    [description, pos] = readNullTerminatedUTF16(data, pos);
  } else {
    // ISO-8859-1 or UTF-8 (both use single-byte null terminators)
    [fileName, pos] = readNullTerminatedString(data, pos);
    [description, pos] = readNullTerminatedString(data, pos);
  }

  const binaryData = data.subarray(pos);

  return { description, mimeType, fileName, data: binaryData };
}

// ============================================================================
// EXTRACT GEOB FRAMES
// ============================================================================

/**
 * Extract all GEOB frames from an ID3v2 tag.
 * Returns a map of description → binary data.
 *
 * This is all we need for Serato metadata:
 * - "Serato Markers2" → cue points, loops, colors
 * - "Serato Autotags" → BPM, gain, key
 * - "Serato BeatGrid" → beat markers
 * - "Serato Overview" → waveform overview data
 */
export function extractGEOBFrames(buffer: ArrayBuffer): Map<string, GEOBFrame> {
  const header = parseID3v2Header(buffer);
  if (!header) return new Map();

  const data = new Uint8Array(buffer);
  const frames = new Map<string, GEOBFrame>();
  const tagEnd = 10 + header.size;
  let pos = 10;

  // Skip extended header if present (flag bit 6)
  if (header.flags & 0x40) {
    const extSize = header.version === 4
      ? decodeSyncsafe(data, pos)
      : new DataView(buffer).getUint32(pos, false);
    pos += extSize;
  }

  // Parse frames
  while (pos + 10 <= tagEnd) {
    // Frame ID: 4 ASCII bytes
    const frameId = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);

    // Check for padding (null bytes = end of frames)
    if (frameId[0] === '\0') break;

    // Frame size
    const frameSize = header.version === 4
      ? decodeSyncsafe(data, pos + 4)
      : new DataView(buffer).getUint32(pos + 4, false);

    // Frame flags (2 bytes, skip)
    // const frameFlags = (data[pos + 8] << 8) | data[pos + 9];

    if (frameId === 'GEOB' && frameSize > 0) {
      const frameData = data.subarray(pos + 10, pos + 10 + frameSize);
      const geob = parseGEOBData(frameData);
      if (geob) {
        frames.set(geob.description, geob);
      }
    }

    pos += 10 + frameSize;
  }

  return frames;
}
