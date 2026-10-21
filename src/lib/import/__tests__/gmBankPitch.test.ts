/**
 * GM parts are written at the pitch they sound: MIDI 28 is a bass guitar's low
 * E (41.2 Hz). The stand-in synths must not shift that. The bass preset carried
 * oscillator octave -1, which the Tone rig turns into -1200 cents, so every
 * imported bass line played an octave too low (owner 2026-10-21, fade_away.mid
 * and fisherman.mid).
 */
import { describe, it, expect } from 'vitest';
import { gmProgramToInstrument } from '../GMSoundBank';
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
