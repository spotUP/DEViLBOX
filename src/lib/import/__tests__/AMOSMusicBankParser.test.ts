/**
 * AMOSMusicBankParser Tests
 *
 * API:
 *   isAMOSMusicBankFormat(buffer: ArrayBuffer): boolean
 *
 * Magic: "AmBk" at offset 0, uint16BE(4) == 0x0003, "Music   " at offset 0x0C.
 * No reference music files found for this format.
 */
import { describe, it, expect } from 'vitest';
import { isAMOSMusicBankFormat } from '../formats/AMOSMusicBankParser';

function makeAMOSBuf(): ArrayBuffer {
  const buf = new Uint8Array(64);
  // "AmBk"
  buf[0] = 0x41; buf[1] = 0x6D; buf[2] = 0x42; buf[3] = 0x6B;
  // bank type 0x0003
  buf[4] = 0x00; buf[5] = 0x03;
  // padding bytes 6-11 (chip/fast/bank length) - leave zero
  // "Music   " at offset 0x0C
  const name = 'Music   ';
  for (let i = 0; i < 8; i++) buf[0x0C + i] = name.charCodeAt(i);
  return buf.buffer;
}

describe('isAMOSMusicBankFormat', () => {
  it('detects a crafted AMOS Music Bank buffer', () => {
    expect(isAMOSMusicBankFormat(makeAMOSBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isAMOSMusicBankFormat(new ArrayBuffer(64))).toBe(false);
  });

  it('rejects a buffer that is too short', () => {
    expect(isAMOSMusicBankFormat(new ArrayBuffer(0x1F))).toBe(false);
  });

  it('rejects wrong bank type', () => {
    const b = new Uint8Array(makeAMOSBuf());
    b[5] = 0x01; // type 0x0001 instead of 0x0003
    expect(isAMOSMusicBankFormat(b.buffer)).toBe(false);
  });

  it('rejects wrong magic', () => {
    const b = new Uint8Array(makeAMOSBuf());
    b[0] = 0x00;
    expect(isAMOSMusicBankFormat(b.buffer)).toBe(false);
  });
});
