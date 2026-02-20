/**
 * Serato TLV (Tag-Length-Value) Binary Parser
 *
 * Serato uses a consistent binary format across database, crate, and metadata files:
 * - Tag: 4 ASCII bytes (e.g. 'otrk', 'ttyp', 'pfil')
 * - Length: 4-byte big-endian uint32
 * - Value: `length` bytes (strings are UTF-16 BE, nested containers hold more TLVs)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SeratoTLV {
  tag: string;
  data: Uint8Array;
  offset: number; // byte offset in the original buffer where this TLV starts
}

// ============================================================================
// CORE PARSER
// ============================================================================

/**
 * Parse a stream of TLV entries from a binary buffer.
 * Reads sequentially: 4-byte tag, 4-byte length, N-byte value.
 * Stops at end of buffer or on invalid data.
 */
export function parseTLVStream(buffer: ArrayBuffer, startOffset = 0): SeratoTLV[] {
  const view = new DataView(buffer);
  const entries: SeratoTLV[] = [];
  let pos = startOffset;

  while (pos + 8 <= buffer.byteLength) {
    // Read 4-byte ASCII tag
    const tagBytes = new Uint8Array(buffer, pos, 4);
    const tag = String.fromCharCode(tagBytes[0], tagBytes[1], tagBytes[2], tagBytes[3]);

    // Read 4-byte big-endian length
    const length = view.getUint32(pos + 4, false);

    // Sanity check: length shouldn't exceed remaining buffer
    if (pos + 8 + length > buffer.byteLength) {
      break;
    }

    const data = new Uint8Array(buffer, pos + 8, length);
    entries.push({ tag, data, offset: pos });

    pos += 8 + length;
  }

  return entries;
}

/**
 * Parse nested TLV entries from within a parent TLV's data.
 * Used for container tags like 'otrk' which contain child tags.
 */
export function parseNestedTLV(data: Uint8Array): SeratoTLV[] {
  // Create a new ArrayBuffer from the data to get proper alignment
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return parseTLVStream(buffer);
}

// ============================================================================
// STRING DECODING
// ============================================================================

/**
 * Decode a UTF-16 Big Endian byte array to a JavaScript string.
 * Serato stores all text strings in UTF-16 BE encoding.
 */
export function decodeUTF16BE(data: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = (data[i] << 8) | data[i + 1];
    if (code === 0) break; // null terminator
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}

/**
 * Decode a UTF-8 byte array to a string (for file paths in some contexts).
 */
export function decodeUTF8(data: Uint8Array): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(data).replace(/\0+$/, ''); // strip trailing nulls
}

// ============================================================================
// VALUE READERS
// ============================================================================

/**
 * Read a 4-byte big-endian uint32 from TLV data.
 */
export function readUint32BE(data: Uint8Array): number {
  if (data.length < 4) return 0;
  return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
}

/**
 * Read a 4-byte big-endian float32 from TLV data.
 */
export function readFloat32BE(data: Uint8Array): number {
  if (data.length < 4) return 0;
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  new Uint8Array(buf).set(data.subarray(0, 4));
  return view.getFloat32(0, false);
}

/**
 * Read a 4-byte big-endian int32 from TLV data (signed).
 */
export function readInt32BE(data: Uint8Array): number {
  if (data.length < 4) return 0;
  const view = new DataView(data.buffer, data.byteOffset, 4);
  return view.getInt32(0, false);
}
