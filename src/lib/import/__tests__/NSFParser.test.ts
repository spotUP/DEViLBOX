import { describe, it, expect } from 'vitest';
import { isNSFFormat, parseNSFFile } from '../formats/NSFParser';

function makeNSFHeader(): ArrayBuffer {
  const buf = new Uint8Array(128 + 16); // header + minimal code
  buf[0]=0x4E; buf[1]=0x45; buf[2]=0x53; buf[3]=0x4D; buf[4]=0x1A; // "NESM\x1A"
  buf[5] = 1; buf[6] = 3; buf[7] = 1; // version=1, songs=3, start=1
  new TextEncoder().encodeInto('Test NSF', buf.subarray(14));
  new TextEncoder().encodeInto('Test Artist', buf.subarray(48));
  buf[127] = 0b00000101; // VRC6 + FDS expansion
  return buf.buffer;
}

describe('NSFParser', () => {
  it('detects NSF by magic', () => {
    expect(isNSFFormat(makeNSFHeader())).toBe(true);
  });

  it('rejects non-NSF data', () => {
    const buf = new Uint8Array(16);
    expect(isNSFFormat(buf.buffer)).toBe(false);
  });

  it('parses song count and name', async () => {
    const song = await parseNSFFile(makeNSFHeader(), 'test.nsf');
    expect(song.name).toContain('Test NSF');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('FurnaceNES');
  });
});
