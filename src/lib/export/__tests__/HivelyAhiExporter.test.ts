import { describe, it, expect } from 'vitest';
import { exportAsAhi } from '../HivelyExporter';
import type { HivelyConfig } from '../../../types/instrument';

const SIMPLE_CONFIG: HivelyConfig = {
  volume: 50,
  waveLength: 2,
  filterLowerLimit: 10,
  filterUpperLimit: 30,
  filterSpeed: 37,          // 6-bit value: 37 = 0b100101, tests both bit fields
  squareLowerLimit: 20,
  squareUpperLimit: 60,
  squareSpeed: 3,
  vibratoDelay: 4,
  vibratoSpeed: 8,
  vibratoDepth: 3,
  hardCutRelease: true,
  hardCutReleaseFrames: 2,
  envelope: { aFrames: 3, aVolume: 60, dFrames: 5, dVolume: 40, sFrames: 10, rFrames: 4, rVolume: 0 },
  performanceList: {
    speed: 2,
    entries: [
      { note: 0, waveform: 2, fixed: false, fx: [0, 0], fxParam: [0, 0] },
      { note: 12, waveform: 1, fixed: true, fx: [1, 3], fxParam: [0x10, 0x20] },
    ],
  },
};

describe('exportAsAhi', () => {
  it('writes THXI magic when all FX ≤ 5', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'test');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('THXI');
  });

  it('writes HVLI magic when FX > 5 present', () => {
    const cfg: HivelyConfig = {
      ...SIMPLE_CONFIG,
      performanceList: {
        speed: 1,
        entries: [{ note: 0, waveform: 0, fixed: false, fx: [8, 0], fxParam: [0, 0] }],
      },
    };
    const bytes = exportAsAhi(cfg, 'hvl');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('HVLI');
  });

  it('encodes volume in byte 4', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'x');
    expect(bytes[4]).toBe(50);
  });

  it('encodes filterSpeed low 5 bits in byte 5 bits 7-3', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'x');
    // filterSpeed = 37 = 0b100101; low 5 bits = 0b00101 = 5
    expect((bytes[5] >> 3) & 0x1f).toBe(37 & 0x1f);
  });

  it('encodes filterSpeed bit 5 in byte 16 bit 7', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'x');
    // filterSpeed = 37 = 0b100101; bit 5 = 1
    expect((bytes[16] >> 7) & 1).toBe((37 >> 5) & 1);
  });

  it('appends null-terminated name', () => {
    const bytes = exportAsAhi(SIMPLE_CONFIG, 'hello');
    // Find name after header (26 bytes) + plist entries (2 * 4 bytes for THXI)
    const nameStart = 26 + 2 * 4;
    expect(String.fromCharCode(...bytes.slice(nameStart, nameStart + 5))).toBe('hello');
    expect(bytes[nameStart + 5]).toBe(0);
  });

  it('uses 12→6 and 15→7 FX mapping in AHX plist', () => {
    const cfg: HivelyConfig = {
      ...SIMPLE_CONFIG,
      performanceList: {
        speed: 1,
        entries: [{ note: 0, waveform: 0, fixed: false, fx: [12, 15], fxParam: [0, 0] }],
      },
    };
    const bytes = exportAsAhi(cfg, 'x');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('THXI');
    const plistByte0 = bytes[26];
    const fx1Packed = (plistByte0 >> 5) & 7;
    const fx0Packed = (plistByte0 >> 2) & 7;
    expect(fx0Packed).toBe(6); // 12 → 6
    expect(fx1Packed).toBe(7); // 15 → 7
  });
});
