/**
 * GM parts are written at the pitch they sound: MIDI 28 is a bass guitar's low
 * E (41.2 Hz). The stand-in synths must not shift that. The bass preset carried
 * oscillator octave -1, which the Tone rig turns into -1200 cents, so every
 * imported bass line played an octave too low (owner 2026-10-21, fade_away.mid
 * and fisherman.mid).
 */
import { describe, it, expect } from 'vitest';
import { gmProgramToInstrument, gmFluidInstrument, GM_DRUM_BANK } from '../GMSoundBank';
import { toneRigSettings } from '@engine/tone/toneSynthKnobs';

describe('GM sound bank pitch', () => {
  it('plays every melodic program at the written pitch', () => {
    const shifted: string[] = [];
    for (let program = 0; program < 128; program++) {
      const config = gmProgramToInstrument(program, program + 1, false);
      const cents = toneRigSettings(config.synthType, config).detuneCents;
      if (cents !== 0) shifted.push(`${program} ${config.name}: ${cents} cents`);
    }
    expect(shifted).toEqual([]);
  });
});

describe('GM SoundFont instrument', () => {
  it('carries program, bank and the GM SoundFont, with the program clamped to 0-127', () => {
    const piano = gmFluidInstrument(0, 0, 1, 'Acoustic Grand Piano');
    expect(piano).toMatchObject({ id: 1, name: 'Acoustic Grand Piano', synthType: 'FluidSynth' });
    expect(piano.fluidsynth).toMatchObject({ program: 0, bank: 0, soundFont: 'gm' });
    expect(gmFluidInstrument(200, 0, 2, 'x').fluidsynth?.program).toBe(127);
    expect(gmFluidInstrument(-3, 0, 3, 'x').fluidsynth?.program).toBe(0);
    expect(gmFluidInstrument(0, GM_DRUM_BANK, 4, 'Drums').fluidsynth?.bank).toBe(128);
  });
});
