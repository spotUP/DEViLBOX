/**
 * AMSParser Tests
 *
 * API:
 *   isAMSFormat(bytes: Uint8Array): boolean
 *   parseAMSFile(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * AMS 1.x magic: "Extreme" at offset 0, versionHigh byte (offset 8) == 1
 * AMS 2.x magic: "AMShdr\x1A" at offset 0,
 *                nameLen at byte 7, versionLow at 8+nameLen, versionHigh at 8+nameLen+1 == 2
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isAMSFormat } from '../formats/AMSParser';

function makeAMS1Buf(): Uint8Array {
  const buf = new Uint8Array(64);
  // "Extreme"
  buf[0]=0x45; buf[1]=0x78; buf[2]=0x74; buf[3]=0x72; buf[4]=0x65; buf[5]=0x6D; buf[6]=0x65;
  // versionLow at offset 7, versionHigh at offset 8 == 1
  buf[7] = 0;
  buf[8] = 1; // versionHigh = 1
  return buf;
}

function makeAMS2Buf(): Uint8Array {
  const buf = new Uint8Array(64);
  // "AMShdr\x1A"
  buf[0]=0x41; buf[1]=0x4D; buf[2]=0x53; buf[3]=0x68; buf[4]=0x64; buf[5]=0x72; buf[6]=0x1A;
  // nameLen = 0 at byte 7
  buf[7] = 0;
  // versionLow at 8+0=8, versionHigh at 9
  buf[8] = 0;  // versionLow = 0 (must be <= 2)
  buf[9] = 2;  // versionHigh = 2
  return buf;
}

describe('isAMSFormat', () => {
  it('detects AMS 1.x buffer (Extreme magic + version 1)', () => {
    expect(isAMSFormat(makeAMS1Buf())).toBe(true);
  });

  it('detects AMS 2.x buffer (AMShdr magic)', () => {
    expect(isAMSFormat(makeAMS2Buf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isAMSFormat(new Uint8Array(64))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isAMSFormat(new Uint8Array(4))).toBe(false);
  });

  it('rejects AMS 1.x buffer with wrong version', () => {
    const buf = makeAMS1Buf();
    buf[8] = 2; // versionHigh must be 1 for AMS 1.x
    expect(isAMSFormat(buf)).toBe(false);
  });

  it('rejects AMS 2.x buffer with versionLow > 2', () => {
    const buf = makeAMS2Buf();
    buf[8] = 3; // versionLow = 3 which is > 2, invalid
    expect(isAMSFormat(buf)).toBe(false);
  });
});
