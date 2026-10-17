import { describe, it, expect, beforeEach } from 'vitest';
import { melodyPreview, drumPreview } from '../takePreview';
import { defaultDrumMap, quantiseHits, usedDrumClasses } from '../drumToNotes';
import { commitDrumHits } from '../drumToNotes';
import { DRUM_808_MIDI } from '../voiceInstruments';
import { quantiseNotes, type QuantiseSettings } from '../quantise';
import { takeCells, NOTE_OFF } from '../writeToPattern';
import type { DrumHit, HitFeatures } from '../drumHits';
import type { VoiceNote } from '../pitchNotes';
import { midiToXMNote } from '@/lib/xmConversions';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { resetStore } from '@/stores/__tests__/_harness';

const Q: QuantiseSettings = { bpm: 125, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0, strength: 1, toleranceRows: 0.1 };
const ROW = 0.12; // seconds per row at 125 BPM, speed 6
const sung = (row: number, rows: number, midi: number): VoiceNote => ({
  startTimeSeconds: row * ROW,
  durationSeconds: rows * ROW,
  pitchMidi: midi,
  amplitude: 0.8,
});
const hit = (row: number, drum: DrumHit['drum']): DrumHit => ({
  timeSeconds: row * ROW,
  drum,
  strength: 1,
  features: {} as HitFeatures,
});
const target = { channelIndex: 2, startRow: 4, instrumentId: 1 };

describe('Voice to Notes ghost notes show what a commit writes (owner report 2026-10-17)', () => {
  beforeEach(() => {
    resetStore(useTrackerStore);
    resetStore(useInstrumentStore);
  });

  it('melody preview holds the commit cells: notes, note-offs, empty rows, at the start row', () => {
    const notes = [sung(0, 2, 60), sung(4, 1, 64)];
    const preview = melodyPreview(notes, Q, target, 64);
    const commit = takeCells(quantiseNotes(notes, Q), target, 64);
    expect(preview).toEqual({ channelIndex: 2, startRow: 4, notes: commit.cells.map((c) => c.note) });
    expect(preview?.notes).toEqual([midiToXMNote(60), 0, NOTE_OFF, 0, midiToXMNote(64), NOTE_OFF]);
  });

  it('no notes, no preview', () => {
    expect(melodyPreview([], Q, target, 64)).toBeNull();
  });

  it('drum preview shows silent classes at the 808 pitch the commit writes, and creates nothing', () => {
    const hits = [hit(0, 'kick'), hit(2, 'snare')];
    const map = defaultDrumMap([]);
    const preview = drumPreview(hits, map, Q, target, 64);
    expect(useInstrumentStore.getState().instruments).toHaveLength(0);
    expect(preview?.notes[0]).toBe(midiToXMNote(DRUM_808_MIDI));
    expect(preview?.notes[2]).toBe(midiToXMNote(DRUM_808_MIDI));
    // The preview is not the raw map: the default map's own pitches differ
    expect(takeCells(quantiseHits(hits, map, Q), target, 64).cells[0].note).not.toBe(preview?.notes[0]);

    commitDrumHits(hits, map, Q, target);
    const rows = useTrackerStore.getState().patterns[0].channels[2].rows;
    expect(preview?.notes).toEqual(rows.slice(4, 4 + (preview?.notes.length ?? 0)).map((r) => r.note));
    expect(usedDrumClasses(hits)).toEqual(['kick', 'snare']);
  });
});
