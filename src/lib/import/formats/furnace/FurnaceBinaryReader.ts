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
    } catch (e) {
      throw new Error('Failed to decompress Furnace file: ' + e);
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
