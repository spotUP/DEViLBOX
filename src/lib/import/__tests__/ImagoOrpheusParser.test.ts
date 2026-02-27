/**
 * ImagoOrpheusParser Tests
 *
 * API:
 *   isImagoOrpheusFormat(bytes: Uint8Array): boolean
 *   parseImagoOrpheusFile(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * Magic: "IM10" (0x494D3130) at offset 60.
 *        bpm >= 32, master <= 64, amp 4-127, at least one valid channel.
 * Header is 576 bytes + 256 order bytes minimum.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isImagoOrpheusFormat } from '../formats/ImagoOrpheusParser';

function makeImagoBuf(): Uint8Array {
  const buf = new Uint8Array(576 + 256 + 4);
  // "IM10" at offset 60
  buf[60]=0x49; buf[61]=0x4D; buf[62]=0x31; buf[63]=0x30;
  // ordNum (uint16LE at 32) = 1
  buf[32]=1; buf[33]=0;
  // patNum (uint16LE at 34) = 1
  buf[34]=1; buf[35]=0;
  // insNum (uint16LE at 36) = 0
  buf[36]=0; buf[37]=0;
  // flags (uint16LE at 38) = 0
  // tempo (byte 48) = 6
  buf[48]=6;
  // bpm (byte 49) = 125
  buf[49]=125;
  // master (byte 50) = 64
  buf[50]=64;
  // amp (byte 51) = 8
  buf[51]=8;
  // channel 0 status (off + 13) = 0, pan (off + 12) = 128
  // channels at offset 64, each 16 bytes
  buf[64+12]=128; buf[64+13]=0; // channel 0: pan=128, status=0 (valid)
  // All other channels: status=2 (disabled, which is still valid for our impl)
  // Actually status 2 is valid per parser (< 2 means active, status=2 means disabled)
  // Remaining channels will be 0 which satisfies status < 2 - set them all to 2
  for (let ch = 1; ch < 32; ch++) {
    buf[64 + ch * 16 + 13] = 2; // disabled
  }
  return buf;
}

describe('isImagoOrpheusFormat', () => {
  it('detects a crafted Imago Orpheus buffer', () => {
    expect(isImagoOrpheusFormat(makeImagoBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isImagoOrpheusFormat(new Uint8Array(1000))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isImagoOrpheusFormat(new Uint8Array(100))).toBe(false);
  });

  it('rejects when IM10 magic is wrong', () => {
    const buf = makeImagoBuf();
    buf[60] = 0x00;
    expect(isImagoOrpheusFormat(buf)).toBe(false);
  });

  it('rejects when bpm < 32', () => {
    const buf = makeImagoBuf();
    buf[49] = 10;
    expect(isImagoOrpheusFormat(buf)).toBe(false);
  });

  it('rejects when master > 64', () => {
    const buf = makeImagoBuf();
    buf[50] = 100;
    expect(isImagoOrpheusFormat(buf)).toBe(false);
  });
});
