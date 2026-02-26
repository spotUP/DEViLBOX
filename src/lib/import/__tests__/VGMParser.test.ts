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

  it('extracts OPM (YM2151) notes from a minimal VGM', async () => {
    // Build a minimal VGM 1.01 with OPM clock and a key-code + key-on pair
    const buf = new ArrayBuffer(0x50);
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);

    // Magic "Vgm "
    u8[0] = 0x56; u8[1] = 0x67; u8[2] = 0x6D; u8[3] = 0x20;
    dv.setUint32(0x04, 0x4C, true);       // EoF offset (relative) = 0x4C → file is 0x50 bytes
    dv.setUint32(0x08, 0x00000101, true); // version 1.01
    dv.setUint32(0x30, 3579545, true);    // YM2151 clock
    dv.setUint32(0x34, 0x0C, true);       // data offset: 0x34 + 0x0C = 0x40

    // Data at 0x40
    let off = 0x40;
    u8[off++] = 0x54; u8[off++] = 0x28; u8[off++] = 0x4A; // KC = 0x4A → octave 4, nibble A (A#4)
    u8[off++] = 0x54; u8[off++] = 0x08; u8[off++] = 0x0F; // key-on ch0 all ops
    u8[off++] = 0x66;                                       // end

    const song = await parseVGMFile(buf, 'test.vgm');
    // Should detect YM2151 and create an OPM instrument
    const opmInst = song.instruments.find(i => /opm|ym2151/i.test(i.name));
    expect(opmInst).toBeDefined();
    // OPM channels start at 0; channel 0 should have a note from the key-on
    const hasNote = song.patterns[0].channels.some(ch => ch.rows.some(r => r.note > 0 && r.note < 97));
    expect(hasNote).toBe(true);
  });

  it('extracts SN76489 PSG notes from a minimal VGM', async () => {
    const vgm = new Uint8Array(0x100).fill(0);
    // Magic
    vgm[0] = 0x56; vgm[1] = 0x67; vgm[2] = 0x6D; vgm[3] = 0x20;
    // Version 1.00 at offset 8
    vgm[8] = 0x00; vgm[9] = 0x01; vgm[10] = 0x00; vgm[11] = 0x00;
    // SN76489 clock at 0x0C: 3579545 Hz
    const clk = 3579545;
    vgm[0x0C] = clk & 0xFF; vgm[0x0D] = (clk >> 8) & 0xFF;
    vgm[0x0E] = (clk >> 16) & 0xFF; vgm[0x0F] = (clk >> 24) & 0xFF;
    // Data at 0x40 (VGM 1.00 has fixed data offset 0x40)
    // Channel 0, tone: counter = 254 → freq ≈ 441 Hz ≈ A4
    // Latch byte: 0x80 | (0<<5) | (0<<4) | (254 & 0x0F) = 0x8E
    // Data byte: (254 >> 4) & 0x3F = 0x0F → plain data byte = 0x0F
    vgm[0x40] = 0x50; vgm[0x41] = 0x8E;  // latch ch0 tone lo = 0xE
    vgm[0x42] = 0x50; vgm[0x43] = 0x0F;  // data hi = 0x0F
    // Set volume on ch0: latch byte 0x90 | 0 = 0x90 (vol=0=max)
    vgm[0x44] = 0x50; vgm[0x45] = 0x90;
    vgm[0x46] = 0x63; // wait 735 samples
    vgm[0x47] = 0x66; // end

    const song = await parseVGMFile(vgm.buffer, 'test.vgm');
    // Should detect SN76489 and create a PSG instrument
    expect(song.instruments.some(i => i.name.toLowerCase().includes('sn') || i.name.toLowerCase().includes('psg'))).toBe(true);
    // Should have at least one non-zero note
    const hasNote = song.patterns[0].channels.some(ch => ch.rows.some(r => r.note > 0 && r.note < 97));
    expect(hasNote).toBe(true);
  });
});
