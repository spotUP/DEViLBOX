/**
 * Project file compression for .dbx files.
 *
 * Binary container format:
 *   [4 bytes] Magic: "DVBZ" (0x44 0x56 0x42 0x5A)
 *   [1 byte]  Version: 1
 *   [4 bytes] Uncompressed size (little-endian uint32)
 *   [N bytes] Deflate-compressed UTF-8 JSON
 *
 * Backward compatibility: if the first byte is NOT 'D' (0x44)
 * or magic doesn't match DVBZ, the data is treated as raw UTF-8 JSON.
 */

import pako from 'pako';

const MAGIC = new Uint8Array([0x44, 0x56, 0x42, 0x5A]); // "DVBZ"
const CONTAINER_VERSION = 1;
const HEADER_SIZE = 9; // 4 magic + 1 version + 4 size

/**
 * Compress a JSON string into a DVBZ binary container.
 * Returns an ArrayBuffer suitable for Blob construction and file writing.
 */
export function compressProject(json: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const utf8 = encoder.encode(json);
  const compressed = pako.deflate(utf8);

  const result = new ArrayBuffer(HEADER_SIZE + compressed.length);
  const bytes = new Uint8Array(result);
  bytes.set(MAGIC, 0);
  bytes[4] = CONTAINER_VERSION;
  new DataView(result).setUint32(5, utf8.length, true);
  bytes.set(compressed, HEADER_SIZE);

  return result;
}

/**
 * Decompress a project file from ArrayBuffer.
 * Handles both DVBZ compressed and raw JSON formats.
 */
export function decompressProject(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);

  // Check for DVBZ magic
  if (bytes.length >= HEADER_SIZE &&
      bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1] &&
      bytes[2] === MAGIC[2] && bytes[3] === MAGIC[3]) {
    const compressed = bytes.subarray(HEADER_SIZE);
    const decompressed = pako.inflate(compressed);
    const decoder = new TextDecoder();
    return decoder.decode(decompressed);
  }

  // Legacy: raw UTF-8 JSON
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

/**
 * Check if an ArrayBuffer contains a DVBZ compressed project.
 */
export function isCompressedProject(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data);
  return bytes.length >= HEADER_SIZE &&
    bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1] &&
    bytes[2] === MAGIC[2] && bytes[3] === MAGIC[3];
}
