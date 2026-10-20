/**
 * A synth note's tracker volume has one owner on the hybrid path: the synth effect processor,
 * which sets the channel's lane level. Before the fix a C20 on one note left the lane at half
 * level, and the next note with an instrument (velocity reset to full) played through that
 * half level too, so a Cxx on a TR909 snare quietened every later snare on the channel.
 */
import { describe, expect, it } from 'vitest';
import { SynthEffectProcessor, type EffectPatternCell, type SynthEffectDeps } from '../SynthEffectProcessor';
import { synthNoteVelocity } from '../hybridInstruments';

const INST = 3;
const TICK = 2.5 / 125;
const FX_SET_VOLUME = 0xC;
const FX_EXTENDED = 0xE;

function note(instrument = INST, effTyp = 0, eff = 0, volume = 0): EffectPatternCell {
  return { note: 49, instrument, effTyp, eff, volume };
}

/** Run rows through the processor; return the last gain sent on each row. */
function rowGains(rows: EffectPatternCell[], defaultVolume = 64): (number | undefined)[] {
  let last: number | undefined;
  const perRow: (number | undefined)[] = [];
  const deps: SynthEffectDeps = {
    getReplacedInstruments: () => new Set([INST]),
    getPatternCell: (_ch, r) => rows[r] ?? null,
    getChannelCount: () => 1,
    getEditorMode: () => 'classic',
    getInstrumentDefaultVolume: () => defaultVolume,
    applySynthFrequency: () => {},
    setChannelGain: (_ch, gain) => { last = gain; },
    setChannelPan: () => {},
    getChannelBaseFrequency: () => 261.6256,
    getChannelInstrumentId: () => INST,
    retriggerNote: () => {},
    triggerDelayedNote: () => {},
  };
  const fx = new SynthEffectProcessor(deps);
  let t = 0;
  for (let row = 0; row < rows.length; row++) {
    for (let tick = 0; tick < 6; tick++) {
      fx.process(t + tick * TICK + TICK / 2, row, 0, 6, 125);
    }
    perRow.push(last);
    t += 6 * TICK;
  }
  return perRow;
}

describe('synth note volume has one owner', () => {
  it('plays the note after a C20 at full level when it carries an instrument', () => {
    const g = rowGains([note(INST, FX_SET_VOLUME, 0x20), note()]);
    expect(g[0]).toBeCloseTo(0.5, 6);
    expect(g[1]).toBeCloseTo(1, 6);
  });

  it('starts a note with an instrument at that instrument default volume', () => {
    const g = rowGains([note(INST, FX_SET_VOLUME, 0x10), note()], 48);
    expect(g[1]).toBeCloseTo(48 / 64, 6);
  });

  it('keeps the channel volume for a note without an instrument', () => {
    const g = rowGains([note(INST, FX_SET_VOLUME, 0x20), note(0)]);
    expect(g[1]).toBeCloseTo(0.5, 6);
  });

  it('applies the volume column of a note row', () => {
    const g = rowGains([note(INST, 0, 0, 0x30)]);
    expect(g[0]).toBeCloseTo(32 / 64, 6);
  });

  it('sets a delayed note level when the note fires', () => {
    const g = rowGains([note(INST, FX_SET_VOLUME, 0x20), note(INST, FX_EXTENDED, 0xD2)]);
    expect(g[1]).toBeCloseTo(1, 6);
  });

  it('leaves the tracker volume out of a lane synth velocity', () => {
    expect(synthNoteVelocity(32, 0, true)).toBe(1);
    expect(synthNoteVelocity(32, 0, false)).toBe(0.5);
    expect(synthNoteVelocity(64, 0.2, false)).toBe(1);
  });
});
