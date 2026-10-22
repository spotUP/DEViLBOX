/**
 * Synth pitch effects keep the channel's real pitch (note plus portamento) apart from the
 * vibrato and arpeggio offsets, like FT2: an offset sounds only on the ticks its effect runs,
 * and every row starts again at the real pitch.
 */
import { describe, expect, it } from 'vitest';
import { SynthEffectProcessor, type EffectPatternCell, type SynthEffectDeps } from '../SynthEffectProcessor';

const C4 = 261.6256;
const INST = 3;
const TICK = 2.5 / 125;

function cell(note: number, effTyp = 0, eff = 0): EffectPatternCell {
  return { note, instrument: note ? INST : 0, effTyp, eff, volume: 0 };
}

function run(rows: EffectPatternCell[]) {
  const sent: { row: number; freq: number }[] = [];
  let row = 0;
  const deps: SynthEffectDeps = {
    getReplacedInstruments: () => new Set([INST]),
    getPatternCell: (_ch, r) => rows[r] ?? null,
    getChannelCount: () => 1,
    getEditorMode: () => 'classic',
    getInstrumentDefaultVolume: () => 64,
    noteVolumeIsVelocity: () => false,
    applySynthFrequency: (_id, freq) => { sent.push({ row, freq }); },
    setChannelGain: () => {},
    setChannelPan: () => {},
    getChannelBaseFrequency: () => C4,
    getChannelInstrumentId: () => INST,
    retriggerNote: () => {},
    triggerDelayedNote: () => {},
  };
  const fx = new SynthEffectProcessor(deps);
  let t = 0;
  for (row = 0; row < rows.length; row++) {
    for (let tick = 0; tick < 6; tick++) {
      fx.process(t + tick * TICK + TICK / 2, row, 0, 6, 125);
    }
    t += 6 * TICK;
  }
  return sent;
}

const lastOfRow = (sent: { row: number; freq: number }[], row: number) =>
  sent.filter((s) => s.row === row).at(-1)?.freq;

describe('SynthEffectProcessor pitch restore', () => {
  it('returns to the note pitch on the row after vibrato ends', () => {
    const sent = run([cell(49, 0x4, 0x88), cell(0, 0x4, 0x88), cell(0)]);
    expect(sent.some((s) => s.row === 1 && Math.abs(s.freq - C4) > 5)).toBe(true);
    expect(lastOfRow(sent, 2)).toBeCloseTo(C4, 3);
  });

  it('returns to the note pitch on the row after arpeggio ends, and arpeggio does not drift', () => {
    const sent = run([cell(49, 0x0, 0x47), cell(0, 0x0, 0x47), cell(0)]);
    const row1 = sent.filter((s) => s.row === 1).map((s) => s.freq);
    expect(Math.max(...row1)).toBeCloseTo(C4 * Math.pow(2, 7 / 12), 3);
    expect(lastOfRow(sent, 2)).toBeCloseTo(C4, 3);
  });

  it('starts a new note at its own pitch after a portamento slide', () => {
    const sent = run([cell(49), cell(0, 0x2, 0x09), cell(0, 0x2, 0x09), cell(49)]);
    expect(lastOfRow(sent, 2)!).toBeLessThan(C4 * 0.97);
    expect(lastOfRow(sent, 3)).toBeCloseTo(C4, 3);
  });

  it('vibrates around the pitch portamento reached, not the note pitch', () => {
    const sent = run([cell(49), cell(0, 0x1, 0x20), cell(0, 0x4, 0x88)]);
    const portaEnd = lastOfRow(sent, 1)!;
    expect(portaEnd).toBeGreaterThan(C4 * 1.05);
    const row2 = sent.filter((s) => s.row === 2).map((s) => s.freq);
    expect(Math.min(...row2)).toBeGreaterThan(C4 * 1.02);
  });
});
