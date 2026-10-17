import { describe, it, expect } from 'vitest';
import { NEW_808_INSTRUMENT, defaultDrumMap, quantiseHits } from '../drumToNotes';
import type { DrumHit } from '../drumHits';

const feat = { low: 0, mid: 0, high: 0, decay: 0, zcr: 0, bursts: 1 };
const hit = (drum: DrumHit['drum'], timeSeconds: number, strength: number): DrumHit => ({ drum, timeSeconds, strength, features: feat });
const q = { bpm: 150, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0, strength: 1, toleranceRows: 0.1 };

describe('drumToNotes', () => {
  it('picks instruments by name, else a new TR-808 voice (never the current instrument)', () => {
    const map = defaultDrumMap([{ id: 3, name: 'Big Snare' }, { id: 5, name: 'Closed HH' }, { id: 9, name: 'OPL3 Brass' }]);
    expect([map.kick.instrumentId, map.snare.instrumentId, map.hat.instrumentId, map.clap.instrumentId]).toEqual([NEW_808_INSTRUMENT, 3, 5, NEW_808_INSTRUMENT]);
    expect([map.kick.midi, map.snare.midi, map.hat.midi, map.clap.midi]).toEqual([36, 38, 42, 39]);
  });

  it('maps each class to its note and instrument, one hit per row, louder wins, no note-off', () => {
    const map = { ...defaultDrumMap([{ id: 3, name: 'Snare' }]), kick: { instrumentId: 1, midi: 36 } };
    const rows = quantiseHits([hit('kick', 0.3, 0.4), hit('snare', 0.3, 0.9), hit('kick', 0.8, 0.5)], map, q);
    expect(rows.map((r) => [r.row, r.midi, r.instrumentId, r.noteOff])).toEqual([
      [3, 38, 3, false],
      [8, 36, 1, false],
    ]);
  });
});
