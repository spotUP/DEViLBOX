/**
 * DSymLZW.ts — LZW compressor / decompressor matching Digital Symphony's format.
 *
 * Format details (13-bit variable-length codes, LSB-first):
 *   - Codes 0-255: literal byte values
 *   - Code 256: RESET_DICT (reset to 9-bit codes)
 *   - Code 257: END_OF_STREAM
 *   - Code size starts at 9, grows when nextIndex === (1 << codeSize)
 *   - Max code size: 13 bits (max 8192 dictionary entries)
 *   - Bit packing: LSB-first (accumulator-based)
 *   - Output aligned to 4 bytes from start position
 *
 * Reference: DigitalSymphonyParser.ts decompressDSymLZW()
 *            OpenMPT Load_dsym.cpp DecompressDSymLZW()
 */

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_NODES = 1 << 13; // 8192
const RESET_DICT = 256;
const END_OF_STREAM = 257;
const FIRST_CODE = 258;
const INITIAL_CODE_SIZE = 9;

// ── BitWriter (LSB-first, matching BitReader in parser) ──────────────────────

class BitWriter {
  private bytes: number[] = [];
  private bitBuf = 0;
  private bitsUsed = 0;

  writeBits(value: number, n: number): void {
    this.bitBuf |= (value & ((1 << n) - 1)) << this.bitsUsed;
    this.bitsUsed += n;
    while (this.bitsUsed >= 8) {
      this.bytes.push(this.bitBuf & 0xFF);
      this.bitBuf >>>= 8;
      this.bitsUsed -= 8;
    }
  }

  /** Flush remaining bits and return the byte array. */
  finish(): Uint8Array {
    // Flush any remaining bits
    if (this.bitsUsed > 0) {
      this.bytes.push(this.bitBuf & 0xFF);
    }
    return new Uint8Array(this.bytes);
  }
}

// ── LZW Compressor ──────────────────────────────────────────────────────────

/**
 * Compress data using Digital Symphony's LZW variant.
 * Returns the compressed bytes (NOT including the packing type byte).
 * The caller should prepend packing type byte (1) before writing to file.
 *
 * The output is padded to 4-byte alignment.
 */
export function compressDSymLZW(input: Uint8Array): Uint8Array {
  if (input.length === 0) {
    // Just emit END_OF_STREAM
    const writer = new BitWriter();
    writer.writeBits(END_OF_STREAM, INITIAL_CODE_SIZE);
    const raw = writer.finish();
    // Pad to 4 bytes
    const padded = new Uint8Array(((raw.length + 3) & ~3));
    padded.set(raw);
    return padded;
  }

  const writer = new BitWriter();

  // Dictionary: maps string (as array of byte values) → code
  // For efficiency, use a trie-like approach with Map<parentCode, Map<byte, code>>
  let children = new Map<number, Map<number, number>>();
  let nextIndex = FIRST_CODE;
  let codeSize = INITIAL_CODE_SIZE;

  // Initialize: each literal byte is its own root
  for (let i = 0; i < 256; i++) {
    children.set(i, new Map());
  }

  function resetDict(): void {
    writer.writeBits(RESET_DICT, codeSize);
    children = new Map();
    for (let i = 0; i < 256; i++) {
      children.set(i, new Map());
    }
    nextIndex = FIRST_CODE;
    codeSize = INITIAL_CODE_SIZE;
  }

  let currentCode = input[0]; // Start with first byte as literal code
  let pos = 1;

  while (pos < input.length) {
    const byte = input[pos];
    const currentChildren = children.get(currentCode);

    if (currentChildren && currentChildren.has(byte)) {
      // Extend the current string
      currentCode = currentChildren.get(byte)!;
      pos++;
    } else {
      // Output the current code
      writer.writeBits(currentCode, codeSize);

      // Add new entry to dictionary
      if (nextIndex < MAX_NODES) {
        if (!currentChildren) {
          children.set(currentCode, new Map([[byte, nextIndex]]));
        } else {
          currentChildren.set(byte, nextIndex);
        }
        children.set(nextIndex, new Map());
        nextIndex++;

        // Grow code size to match decompressor timing.
        // The decompressor starts nextIdx at 257 (one behind our 258),
        // so it grows when nextIdx === (1 << codeSize). Our nextIndex is
        // always 1 ahead, so we grow when nextIndex === (1 << codeSize) + 1.
        if (nextIndex !== MAX_NODES && nextIndex === (1 << codeSize) + 1) {
          codeSize++;
        }
      }

      // If dictionary is full, reset
      if (nextIndex >= MAX_NODES) {
        resetDict();
      }

      // Start new string with current byte
      currentCode = byte;
      pos++;
    }
  }

  // Output the final code
  writer.writeBits(currentCode, codeSize);

  // Output END_OF_STREAM
  writer.writeBits(END_OF_STREAM, codeSize);

  const raw = writer.finish();

  // Pad to 4-byte alignment
  const padded = new Uint8Array(((raw.length + 3) & ~3));
  padded.set(raw);
  return padded;
}

// ── LZW Decompressor (re-exported from parser for standalone use) ───────────

/**
 * Decompress Digital Symphony LZW data.
 * Standalone version matching the parser's decompressDSymLZW().
 *
 * @param data      - Compressed bytes
 * @param startPos  - Offset where compressed bits begin
 * @param size      - Expected decompressed byte count
 * @returns decompressed data and aligned end position
 */
export function decompressDSymLZW(
  data: Uint8Array,
  startPos: number,
  size: number,
): { output: Uint8Array; endPos: number } {
  const dictPrev  = new Uint16Array(MAX_NODES);
  const dictValue = new Uint8Array(MAX_NODES);
  const match     = new Uint8Array(MAX_NODES);

  // Initialize literal entries
  for (let i = 0; i < 256; i++) {
    dictPrev[i]  = MAX_NODES;
    dictValue[i] = i;
  }

  let codeSize  = INITIAL_CODE_SIZE;
  let prevCode  = 0;
  let nextIdx   = 257;

  const output = new Uint8Array(size);
  let outPos   = 0;

  // Inline BitReader
  let bytePos  = startPos;
  let bitBuf   = 0;
  let bitsLeft = 0;

  function readBits(n: number): number {
    while (bitsLeft < n) {
      if (bytePos >= data.length) throw new Error('BitReader EOF');
      bitBuf |= data[bytePos++] << bitsLeft;
      bitsLeft += 8;
    }
    const result = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitsLeft -= n;
    return result;
  }

  outer: while (outPos < size) {
    const newCode = readBits(codeSize);

    if (newCode === END_OF_STREAM || newCode > nextIdx) break;

    if (newCode === RESET_DICT) {
      codeSize = INITIAL_CODE_SIZE;
      prevCode = 0;
      nextIdx  = 257;
      continue;
    }

    let code        = (newCode < nextIdx) ? newCode : prevCode;
    let writeOffset = MAX_NODES;

    do {
      match[--writeOffset] = dictValue[code];
      code = dictPrev[code];
    } while (code < MAX_NODES);

    const matchLen = MAX_NODES - writeOffset;
    const copyLen  = (newCode === nextIdx) ? matchLen + 1 : matchLen;

    if (outPos + copyLen > size) {
      for (let i = writeOffset; i < MAX_NODES && outPos < size; i++) {
        output[outPos++] = match[i];
      }
      if (newCode === nextIdx && outPos < size) {
        output[outPos++] = match[writeOffset];
      }
      break outer;
    }

    for (let i = writeOffset; i < MAX_NODES; i++) {
      output[outPos++] = match[i];
    }
    if (newCode === nextIdx) {
      output[outPos++] = match[writeOffset];
    }

    if (nextIdx < MAX_NODES) {
      if (outPos < size) {
        dictValue[nextIdx] = match[writeOffset];
        dictPrev[nextIdx]  = prevCode;
        nextIdx++;
        if (nextIdx !== MAX_NODES && nextIdx === (1 << codeSize)) {
          codeSize++;
        }
      }
    }

    prevCode = newCode;
  }

  const endPos = startPos + (((bytePos - startPos) + 3) & ~3);
  return { output, endPos };
}
