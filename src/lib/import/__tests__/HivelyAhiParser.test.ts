import { describe, it, expect } from 'vitest';
import { exportAsAhi } from '../../export/HivelyExporter';
import { parseAhiFile } from '../formats/HivelyParser';
import type { HivelyConfig } from '../../../types/instrument';

const FULL_CONFIG: HivelyConfig = {
  volume: 48,
  waveLength: 1,
  filterLowerLimit: 15,
  filterUpperLimit: 62,
  filterSpeed: 37,   // 0b100101 — tests both byte fields
  squareLowerLimit: 8,
  squareUpperLimit: 56,
  squareSpeed: 7,
  vibratoDelay: 12,
  vibratoSpeed: 16,
  vibratoDepth: 5,
  hardCutRelease: true,
  hardCutReleaseFrames: 3,
  envelope: { aFrames: 2, aVolume: 55, dFrames: 8, dVolume: 30, sFrames: 20, rFrames: 6, rVolume: 0 },
  performanceList: {
    speed: 3,
    entries: [
      { note: 0,  waveform: 2, fixed: false, fx: [0, 0], fxParam: [0, 0]    },
      { note: 24, waveform: 1, fixed: true,  fx: [1, 3], fxParam: [16, 32]  },
      { note: 0,  waveform: 0, fixed: false, fx: [12, 15], fxParam: [0, 0]  },
    ],
  },
};

describe('parseAhiFile — THXI round-trip', () => {
  it('parses back all scalar fields correctly', () => {
    const bytes = exportAsAhi(FULL_CONFIG, 'My Instrument');
    const { config, name } = parseAhiFile(bytes.buffer);

    expect(name).toBe('My Instrument');
    expect(config.volume).toBe(FULL_CONFIG.volume);
    expect(config.waveLength).toBe(FULL_CONFIG.waveLength);
    expect(config.filterSpeed).toBe(FULL_CONFIG.filterSpeed);
    expect(config.filterLowerLimit).toBe(FULL_CONFIG.filterLowerLimit);
    expect(config.filterUpperLimit).toBe(FULL_CONFIG.filterUpperLimit);
    expect(config.squareLowerLimit).toBe(FULL_CONFIG.squareLowerLimit);
    expect(config.squareUpperLimit).toBe(FULL_CONFIG.squareUpperLimit);
    expect(config.squareSpeed).toBe(FULL_CONFIG.squareSpeed);
    expect(config.vibratoDelay).toBe(FULL_CONFIG.vibratoDelay);
    expect(config.vibratoSpeed).toBe(FULL_CONFIG.vibratoSpeed);
    expect(config.vibratoDepth).toBe(FULL_CONFIG.vibratoDepth);
    expect(config.hardCutRelease).toBe(FULL_CONFIG.hardCutRelease);
    expect(config.hardCutReleaseFrames).toBe(FULL_CONFIG.hardCutReleaseFrames);
  });

  it('parses envelope correctly', () => {
    const { config } = parseAhiFile(exportAsAhi(FULL_CONFIG, 'x').buffer);
    expect(config.envelope).toEqual(FULL_CONFIG.envelope);
  });

  it('parses plist speed and entry count', () => {
    const { config } = parseAhiFile(exportAsAhi(FULL_CONFIG, 'x').buffer);
    expect(config.performanceList.speed).toBe(3);
    expect(config.performanceList.entries).toHaveLength(3);
  });

  it('decodes AHX fx mapping 12→6→12 and 15→7→15', () => {
    const { config } = parseAhiFile(exportAsAhi(FULL_CONFIG, 'x').buffer);
    const entry2 = config.performanceList.entries[2];
    expect(entry2.fx[0]).toBe(12);
    expect(entry2.fx[1]).toBe(15);
  });
});

describe('parseAhiFile — HVLI round-trip', () => {
  it('round-trips HVL-format instruments', () => {
    const cfg: HivelyConfig = {
      ...FULL_CONFIG,
      performanceList: {
        speed: 1,
        entries: [{ note: 5, waveform: 3, fixed: true, fx: [8, 0], fxParam: [0xAB, 0] }],
      },
    };
    const bytes = exportAsAhi(cfg, 'hvlinst');
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('HVLI');
    const { config, name } = parseAhiFile(bytes.buffer);
    expect(name).toBe('hvlinst');
    expect(config.performanceList.entries[0].fx[0]).toBe(8);
    expect(config.performanceList.entries[0].note).toBe(5);
    expect(config.performanceList.entries[0].fixed).toBe(true);
    expect(config.performanceList.entries[0].fxParam[0]).toBe(0xAB);
  });
});

describe('parseAhiFile — error cases', () => {
  it('throws on too-short buffer', () => {
    expect(() => parseAhiFile(new ArrayBuffer(10))).toThrow('too short');
  });

  it('throws on invalid magic', () => {
    const buf = new Uint8Array(30);
    expect(() => parseAhiFile(buf.buffer)).toThrow('Invalid .ahi magic');
  });
});
