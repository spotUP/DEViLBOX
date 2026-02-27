/**
 * TCBTrackerParser Tests — TCB Tracker 'AN COOL!' / 'AN COOL.' format detection
 *
 * Detection requires filename prefix 'tcb.' AND binary checks:
 *   'AN C' at 0, 'OOL!' or 'OOL.' at 4, nbPatt<=127, speed<=15,
 *   byte[13]=0, seqLen in 1-127, sentinel values at structural offsets.
 *
 * Note: .tss files in Reference Music/TSS/ are a different format (TSS/UADE).
 */
import { describe, it, expect } from 'vitest';
import { isTCBTrackerFormat } from '../formats/TCBTrackerParser';

// Build a minimal valid TCB Tracker buffer (format 1: pattBase=0x110)
function makeTCBBuffer(): ArrayBuffer {
  // pattBase=0x110=272, nbPatt=1, a1 = 272 + 1*512 = 784, a3 = 784 + 212 = 996
  // Need: buf.length > 996
  // sentinel at a3-8=988: 0xFFFFFFFF
  // sentinel at a3-4=992: 0x00000000
  // sentinel at a3-0x90=852: 0x000000D4
  const size = 1200;
  const buf = new Uint8Array(size).fill(0);

  // 'AN C' at 0: 0x41 0x4E 0x20 0x43
  buf[0] = 0x41; buf[1] = 0x4e; buf[2] = 0x20; buf[3] = 0x43;
  // 'OOL!' at 4: 0x4F 0x4F 0x4C 0x21
  buf[4] = 0x4f; buf[5] = 0x4f; buf[6] = 0x4c; buf[7] = 0x21;

  // nbPatt = u32BE(8) = 1
  buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 0x01;

  // speed = buf[12] = 6 (<= 15)
  buf[12] = 0x06;
  // buf[13] = 0
  buf[13] = 0x00;

  // seqLen = buf[0x8E] = 1 (positive, <= 127)
  buf[0x8e] = 0x01;

  // pattBase=0x110, nbPatt=1
  // a1 = 0x110 + 1*0x200 = 0x110 + 512 = 784 = 0x310
  // a3 = a1 + 0xD4 = 784 + 212 = 996 = 0x3E4

  // u32BE(a3=996 - 8) = 0xFFFFFFFF  -> buf[988..991]
  buf[988] = 0xff; buf[989] = 0xff; buf[990] = 0xff; buf[991] = 0xff;
  // u32BE(a3 - 4) = 0x00000000  -> buf[992..995] (already zero)

  // u32BE(a3 - 0x90) = 0x000000D4  -> buf[852..855]
  buf[852] = 0x00; buf[853] = 0x00; buf[854] = 0x00; buf[855] = 0xd4;

  return buf.buffer;
}

describe('isTCBTrackerFormat', () => {
  it('detects valid TCB Tracker buffer with tcb. filename', () => {
    expect(isTCBTrackerFormat(makeTCBBuffer(), 'tcb.testsong')).toBe(true);
  });

  it('rejects when filename does not start with tcb.', () => {
    expect(isTCBTrackerFormat(makeTCBBuffer(), 'other.testsong')).toBe(false);
  });

  it('rejects when AN C magic is wrong', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[0] = 0x00;
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects when OOL! / OOL. tag is wrong', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[7] = 0x00; // not '!' or '.'
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects nbPatt > 127', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[11] = 0x80; // nbPatt = 128 > 127
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects speed > 15', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[12] = 0x10; // speed = 16 > 15
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects seqLen = 0', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[0x8e] = 0x00;
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isTCBTrackerFormat(new ArrayBuffer(200), 'tcb.test')).toBe(false);
  });
});
