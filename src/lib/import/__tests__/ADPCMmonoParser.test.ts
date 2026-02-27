/**
 * ADPCMmonoParser Tests
 *
 * API:
 *   isADPCMmonoFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean
 *
 * Detection: filename must end with '.adpcm' (case-insensitive) AND
 * first 4 bytes must NOT be 'ADPC' (0x41445043).
 * No reference music files found for this format.
 */
import { describe, it, expect } from 'vitest';
import { isADPCMmonoFormat } from '../formats/ADPCMmonoParser';

function makeBuf(firstFour = [0x00, 0x00, 0x00, 0x00]): Uint8Array {
  const buf = new Uint8Array(64);
  buf[0] = firstFour[0]; buf[1] = firstFour[1]; buf[2] = firstFour[2]; buf[3] = firstFour[3];
  return buf;
}

describe('isADPCMmonoFormat', () => {
  it('detects .adpcm file with non-ADPC header', () => {
    expect(isADPCMmonoFormat(makeBuf(), 'mysong.adpcm')).toBe(true);
  });

  it('rejects .adpcm file whose first 4 bytes are ADPC', () => {
    expect(isADPCMmonoFormat(makeBuf([0x41, 0x44, 0x50, 0x43]), 'mysong.adpcm')).toBe(false);
  });

  it('rejects without filename', () => {
    expect(isADPCMmonoFormat(makeBuf())).toBe(false);
  });

  it('rejects wrong extension', () => {
    expect(isADPCMmonoFormat(makeBuf(), 'mysong.mod')).toBe(false);
  });

  it('accepts case-insensitive .ADPCM extension', () => {
    expect(isADPCMmonoFormat(makeBuf(), 'mysong.ADPCM')).toBe(true);
  });

  it('rejects too-short buffer', () => {
    expect(isADPCMmonoFormat(new Uint8Array(2), 'x.adpcm')).toBe(false);
  });
});
