import { describe, it, expect } from 'vitest';
import { defaultDrumMap, quantiseHits } from '../drumToNotes';
import type { DrumHit } from '../drumHits';

const feat = { low: 0, mid: 0, high: 0, decay: 0, zcr: 0, bursts: 1 };
const hit = (drum: DrumHit['drum'], timeSeconds: number, strength: number): DrumHit => ({ drum, timeSeconds, strength, features: feat });
const q = { bpm: 150, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0 };

describe('drumToNotes', () => {
  it('picks instruments by name, else the fallback', () => {
    const map = defaultDrumMap([{ id: 3, name: 'Big Snare' }, { id: 5, name: 'Closed HH' }], 9);
    expect([map.kick.instrumentId, map.snare.instrumentId, map.hat.instrumentId, map.clap.instrumentId]).toEqual([9, 3, 5, 9]);
    expect([map.kick.midi, map.snare.midi, map.hat.midi, map.clap.midi]).toEqual([36, 38, 42, 39]);
  });

  it('maps each class to its note and instrument, one hit per row, louder wins, no note-off', () => {
    const map = defaultDrumMap([{ id: 3, name: 'Snare' }], 1);
    const rows = quantiseHits([hit('kick', 0.3, 0.4), hit('snare', 0.3, 0.9), hit('kick', 0.8, 0.5)], map, q);
    expect(rows.map((r) => [r.row, r.midi, r.instrumentId, r.noteOff])).toEqual([
      [3, 38, 3, false],
      [8, 36, 1, false],
    ]);
  });
});
