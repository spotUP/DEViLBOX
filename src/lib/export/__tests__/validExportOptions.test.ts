import { describe, it, expect } from 'vitest';
import { validExportOptions, type ValidExportInput } from '../validExportOptions';

const none = { arcade: false, vectrex: false, zx128: false, zxbeeper: false };
const base: ValidExportInput = {
  maxChannels: 4, instrumentCount: 1, synthTypes: ['Sampler'],
  nativeAvailable: false, adfAvailable: false, isFurnaceEditor: false, furnaceModuleAvailable: false,
  furnaceAyAvailable: none, gbRom: false, mdRom: false, pceRom: false, c64Prg: false, smsRom: false,
  nesRom: false, quadTone: false, tad: false,
};
const set = (o: Partial<ValidExportInput>) => [...validExportOptions({ ...base, ...o })].sort();
const ALWAYS = ['audio', 'midi', 'song'];

describe('validExportOptions', () => {
  it('MOD (4ch samples, native + adf): module formats, native, adf, no chip', () => {
    expect(set({ nativeAvailable: true, adfAvailable: true })).toEqual(
      [...ALWAYS, 'adf', 'instrument', 'it', 'mod', 'nano', 'native', 's3m', 'sfx', 'xm'].sort());
  });
  it('XM with 40 channels: no MOD/XM/S3M (limit 32), IT stays (64)', () => {
    const s = set({ maxChannels: 40 });
    expect(s).toContain('it');
    for (const m of ['mod', 'xm', 's3m']) expect(s).not.toContain(m);
  });
  it('Furnace .fur NES: no module formats, fur + NES ROM, chip log', () => {
    const s = set({ synthTypes: ['FurnaceNES'], isFurnaceEditor: true, nesRom: true, maxChannels: 5 });
    expect(s).toEqual([...ALWAYS, 'chip', 'fur', 'furText', 'instrument', 'nano', 'nesRom', 'nsfe', 'sfx'].sort());
  });
  it('SID: chip log + C64 prg, no module formats', () => {
    const s = set({ synthTypes: ['SidSynth'], c64Prg: true, maxChannels: 3 });
    expect(s).toContain('c64Prg'); expect(s).toContain('chip');
    for (const m of ['mod', 'xm', 'it', 's3m', 'native', 'adf', 'fur']) expect(s).not.toContain(m);
  });
  it('pxtone: native only when router matches; no module formats', () => {
    const s = set({ synthTypes: ['PxtoneSynth'], nativeAvailable: true, maxChannels: 8 });
    expect(s).toContain('native'); expect(s).not.toContain('xm');
  });
  it('UADE format (sample voices, native + adf)', () => {
    const s = set({ synthTypes: ['Sampler', 'UADESynth'], nativeAvailable: true, adfAvailable: true });
    expect(s).toContain('adf'); expect(s).toContain('mod');
  });
  it('PC tracker (S3M-like, 16ch samples): module formats, no ROM/chip/adf', () => {
    expect(set({ maxChannels: 16 })).toEqual(
      [...ALWAYS, 'instrument', 'it', 'mod', 'nano', 's3m', 'sfx', 'xm'].sort());
  });
  it('empty song: only the always-valid options', () => {
    expect(set({ instrumentCount: 0, synthTypes: [], maxChannels: 0 })).toEqual(ALWAYS);
  });
});
