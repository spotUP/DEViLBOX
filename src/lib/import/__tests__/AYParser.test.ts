import { describe, it, expect } from 'vitest';
import { isAYFormat, parseAYFile } from '../formats/AYParser';

function makeAYHeader(): ArrayBuffer {
  const buf = new Uint8Array(64);
  const magic = new TextEncoder().encode('ZXAYEMUL');
  buf.set(magic, 0);
  buf[8]  = 0; // AY type
  buf[18] = 0; // 1 song (N-1)
  return buf.buffer;
}

describe('AYParser', () => {
  it('detects AY by magic', () => {
    expect(isAYFormat(makeAYHeader())).toBe(true);
  });

  it('rejects non-AY data', () => {
    const buf = new Uint8Array(16);
    expect(isAYFormat(buf.buffer)).toBe(false);
  });

  it('parses and returns AY instruments', async () => {
    const song = await parseAYFile(makeAYHeader(), 'test.ay');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('FurnaceAY');
    expect(song.numChannels).toBe(3);
  });
});
