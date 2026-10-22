/**
 * The synth effect processor reads the volume column through the shared decoder, so an XM
 * volume byte (0x10-0x50) lands as the level it names and a raw 0-64 level (native-replayer
 * editor modes) lands as itself. Before the fix it read the raw byte in every mode, so an XM
 * cell of 0x30 (level 32) made the channel play at 48 and 0x10 (silent) played at 16.
 */
import { describe, expect, it } from 'vitest';
import { SynthEffectProcessor, type EffectPatternCell, type SynthEffectDeps } from '../SynthEffectProcessor';

const INST = 3;
const TICK = 2.5 / 125;
const FX_VOLUME_SLIDE = 0xA;

function cell(volume: number, effTyp = 0, eff = 0, note = 0): EffectPatternCell {
  return { note, instrument: note ? INST : 0, effTyp, eff, volume };
}

/** Run rows through the processor and return every channel gain it emits, in order. */
function gains(rows: EffectPatternCell[], editorMode: string | null): number[] {
  const sent: number[] = [];
  const deps: SynthEffectDeps = {
    getReplacedInstruments: () => new Set([INST]),
    getPatternCell: (_ch, r) => rows[r] ?? null,
    getChannelCount: () => 1,
    getEditorMode: () => editorMode,
    getInstrumentDefaultVolume: () => 64,
    noteVolumeIsVelocity: () => false,
    applySynthFrequency: () => {},
    setChannelGain: (_ch, gain) => { sent.push(gain); },
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
    t += 6 * TICK;
  }
  return sent;
}

/** An A01 slide down on the next row exposes the level the column set: first tick emits level - 1. */
const slideDown = cell(0, FX_VOLUME_SLIDE, 0x01);

describe('SynthEffectProcessor volume column', () => {
  it('reads an XM volume byte as the level it names in classic mode', () => {
    const sent = gains([cell(0x30, 0, 0, 49), slideDown], 'classic');
    // sent[0] is the note's own level; sent[1] is the first slide tick.
    expect(sent[0]).toBeCloseTo(32 / 64, 6);
    expect(sent[1]).toBeCloseTo((32 - 1) / 64, 6);
  });

  it('reads XM 0x10 as silence, not level 16', () => {
    const sent = gains([cell(0x10, 0, 0, 49), slideDown], 'classic');
    expect(sent[0]).toBe(0);
  });

  it('ignores an XM volume-column effect byte and an empty column', () => {
    // 0x80 is a volume-column command, not a level; 0 is empty. Both leave the C40 level alone.
    const sent = gains([cell(0, 0xC, 0x40, 49), cell(0x80), cell(0), slideDown], 'classic');
    // sent[0] is the C40 itself, sent[1] the note's level; sent[2] is the first slide tick.
    expect(sent[2]).toBeCloseTo((64 - 1) / 64, 6);
  });

  it('reads a raw 0-64 level as itself in a native-replayer mode', () => {
    const sent = gains([cell(32, 0, 0, 49), slideDown], 'hively');
    expect(sent[0]).toBeCloseTo(32 / 64, 6);
    expect(sent[1]).toBeCloseTo((32 - 1) / 64, 6);
  });

  it('applies the decoded level to a delayed note', () => {
    const delayed: number[] = [];
    const rows = [cell(0x30, 0xE, 0xD2, 49)];
    const deps: SynthEffectDeps = {
      getReplacedInstruments: () => new Set([INST]),
      getPatternCell: (_ch, r) => rows[r] ?? null,
      getChannelCount: () => 1,
      getEditorMode: () => 'classic',
      getInstrumentDefaultVolume: () => 64,
      noteVolumeIsVelocity: () => false,
      applySynthFrequency: () => {},
      setChannelGain: () => {},
      setChannelPan: () => {},
      getChannelBaseFrequency: () => 261.6256,
      getChannelInstrumentId: () => INST,
      retriggerNote: () => {},
      triggerDelayedNote: (_ch, _note, _inst, volume) => { delayed.push(volume); },
    };
    const fx = new SynthEffectProcessor(deps);
    for (let tick = 0; tick < 6; tick++) fx.process(tick * TICK + TICK / 2, 0, 0, 6, 125);
    expect(delayed).toEqual([32]);
  });
});
