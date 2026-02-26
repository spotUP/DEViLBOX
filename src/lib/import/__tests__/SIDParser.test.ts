import { describe, it, expect } from 'vitest';
import { isSIDFormat, parseSIDFile } from '../formats/SIDParser';

function makePSIDHeader(): ArrayBuffer {
  const buf = new Uint8Array(0x7C + 16); // v2 header + minimal data
  const dv = new DataView(buf.buffer);
  buf[0]=0x50; buf[1]=0x53; buf[2]=0x49; buf[3]=0x44; // "PSID"
  dv.setUint16(4, 2, false);    // version 2
  dv.setUint16(6, 0x7C, false); // data offset
  dv.setUint16(14, 5, false);   // 5 songs
  dv.setUint16(16, 1, false);   // start song 1
  // flags bits[3:2] = 10 = 8580 model
  dv.setUint16(118, 0b0000_0000_0000_1000, false);
  new TextEncoder().encodeInto('Test SID', buf.subarray(22));
  new TextEncoder().encodeInto('SID Author', buf.subarray(54));
  return buf.buffer;
}

describe('SIDParser', () => {
  it('detects PSID by magic', () => {
    expect(isSIDFormat(makePSIDHeader())).toBe(true);
  });

  it('rejects non-SID data', () => {
    const buf = new Uint8Array(16);
    expect(isSIDFormat(buf.buffer)).toBe(false);
  });

  it('parses model and song count', async () => {
    const song = await parseSIDFile(makePSIDHeader(), 'test.sid');
    expect(song.name).toContain('Test SID');
    expect(song.instruments[0].synthType).toBe('FurnaceSID8580');
  });
});
