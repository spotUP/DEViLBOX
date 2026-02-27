/**
 * DSMParser Tests
 *
 * API:
 *   isDSMFormat(buffer: ArrayBuffer): boolean
 *   parseDSMFile(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * Format A (DSIK RIFF DSMF): "RIFF" + 4-byte size + "DSMF" at offset 8, or "DSMF" at 0.
 * Format B (Dynamic Studio): "DSm\x1A" at 0, version byte 0x20 at offset 4.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isDSMFormat } from '../formats/DSMParser';

function makeRIFFDSMFBuf(): ArrayBuffer {
  const buf = new Uint8Array(64);
  // "RIFF"
  buf[0]=0x52; buf[1]=0x49; buf[2]=0x46; buf[3]=0x46;
  // size (little-endian, dummy)
  buf[4]=0x38; buf[5]=0x00; buf[6]=0x00; buf[7]=0x00;
  // "DSMF"
  buf[8]=0x44; buf[9]=0x53; buf[10]=0x4D; buf[11]=0x46;
  return buf.buffer;
}

function makeDSMFBuf(): ArrayBuffer {
  const buf = new Uint8Array(64);
  buf[0]=0x44; buf[1]=0x53; buf[2]=0x4D; buf[3]=0x46; // "DSMF"
  return buf.buffer;
}

function makeDynamicStudioBuf(): ArrayBuffer {
  const buf = new Uint8Array(64);
  buf[0]=0x44; buf[1]=0x53; buf[2]=0x6D; buf[3]=0x1A; // "DSm\x1A"
  buf[4]=0x20; // version 0x20
  return buf.buffer;
}

describe('isDSMFormat', () => {
  it('detects RIFF DSMF buffer', () => {
    expect(isDSMFormat(makeRIFFDSMFBuf())).toBe(true);
  });

  it('detects plain DSMF buffer', () => {
    expect(isDSMFormat(makeDSMFBuf())).toBe(true);
  });

  it('detects Dynamic Studio DSm buffer', () => {
    expect(isDSMFormat(makeDynamicStudioBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isDSMFormat(new ArrayBuffer(64))).toBe(false);
  });

  it('rejects a random non-matching buffer', () => {
    const buf = new Uint8Array(64);
    for (let i = 0; i < 64; i++) buf[i] = (i * 7 + 13) & 0xFF;
    expect(isDSMFormat(buf.buffer)).toBe(false);
  });
});
