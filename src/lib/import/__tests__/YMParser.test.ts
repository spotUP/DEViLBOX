import { describe, it, expect } from 'vitest';
import { isYMFormat, parseYMFile } from '../formats/YMParser';

function makeYM3(numFrames = 4): ArrayBuffer {
  const header = new TextEncoder().encode('YM3!');
  const regs = new Uint8Array(14 * numFrames);
  // Frame 0: Ch A period = 0x64 (100), volume = 10, mixer bit 0 = tone A enabled
  regs[0] = 0x64; regs[1] = 0x00; // Ch A fine/coarse period
  regs[7] = 0b00111110; // tone A enabled (bit 0 = 0 = enabled for AY)
  regs[8] = 10; // Vol A = 10
  const buf = new Uint8Array(4 + regs.length);
  buf.set(header, 0);
  buf.set(regs, 4);
  return buf.buffer;
}

describe('YMParser', () => {
  it('detects valid YM by magic', () => {
    expect(isYMFormat(makeYM3())).toBe(true);
  });

  it('rejects non-YM data', () => {
    const buf = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(isYMFormat(buf.buffer)).toBe(false);
  });

  it('parses YM3 with 3 channels', async () => {
    const song = await parseYMFile(makeYM3(4), 'test.ym');
    expect(song.numChannels).toBe(3);
    expect(song.instruments.length).toBe(1);
    expect(song.instruments[0].synthType).toBe('FurnaceAY');
    expect(song.patterns.length).toBeGreaterThan(0);
  });
});
