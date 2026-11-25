import { describe, it, expect } from 'vitest';
import { CHIP_TARGETS } from '../wavetable/chipTargets';
import { waveToRawBytes, waveToCHeader, waveToUnitSamples, waveIdentifier } from '../wavetable/waveExport';

const ramp32x16 = Array.from({ length: 32 }, (_, i) => i >> 1); // 0,0,1,1..15,15

describe('waveToRawBytes', () => {
  it('Game Boy packs 32 nibbles into 16 bytes, high nibble first', () => {
    const bytes = waveToRawBytes(ramp32x16, 15, CHIP_TARGETS.gameboy);
    expect(bytes.length).toBe(16);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0x00, 0x11, 0x22]);
    expect(bytes[15]).toBe(0xff);
  });

  it('N163 packs low nibble first', () => {
    const data = Array.from({ length: 32 }, (_, i) => (i & 1 ? 0xa : 0x3));
    const bytes = waveToRawBytes(data, 15, CHIP_TARGETS.n163);
    expect(bytes.length).toBe(16);
    expect(bytes[0]).toBe(0xa3);
  });

  it('SCC writes signed 8-bit: 128 is 0, 0 is -128, 255 is 127', () => {
    const data = new Array(32).fill(128);
    data[0] = 0; data[1] = 255;
    const bytes = waveToRawBytes(data, 255, CHIP_TARGETS.scc);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0x80);
    expect(bytes[1]).toBe(0x7f);
    expect(bytes[2]).toBe(0x00);
  });

  it('FDS writes one 6-bit byte per sample, requantised from 4-bit', () => {
    const bytes = waveToRawBytes(ramp32x16, 15, CHIP_TARGETS.fds);
    expect(bytes.length).toBe(64);
    expect(Math.max(...bytes)).toBe(63);
    expect(Math.min(...bytes)).toBe(0);
  });
});

describe('waveToCHeader', () => {
  it('writes guard, length define and unsigned array for Game Boy', () => {
    const text = waveToCHeader('Lead Wave 1', ramp32x16, 15, CHIP_TARGETS.gameboy);
    expect(text).toContain('#ifndef LEAD_WAVE_1_H');
    expect(text).toContain('#define LEAD_WAVE_1_LEN 32');
    expect(text).toContain('static const unsigned char lead_wave_1[LEAD_WAVE_1_LEN] = {');
    expect(text).toContain('  0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,\n  8, 8,');
    expect(text.trimEnd().endsWith('#endif /* LEAD_WAVE_1_H */')).toBe(true);
  });

  it('writes signed char with centred values for SCC', () => {
    const data = new Array(32).fill(128);
    data[0] = 0;
    const text = waveToCHeader('9bass', data, 255, CHIP_TARGETS.scc);
    expect(text).toContain('static const signed char wave_9bass[WAVE_9BASS_LEN] = {');
    expect(text).toContain('  -128, 0, 0');
  });

  it('identifier falls back to wave', () => {
    expect(waveIdentifier('***')).toBe('wave');
  });
});

describe('waveToUnitSamples', () => {
  it('maps 0..max to -1..1', () => {
    const s = waveToUnitSamples(ramp32x16, 15, CHIP_TARGETS.gameboy);
    expect(s[0]).toBe(-1);
    expect(s[31]).toBe(1);
  });
});
