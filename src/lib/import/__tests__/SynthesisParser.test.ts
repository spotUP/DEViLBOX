/**
 * SynthesisParser Tests — Synthesis format detection
 *
 * Detection: 'Synth4.0' at offset 0, or 'Synth4.2' at offset 0x1f0e.
 * Minimum size: 204 bytes (for Synth4.0), or 0x1f0e+204 (for Synth4.2).
 */
import { describe, it, expect } from 'vitest';
import { isSynthesisFormat } from '../formats/SynthesisParser';

function writeMagic(buf: Uint8Array, off: number, v: string): void {
  for (let i = 0; i < v.length; i++) {
    buf[off + i] = v.charCodeAt(i);
  }
}

describe('isSynthesisFormat', () => {
  it('detects Synth4.0 at offset 0', () => {
    const buf = new Uint8Array(300).fill(0);
    writeMagic(buf, 0, 'Synth4.0');
    expect(isSynthesisFormat(buf)).toBe(true);
  });

  it('detects Synth4.2 at offset 0x1f0e', () => {
    const buf = new Uint8Array(0x1f0e + 300).fill(0);
    writeMagic(buf, 0x1f0e, 'Synth4.2');
    expect(isSynthesisFormat(buf)).toBe(true);
  });

  it('rejects wrong magic at offset 0', () => {
    const buf = new Uint8Array(300).fill(0);
    writeMagic(buf, 0, 'Synth3.9');
    expect(isSynthesisFormat(buf)).toBe(false);
  });

  it('rejects buffer shorter than 204 bytes', () => {
    const buf = new Uint8Array(100).fill(0);
    writeMagic(buf, 0, 'Synth4.0');
    expect(isSynthesisFormat(buf)).toBe(false);
  });

  it('rejects zeroed 300-byte buffer', () => {
    expect(isSynthesisFormat(new Uint8Array(300))).toBe(false);
  });

  it('rejects Synth4.2 magic at wrong position (only at offset 0)', () => {
    const buf = new Uint8Array(300).fill(0);
    writeMagic(buf, 0, 'Synth4.2');
    // At offset 0, the parser will only match 'Synth4.0' or check 0x1f0e
    // 'Synth4.2' at offset 0 should NOT match
    expect(isSynthesisFormat(buf)).toBe(false);
  });
});
