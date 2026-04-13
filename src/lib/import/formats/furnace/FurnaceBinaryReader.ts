/**
 * Furnace binary reading utilities — decompression and string reading.
 */

import { BinaryReader } from '../../../../utils/BinaryReader';
import pako from 'pako';

/**
 * Decompress Furnace file if needed
 */
export function decompressFur(data: Uint8Array): Uint8Array {
  // Check for zlib header (0x78)
  if (data[0] === 0x78) {
    try {
      return pako.inflate(data);
    } catch {
      // Some files (especially DefleMask DMF) have corrupted adler32 checksums.
      // Fall back to raw inflate (skip 2-byte zlib header) to bypass checksum.
      try {
        return pako.inflateRaw(data.subarray(2));
      } catch (e2) {
        throw new Error('Failed to decompress Furnace file: ' + e2);
      }
    }
  }
  return data;
}

/**
 * Read a null-terminated string
 */
export function readString(reader: BinaryReader): string {
  let result = '';
  while (!reader.isEOF()) {
    const char = reader.readUint8();
    if (char === 0) break;
    result += String.fromCharCode(char);
  }
  return result;
}
