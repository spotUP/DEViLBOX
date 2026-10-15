/**
 * OPL3 (AdLib) sounds, end to end: the REAL OPL3Synth -> the real worklet -> the real Nuked OPL3 WASM (public/opl3).
 *
 * History this guards (2026-10-15, owner: "AdLib / OPL3 plays silent when I change preset, and it may have low volume"):
 *  - a patch from a song import (RAD/HSC: total level as the chip's register, 0 = loud) was packed as an attenuation of
 *    63 - level, so every loud carrier became silent (see oplLevelConvention.test.ts for the import side);
 *  - the synth's own patch state started with a silent carrier (op2Level 0), so the FIRST knob or preset edit
 *    silenced a working default patch;
 *  - the store's edit path (updateComplexSynthParameters -> applyConfig) did not exist on the synth: edits never arrived;
 *  - a synth made from an instrument config ignored the config until the first edit;
 *  - velocity attenuation was added into the stored channel patch on every note-on: a tracker channel got quieter with
 *    each retrigger below full velocity;
 *  - level: one voice peaked at -18 dBFS, 11.6 dB under the CZ-101.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
vi.mock('@/utils/audio-context', async () => {
  const actual = await vi.importActual<typeof import('@/utils/audio-context')>('@/utils/audio-context');
  const rig = await import('./opl3SynthRig');
  return { ...actual, getDevilboxAudioContext: () => rig.makeFakeContext() };
});
import { installOpl3Globals, render, settle, peakDb, rmsDb } from './opl3SynthRig';
import { OPL3Synth } from '../OPL3Synth';
import { totalLevelToLevel } from '../oplLevel';
import { DEFAULT_OPL3 } from '@/types/instrument/defaults';
import type { OPL3Config } from '@/types/instrument/tonejs';
import { updateComplexSynthParameters } from '@/engine/tone/SynthParameterUpdates';

/**
 * Reference level: the CZ-101 (the other WASM FM synth, volumeOffsetDb 0, i.e. unity output like OPL3) playing its Init
 * patch at velocity 1.0 for 1.5 s measured -6.5 dBFS peak, -9.5 dBFS RMS (probe through cz101WorkletSounds' rig).
 */
const REFERENCE_PEAK_DB = -6.5;
const LEVEL_TOLERANCE_DB = 3;
/** A patch must be this far above digital silence to count as sounding. */
const AUDIBLE_FLOOR_DB = -40;

/** Classic AdLib patches as the 11 register bytes an SBI/RAD file holds (TL = the chip's attenuation, 0 = loud). */
const REGISTER_PATCHES: Array<{ name: string; regs: number[] }> = [
  { name: 'Electric Piano (carrier TL 0)', regs: [0x01, 0x11, 0x4f, 0x00, 0xf1, 0xd2, 0x53, 0x74, 0, 0, 0x06] },
  { name: 'Organ (additive)', regs: [0x22, 0x21, 0x10, 0x10, 0xf0, 0xf0, 0x0f, 0x0f, 0, 0, 0x01] },
  { name: 'Brass (feedback 7)', regs: [0x21, 0x21, 0x1c, 0x00, 0xa2, 0x82, 0x4f, 0x2c, 0, 0, 0x0e] },
  { name: 'Bass (low multiplier)', regs: [0x00, 0x01, 0x0e, 0x00, 0xf3, 0xf4, 0x2a, 0x1a, 0, 0, 0x08] },
  { name: 'Flute (square)', regs: [0x31, 0x21, 0x28, 0x08, 0x84, 0x84, 0x24, 0x34, 6, 0, 0x00] },
  { name: 'Pad (slow attack, key scaling)', regs: [0x61, 0x61, 0x1b, 0x80, 0x44, 0x54, 0x1f, 0x2f, 0, 0, 0x02] },
  { name: 'Quiet carrier (TL 20)', regs: [0x01, 0x01, 0x3f, 0x14, 0xf2, 0xf2, 0x14, 0x14, 0, 0, 0x00] },
  { name: 'Percussive abs-sine', regs: [0x11, 0x01, 0x20, 0x04, 0xf8, 0xf8, 0x77, 0x67, 2, 1, 0x0c] },
  { name: 'Modulator-only level (additive, carrier off)', regs: [0x01, 0x01, 0x00, 0x3f, 0xf2, 0xf2, 0x14, 0x14, 0, 0, 0x01] },
];

/** The instrument's `opl3` config the way the importers build it from register bytes (config level = 63 - TL). */
function configFromRegisters(r: number[]): OPL3Config {
  return {
    op1Tremolo: (r[0] >> 7) & 1, op1Vibrato: (r[0] >> 6) & 1, op1SustainHold: (r[0] >> 5) & 1, op1KSR: (r[0] >> 4) & 1, op1Multi: r[0] & 15,
    op2Tremolo: (r[1] >> 7) & 1, op2Vibrato: (r[1] >> 6) & 1, op2SustainHold: (r[1] >> 5) & 1, op2KSR: (r[1] >> 4) & 1, op2Multi: r[1] & 15,
    op1KSL: r[2] >> 6, op1Level: totalLevelToLevel(r[2] & 63), op2KSL: r[3] >> 6, op2Level: totalLevelToLevel(r[3] & 63),
    op1Attack: r[4] >> 4, op1Decay: r[4] & 15, op2Attack: r[5] >> 4, op2Decay: r[5] & 15,
    op1Sustain: r[6] >> 4, op1Release: r[6] & 15, op2Sustain: r[7] >> 4, op2Release: r[7] & 15,
    op1Waveform: r[8] & 7, op2Waveform: r[9] & 7, feedback: (r[10] >> 1) & 7, connection: r[10] & 1,
  };
}

async function newSynth(config?: OPL3Config): Promise<OPL3Synth> {
  const s = new OPL3Synth(config);
  await s.ensureInitialized();
  await settle();
  return s;
}

/** Play one note and let it ring out, so the next measurement starts from a quiet chip. Returns the held note's levels. */
async function playNote(s: OPL3Synth, note = 60, velocity = 1, hold = 0.5) {
  s.triggerAttack(note, undefined, velocity);
  await settle();
  const held = render(hold);
  s.triggerRelease(note);
  await settle();
  render(2.5);
  return { peak: peakDb(held), rms: rmsDb(held) };
}

beforeAll(() => { installOpl3Globals(); });

describe('OPL3 presets all sound, at a sensible level', () => {
  it('a synth built from an instrument config plays that config, not a silent default', async () => {
    const s = await newSynth(DEFAULT_OPL3);
    const { peak } = await playNote(s);
    expect(peak).toBeGreaterThan(AUDIBLE_FLOOR_DB);
  });

  it('every register patch renders audio above the floor when applied the way the store applies a preset (applyConfig)', async () => {
    const s = await newSynth();
    const silent: string[] = [];
    for (const p of REGISTER_PATCHES) {
      s.applyConfig(configFromRegisters(p.regs));
      await settle();
      const { peak } = await playNote(s);
      if (!(peak > AUDIBLE_FLOOR_DB)) silent.push(`${p.name} (${peak.toFixed(1)} dBFS)`);
    }
    expect(silent).toEqual([]);
  });

  it('the store edit path reaches the synth: updateComplexSynthParameters changes what the chip plays', async () => {
    const s = await newSynth();
    const ctx = { instruments: new Map([[1, s]]), instrumentIdFromKey: (k: number) => k } as unknown as Parameters<typeof updateComplexSynthParameters>[0];
    const quiet = await (async () => {
      updateComplexSynthParameters(ctx, 1, { ...DEFAULT_OPL3, op2Level: 20 });
      await settle();
      return playNote(s);
    })();
    updateComplexSynthParameters(ctx, 1, { ...DEFAULT_OPL3, op2Level: 63 });
    await settle();
    const loud = await playNote(s);
    expect(loud.peak - quiet.peak).toBeGreaterThan(15); // 43 TL steps of 0.75 dB, less the envelope's own shape
  });

  it('a default-config note is within the documented tolerance of the CZ-101 reference peak', async () => {
    const s = await newSynth(DEFAULT_OPL3);
    const { peak } = await playNote(s, 60, 1, 1.5);
    expect(Math.abs(peak - REFERENCE_PEAK_DB)).toBeLessThanOrEqual(LEVEL_TOLERANCE_DB);
  });

  it('a preset change followed by a retrigger plays the NEW preset at its own level (not the old one, not silence)', async () => {
    const s = await newSynth();
    const loud = configFromRegisters(REGISTER_PATCHES[0].regs);
    const quiet = configFromRegisters(REGISTER_PATCHES[6].regs);
    s.applyConfig(loud); await settle();
    const first = await playNote(s);
    s.applyConfig(quiet); await settle();
    const second = await playNote(s);
    s.applyConfig(loud); await settle();
    const third = await playNote(s);
    expect(second.peak).toBeGreaterThan(AUDIBLE_FLOOR_DB);
    expect(second.peak).toBeLessThan(first.peak - 6);
    expect(Math.abs(third.peak - first.peak)).toBeLessThan(0.5);
  });

  it('a tracker channel retriggered below full velocity does not get quieter with each note', async () => {
    const s = await newSynth();
    s.setChannel(3);
    s.applyConfig(DEFAULT_OPL3); await settle();
    const peaks: number[] = [];
    for (let i = 0; i < 10; i++) peaks.push((await playNote(s, 60, 0.5, 0.3)).peak);
    expect(peaks[9]).toBeGreaterThan(peaks[0] - 1);
    expect(peaks[9]).toBeGreaterThan(AUDIBLE_FLOOR_DB);
  });

  it('full polyphony (all 18 chip channels, loud patch) stays inside full scale and finite', async () => {
    const s = await newSynth();
    s.applyConfig(configFromRegisters(REGISTER_PATCHES[0].regs)); await settle();
    for (let ch = 0; ch < 18; ch++) {
      s.setChannel(ch);
      s.applyConfig(configFromRegisters(REGISTER_PATCHES[0].regs));
      s.triggerAttack(48 + ch, undefined, 1);
    }
    await settle();
    const x = render(0.6);
    expect(x.every(Number.isFinite)).toBe(true);
    let max = 0;
    for (const v of x) max = Math.max(max, Math.abs(v));
    expect(max).toBeLessThanOrEqual(1.0);
    expect(max).toBeGreaterThan(0.5); // and it is loud, not squashed to nothing
  });
});
