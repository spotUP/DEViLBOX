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

  it('extracts real AY notes from a YM3! frame', async () => {
    // YM3! uncompressed: 4-byte magic + N frames × 14 registers
    // Frame structure: regs[0]=tonePeriodAlo, [1]=tonePeriodAhi, [2]=B_lo, [3]=B_hi,
    //   [4]=C_lo, [5]=C_hi, [6]=noise, [7]=mixer, [8]=volA, [9]=volB, [10]=volC,
    //   [11]=envPeriodLo, [12]=envPeriodHi, [13]=envShape
    // Set channel A: period=100 (freq≈1250Hz≈D6), vol=8, mixer bit 0 clear (tone A on)
    const numFrames = 50;
    const buf = new Uint8Array(4 + numFrames * 14);
    buf[0] = 0x59; buf[1] = 0x4D; buf[2] = 0x33; buf[3] = 0x21; // 'YM3!'
    for (let f = 0; f < numFrames; f++) {
      const base = 4 + f * 14;
      buf[base + 0] = 100; // tone A period lo = 100
      buf[base + 1] = 0;   // tone A period hi = 0  → period = 100
      buf[base + 7] = 0x38; // mixer: bits 0-2 = tone A/B/C enable (0=on), 0b111000 = all tones on
      buf[base + 8] = 8;   // vol A = 8
    }
    const song = await parseYMFile(buf.buffer, 'test.ym');
    expect(song.numChannels).toBe(3);
    const ch0 = song.patterns[0].channels[0];
    const hasNote = ch0.rows.some(r => r.note > 0 && r.note < 97);
    expect(hasNote).toBe(true);
  });
});
