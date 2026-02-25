/**
 * IFF8SVXParser — Amiga IFF/8SVX sample file parser
 *
 * Parses Interchange File Format (IFF) containers with FORM type "8SVX",
 * the native Amiga 8-bit sampled voice format.
 *
 * Supports:
 *  - Uncompressed (sCompression = 0): raw 8-bit signed PCM
 *  - Fibonacci-delta compression (sCompression = 1): 4-bit delta encoding
 *
 * Extracts: sample name, playback rate, one-shot length, loop points,
 * volume, and decoded PCM as a signed Int8Array.
 *
 * Format references:
 *  - EA IFF 85 standard (https://wiki.amigaos.net/wiki/IFF_Standard)
 *  - 8SVX standard (https://wiki.amigaos.net/wiki/8SVX_IFF)
 */

export interface IFF8SVXResult {
  /** Sample name from NAME chunk (or empty string) */
  name: string;
  /** Playback rate in Hz (from VHDR.samplesPerSec) */
  sampleRate: number;
  /** Decoded 8-bit signed PCM samples */
  pcm: Int8Array;
  /** Frame index where the loop region starts (after one-shot region) */
  loopStart: number;
  /** Exclusive frame index where the loop region ends */
  loopEnd: number;
  /** True if the file contains a loop region */
  hasLoop: boolean;
  /** Volume as 0–1 float (from VHDR.volume, 0x10000 = 1.0) */
  volume: number;
  /** Number of octaves of sample data (usually 1; >1 means multi-octave stacking) */
  octaves: number;
}

// Fibonacci delta decode table (signed 4-bit → delta).
// Nibble values 0–7 are positive deltas; 8–15 are negative (two's complement in 4 bits).
const FIBONACCI: readonly number[] = [
  0, 1, 3, 6, 10, 15, 21, 28,
  -28, -21, -15, -10, -6, -3, -1, 0,
];

/** Clamp a value to the signed 8-bit range [-128, 127]. */
function clamp8(v: number): number {
  return Math.max(-128, Math.min(127, v));
}

/**
 * Read a 4-byte ASCII tag from a DataView at the given offset.
 */
function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Check whether an ArrayBuffer looks like an IFF 8SVX file.
 * Returns true if the first 12 bytes are "FORM????8SVX".
 */
export function isIFF8SVX(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return readTag(view, 0) === 'FORM' && readTag(view, 8) === '8SVX';
}

/**
 * Parse an IFF/8SVX buffer and return decoded sample data plus metadata.
 * Throws if the file is not a valid 8SVX container.
 */
export function parseIFF8SVX(buffer: ArrayBuffer): IFF8SVXResult {
  if (buffer.byteLength < 12) {
    throw new Error('File too short to be an IFF/8SVX file');
  }

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (readTag(view, 0) !== 'FORM') {
    throw new Error('Not an IFF file — missing FORM header');
  }
  if (readTag(view, 8) !== '8SVX') {
    throw new Error(`Not an 8SVX file — FORM type is "${readTag(view, 8)}"`);
  }

  // FORM chunk payload starts at offset 12.
  const formEnd = 8 + view.getUint32(4, false); // big-endian size + 8-byte FORM header

  // ── Walk chunks ─────────────────────────────────────────────────────────
  let name = '';
  let sampleRate = 8287;   // Paula chip default at PAL clock
  let oneShotSamples = 0;
  let repeatSamples = 0;
  let compression = 0;
  let volume = 1.0;
  let octaves = 1;
  let pcm: Int8Array | null = null;

  let pos = 12;
  while (pos + 8 <= formEnd && pos + 8 <= buffer.byteLength) {
    const chunkId   = readTag(view, pos);
    const chunkSize = view.getUint32(pos + 4, false);
    const dataStart = pos + 8;
    const dataEnd   = dataStart + chunkSize;
    // IFF chunks are padded to even byte boundaries
    pos = dataEnd + (chunkSize & 1);

    if (dataEnd > buffer.byteLength) break; // truncated

    switch (chunkId) {

      case 'VHDR': {
        // Voice Header — 20 bytes
        if (chunkSize < 20) break;
        oneShotSamples = view.getUint32(dataStart,      false);
        repeatSamples  = view.getUint32(dataStart + 4,  false);
        // samplesPerHiCycle at +8 (u32) — not needed for mono/non-pitched use
        sampleRate     = view.getUint16(dataStart + 12, false);
        octaves        = view.getUint8(dataStart + 14);
        compression    = view.getUint8(dataStart + 15);
        const rawVol   = view.getUint32(dataStart + 16, false);
        volume         = rawVol / 0x10000;  // 0x10000 = 1.0
        break;
      }

      case 'NAME': {
        // ASCII sample name (not necessarily null-terminated)
        let len = chunkSize;
        while (len > 0 && bytes[dataStart + len - 1] === 0) len--;
        name = String.fromCharCode(...Array.from(bytes.subarray(dataStart, dataStart + len)));
        break;
      }

      case 'BODY': {
        // Raw sample data — decode based on compression flag
        if (compression === 1) {
          // Fibonacci-delta: each input byte → 2 output samples
          const outLen = chunkSize * 2;
          const decoded = new Int8Array(outLen);
          let last = 0;
          let di = 0;
          for (let i = dataStart; i < dataEnd; i++) {
            const b = bytes[i];
            last = clamp8(last + FIBONACCI[(b >> 4) & 0xF]);
            decoded[di++] = last;
            last = clamp8(last + FIBONACCI[b & 0xF]);
            decoded[di++] = last;
          }
          pcm = decoded;
        } else {
          // Uncompressed: raw 8-bit signed (reinterpret Uint8 → Int8)
          const raw = bytes.subarray(dataStart, dataEnd);
          pcm = new Int8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
        }
        break;
      }

      // ANNO (annotations), COPY, AUTH, etc. — ignore
    }
  }

  if (!pcm) {
    throw new Error('8SVX file has no BODY chunk — no sample data found');
  }

  // For multi-octave samples, only take the first octave (highest pitch)
  // Each octave is half the length of the previous; all octaves are concatenated.
  // First octave length = total / (2^octaves - 1) * 2^(octaves-1) — but for
  // simplicity just use the one-shot + repeat lengths if they don't exceed pcm.
  const loopStart = oneShotSamples < pcm.length ? oneShotSamples : 0;
  const loopEnd   = (repeatSamples > 0 && loopStart + repeatSamples <= pcm.length)
    ? loopStart + repeatSamples
    : 0;
  const hasLoop   = repeatSamples > 1;

  return {
    name,
    sampleRate: sampleRate > 0 ? sampleRate : 8287,
    pcm,
    loopStart,
    loopEnd,
    hasLoop,
    volume: Math.min(1, Math.max(0, volume)),
    octaves: Math.max(1, octaves),
  };
}
