import { describe, it, expect } from 'vitest';
import { NanoExporter } from '../NanoExporter';
import type { Pattern, TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';

/**
 * Regression test for the Nano "Export compressed" button, which could never
 * have worked.
 *
 * `exportCompressed` and `decompress` both reached the LZMA codec through
 * `require('lzma/src/lzma_worker.js')`. `require` does not exist in an ESM
 * browser bundle, so every call threw a ReferenceError before compressing a
 * single byte — no v2 Nano file has ever been written or read. The fix is a
 * static import; this test fails against the old code because the import is
 * what it exercises.
 *
 * Named after the symptom rather than the mechanism: a compressed export must
 * come back byte-for-byte as the uncompressed one.
 */

function cell(over: Partial<TrackerCell> = {}): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, ...over } as TrackerCell;
}

/** A pattern with enough repetition that LZMA has something to find. */
function makePattern(rows: number): Pattern {
  const channels = Array.from({ length: 4 }, (_, ch) => ({
    rows: Array.from({ length: rows }, (_, r) =>
      r % 4 === 0
        ? cell({ note: 49 + (ch * 2), instrument: 1, volume: 0x40, effTyp: 0x0C, eff: 0x20 })
        : cell()
    ),
  }));
  return { id: 'p0', name: 'test', length: rows, channels } as unknown as Pattern;
}

const instruments = [
  { id: 1, synthType: 'TB303', volume: 0, pan: 0 } as unknown as InstrumentConfig,
];

describe('Nano compressed export', () => {
  it('round-trips a compressed export back to the exact uncompressed bytes', () => {
    const patterns = [makePattern(64)];
    const order = [0, 0, 0, 0];

    const raw = NanoExporter.export(instruments, patterns, order, 125, 6);
    const packed = NanoExporter.exportCompressed(instruments, patterns, order, 125, 6);
    const back = NanoExporter.decompress(packed);

    expect(Array.from(back)).toEqual(Array.from(raw));
  });

  it('writes the v2 container header and the uncompressed size', () => {
    const patterns = [makePattern(64)];
    const order = [0, 0];

    const raw = NanoExporter.export(instruments, patterns, order, 125, 6);
    const packed = NanoExporter.exportCompressed(instruments, patterns, order, 125, 6);

    expect(Array.from(packed.subarray(0, 5))).toEqual([0xDB, 0x58, 0x4E, 0x21, 2]);
    expect(new DataView(packed.buffer).getUint32(5, true)).toBe(raw.length);
  });

  it('returns a v1 export untouched instead of trying to decompress it', () => {
    const patterns = [makePattern(16)];
    const raw = NanoExporter.export(instruments, patterns, [0], 125, 6);
    expect(Array.from(NanoExporter.decompress(raw))).toEqual(Array.from(raw));
  });

  it('rejects a buffer that does not carry the Nano magic', () => {
    expect(() => NanoExporter.decompress(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])))
      .toThrow(/bad magic/);
  });
});
