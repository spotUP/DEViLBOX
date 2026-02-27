/**
 * XMFParser Tests — Astroidea XMF / Imperium Galactica format detection
 *
 * Detection: byte[0] = type in {2,3,4}, followed by 256 sample headers (16 bytes each),
 * 256-byte order list, and at least 3 bytes for channel/pattern/pan info.
 * Minimum buffer: 1 + 256*16 + 256 + 3 = 4608 bytes.
 */
import { describe, it, expect } from 'vitest';
import { isXMFFormat } from '../formats/XMFParser';

// Build minimal valid XMF buffer (type 3, all sample headers zero = empty samples)
function makeXMFBuffer(type: 2 | 3 | 4 = 3): Uint8Array {
  // Minimum: 1 + 256*16 + 256 + 3 = 4608 bytes
  const size = 5000;
  const buf = new Uint8Array(size).fill(0);

  buf[0] = type; // type byte

  // 256 sample headers at offset 1, 16 bytes each
  // All zeros: loopStart=0, loopEnd=0, dataStart=0, dataEnd=0
  //   -> hasSampleData = false (dataEnd - dataStart = 0)
  //   Flags=0: no unknown bits, no bidi-loop without loop, dataStart(0) <= dataEnd(0) OK
  //   sampleRate=0: type!=2, lengthBytes=0 (so sampleRate check skipped)
  //   Loop: (flags & LOOP)=0, loopEnd=0, loopStart(0)<=loopEnd(0) OK
  // All pass validation.

  // After 256 headers: order list at offset 1+256*16=4097 (256 bytes)
  // Terminate order list immediately with 0xFF
  buf[4097] = 0xff;

  // lastChannel at CHANNEL_OFFSET = 4097+256 = 4353 -> 0 (1 channel)
  buf[4353] = 0x00;
  // lastPattern at 4354 -> 0 (1 pattern)
  buf[4354] = 0x00;

  return buf;
}

describe('isXMFFormat', () => {
  it('detects valid XMF type 3 buffer', () => {
    expect(isXMFFormat(makeXMFBuffer(3))).toBe(true);
  });

  it('detects valid XMF type 2 buffer', () => {
    expect(isXMFFormat(makeXMFBuffer(2))).toBe(true);
  });

  it('detects valid XMF type 4 buffer', () => {
    expect(isXMFFormat(makeXMFBuffer(4))).toBe(true);
  });

  it('rejects type = 0 (invalid)', () => {
    const buf = makeXMFBuffer(3);
    buf[0] = 0;
    expect(isXMFFormat(buf)).toBe(false);
  });

  it('rejects type = 5 (invalid)', () => {
    const buf = makeXMFBuffer(3);
    buf[0] = 5;
    expect(isXMFFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isXMFFormat(new Uint8Array(100))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    // byte[0]=0 -> type=0 -> invalid
    expect(isXMFFormat(new Uint8Array(5000))).toBe(false);
  });
});
