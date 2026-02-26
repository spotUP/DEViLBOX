import { describe, it, expect } from 'vitest';
import { isVGMFormat, parseVGMFile } from '../formats/VGMParser';

function makeVGMHeader(overrides: Partial<Record<string, number>> = {}): ArrayBuffer {
  const buf = new Uint8Array(0x100);
  const dv = new DataView(buf.buffer);
  // Magic
  buf[0] = 0x56; buf[1] = 0x67; buf[2] = 0x6D; buf[3] = 0x20; // "Vgm "
  dv.setUint32(0x04, 0x100 - 4, true); // EOF offset
  dv.setUint32(0x08, 0x00000161, true); // version 1.61
  dv.setUint32(0x2C, 7670454, true); // YM2612 clock (7.67 MHz = NTSC)
  dv.setUint32(0x34, 0x0C, true); // VGM data offset relative to 0x34 → data at 0x40
  // Data: just end-of-data command
  buf[0x40] = 0x66;
  return buf.buffer;
}

describe('VGMParser', () => {
  it('detects valid VGM by magic bytes', () => {
    expect(isVGMFormat(makeVGMHeader())).toBe(true);
  });

  it('rejects non-VGM data', () => {
    const buf = new Uint8Array(16);
    expect(isVGMFormat(buf.buffer)).toBe(false);
  });

  it('parses a minimal VGM with YM2612', async () => {
    const song = await parseVGMFile(makeVGMHeader(), 'test.vgm');
    expect(song.name).toContain('test');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('FurnaceOPN');
    expect(song.patterns.length).toBeGreaterThan(0);
  });
});
