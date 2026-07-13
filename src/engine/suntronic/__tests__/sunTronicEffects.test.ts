/**
 * Regression: SunTronic native pitch/volume envelope (EFFECTS port).
 *
 * Pins the two Paula outputs the replayer computes per tick — note→period via
 * the baked PERIODS LUT (with 8-bit fractional interpolation) and
 * volEnvTable*voiceVolume>>7 — plus envelope-index wrap. These are exact,
 * unambiguous transcriptions from DP_Suntronic.s @415-496; they fail on revert
 * (a wrong LUT index, missing interpolation, or dropped envelope wrap all trip
 * an exact check). Vibrato/arp modulation paths are exercised via zero-depth /
 * empty-drin here; sample-exact modulated parity is the UADE oracle's job.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score, type SunSynthInstrument } from '@/lib/import/formats/SunTronicV13';
import { stepEffects, createPitchState, SUN_PERIODS } from '../SunTronicEffects';

function inst(p: Partial<SunSynthInstrument> = {}): SunSynthInstrument {
  return {
    recordOff: 0,
    volEnvOff: 0, volEnvLen: 1, volEnvLoop: 0,
    freqEnvOff: 0, freqEnvLen: 1, freqEnvLoop: 0, freqEnvSpeed: 0,
    arpTableOff: 0, arpLen: 1, arpLoop: 0,
    wave1Off: 0, wave2Off: 0, waveWordLen: 1, synthType: 0,
    wave1: new Int8Array(0), wave2: new Int8Array(0), arpTable: new Int8Array([0]),
    volEnv: new Int8Array([0x40]), vibDepth: new Int8Array([0]),
    ...p,
  };
}

describe('SunTronic native pitch/volume (EFFECTS port)', () => {
  it('PERIODS table is the baked LUT (12 guard words then Periods:)', () => {
    expect(SUN_PERIODS.slice(0, 12).every((v) => v === 0x3e)).toBe(true);
    expect(SUN_PERIODS[12]).toBe(0x3e); // note 0
    expect(SUN_PERIODS[24]).toBe(0x87);
    expect(SUN_PERIODS[25]).toBe(0x8f);
  });

  it('integer note, no vibrato/arp → period = PERIODS[note]', () => {
    // pitch = note 24, fraction 0 → period = SUN_PERIODS[24] = 0x87
    const st = createPitchState(24 << 8, 0x80);
    const out = stepEffects(inst(), st);
    expect(out.period).toBe(0x87);
  });

  it('fractional pitch interpolates between adjacent period entries', () => {
    // pitch = 24 + 0x80/256 → period = P[24] + ((P[25]-P[24])*0x80 >> 8)
    //  = 0x87 + ((0x8f-0x87)*128 >> 8) = 0x87 + (8*128>>8) = 0x87 + 4 = 0x8b
    const st = createPitchState((24 << 8) | 0x80, 0x80);
    const out = stepEffects(inst(), st);
    expect(out.period).toBe(0x8b);
  });

  it('volume = volEnvTable[idx] * voiceVolume >> 7', () => {
    // volEnv 0x40, voiceVolume 0x80 → 0x40*0x80>>7 = 0x40
    const st = createPitchState(24 << 8, 0x80);
    const out = stepEffects(inst({ volEnv: new Int8Array([0x40]) }), st);
    expect(out.volume).toBe(0x40);
    // half voice volume → half output
    const st2 = createPitchState(24 << 8, 0x40);
    expect(stepEffects(inst({ volEnv: new Int8Array([0x40]) }), st2).volume).toBe(0x20);
  });

  it('volume-envelope index advances and wraps volEnvLen → volEnvLoop', () => {
    const i = inst({ volEnv: new Int8Array([10, 20, 30]), volEnvLen: 3, volEnvLoop: 1 });
    const st = createPitchState(24 << 8, 0x80);
    expect(st.volEnvIndex).toBe(0);
    stepEffects(i, st); expect(st.volEnvIndex).toBe(1);
    stepEffects(i, st); expect(st.volEnvIndex).toBe(2);
    stepEffects(i, st); expect(st.volEnvIndex).toBe(1); // wrapped to loop
  });

  it('mule.src synth[0]: produces an in-range Paula period + volume', () => {
    const buf = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src')));
    const s0 = parseSunTronicV13Score(buf).synthInstruments[0];
    expect(s0.volEnv.length).toBeGreaterThan(0);
    const st = createPitchState(24 << 8, 0x40);
    const out = stepEffects(s0, st);
    expect(out.period).toBeGreaterThanOrEqual(0x3e);
    expect(out.period).toBeLessThanOrEqual(0xfe0);
    expect(out.volume).toBeGreaterThanOrEqual(0);
    expect(out.volume).toBeLessThanOrEqual(0xff);
  });
});
