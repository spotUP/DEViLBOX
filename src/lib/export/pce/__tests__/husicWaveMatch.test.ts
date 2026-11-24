import { describe, expect, it } from 'vitest';
import { heardWaves, type PsgWrite } from '../../../../../tools/pceWaves';

// tools/pce-rom-check.ts waveMatch. Furnace's anti-click (pce.cpp updateWave) writes the wave from the predicted play
// position, HuSIC from sample 0, and the HuSIC boot fills every channel with a ramp at volume 0. Both read as missing
// waves (pcengineasdmo 75, Ma-Da-Ra 71.43/62.5) though the ROM plays the same waveforms. Writes are from pcengineasdmo ch1.
const ROM_WAVE = [0, 0, 0, 0, 1, 2, 4, 5, 9, 11, 13, 14, 16, 17, 19, 21, 10, 12, 13, 15, 17, 18, 20, 21, 25, 27, 29, 30, 31, 31, 31, 31];
const FUR_WAVE = [...ROM_WAVE.slice(28), ...ROM_WAVE.slice(0, 28)]; // 31,31,31,31,0,0,0,0,1,... as Furnace writes it at tick 31
const RAMP = Array.from({ length: 32 }, (_, i) => i);

const load = (ch: number, wave: number[], ctlAfter: number): PsgWrite[] => [
  { tick: 0, reg: 0, val: ch }, { tick: 0, reg: 4, val: 0 },
  ...wave.map((val) => ({ tick: 0, reg: 6, val })),
  { tick: 0, reg: 4, val: ctlAfter },
];

describe('PCE ROM check: wave match is phase-free and counts only played waves', () => {
  it('a rotated copy of the same wave matches', () => {
    const rom = heardWaves(load(1, ROM_WAVE, 0x9c));
    const fur = heardWaves(load(1, FUR_WAVE, 0x9c));
    expect(rom.size).toBe(1);
    expect([...rom]).toEqual([...fur]);
  });

  it('a wave the channel never plays (boot ramp at volume 0) is not counted; DDA mode is not playing a wave', () => {
    expect(heardWaves(load(0, RAMP, 0x80)).size).toBe(0);
    expect(heardWaves(load(0, RAMP, 0xdf)).size).toBe(0);
    expect(heardWaves([...load(0, RAMP, 0x80), ...load(0, ROM_WAVE, 0x9c)]).size).toBe(1);
  });

  it('a different waveform does not match', () => {
    const other = ROM_WAVE.map((v, i) => (i === 5 ? v + 1 : v));
    expect([...heardWaves(load(1, other, 0x9c))]).not.toEqual([...heardWaves(load(1, ROM_WAVE, 0x9c))]);
  });
});
