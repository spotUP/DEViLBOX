/**
 * "The kick sidechains everything": the TR808 and TR909 wrappers expose only a Tone.Volume `volume` Param, so the
 * store's live volume handler (which only wrote `output.gain`) dropped the update and the kick stayed at +18 dB.
 * One owner now sets an instrument's level: setInstrumentVolumeOn writes whichever surface the synth has, applying
 * the same normalization as creation, for every per-channel instance of the instrument.
 */
import { describe, it, expect } from 'vitest';
import { setInstrumentVolumeOn, applyInstrumentOutputLevel } from '../instrumentOutputLevel';
import { getNormalizedVolume } from '../factories/volumeNormalization';

const db = (gain: number) => 20 * Math.log10(gain);

describe('setInstrumentVolumeOn', () => {
  it('a TR808-shaped synth (volume Param only) receives volume + the DrumMachine offset (+18 dB)', () => {
    const tr808 = { volume: { value: 18 } };
    const instruments = new Map<number, unknown>([[(6 << 16) | 1, tr808]]);
    const applied = setInstrumentVolumeOn(instruments, 6, 'DrumMachine', -12);
    expect(applied).toBe(1);
    expect(tr808.volume.value).toBeCloseTo(getNormalizedVolume('DrumMachine', -12), 5);
    expect(tr808.volume.value).toBeCloseTo(-12 + 18, 5);
  });

  it('writes every per-channel instance of the instrument and leaves other instruments alone', () => {
    const a = { output: { gain: { value: 1 } } };
    const b = { output: { gain: { value: 1 } } };
    const other = { output: { gain: { value: 1 } } };
    const instruments = new Map<number, unknown>([[(5 << 16) | 0, a], [(5 << 16) | 0xFFFF, b], [(7 << 16) | 2, other]]);
    expect(setInstrumentVolumeOn(instruments, 5, 'NoSuchSynth', -6)).toBe(2);
    expect(db(a.output.gain.value)).toBeCloseTo(-6, 5);
    expect(db(b.output.gain.value)).toBeCloseTo(-6, 5);
    expect(other.output.gain.value).toBe(1);
  });

  it('prefers the native output gain over an inner volume Param, so a level is never applied twice', () => {
    const both = { output: { gain: { value: 1 } }, volume: { value: 0 } };
    expect(applyInstrumentOutputLevel(both, 'NoSuchSynth', -6)).toBe(true);
    expect(db(both.output.gain.value)).toBeCloseTo(-6, 5);
    expect(both.volume.value).toBe(0);
  });

  it('a synth with neither surface reports false', () => {
    expect(applyInstrumentOutputLevel({}, 'NoSuchSynth', -6)).toBe(false);
  });
});
