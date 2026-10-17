import { describe, it, expect, beforeEach } from 'vitest';
import { commitVoiceNotes } from '../voiceToNotes';
import { commitDrumHits, defaultDrumMap } from '../drumToNotes';
import { VOICE_LEAD_NAME, DRUM_808_MIDI, isPlayable } from '../voiceInstruments';
import type { DrumHit, HitFeatures } from '../drumHits';
import type { VoiceNote } from '../pitchNotes';
import type { QuantiseSettings } from '../quantise';
import { midiToXMNote } from '@/lib/xmConversions';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { resetStore } from '@/stores/__tests__/_harness';

const Q: QuantiseSettings = { bpm: 125, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0 };
const ROW = 0.12; // seconds per row at 125 BPM, speed 6
const sung: VoiceNote[] = [{ startTimeSeconds: 0, durationSeconds: 2 * ROW, pitchMidi: 60, amplitude: 0.8 }];
const hit = (row: number, drum: DrumHit['drum']): DrumHit => ({
  timeSeconds: row * ROW,
  drum,
  strength: 1,
  features: {} as HitFeatures,
});

const rows = () => useTrackerStore.getState().patterns[0].channels[0].rows;
const instrument = (id: number) => useInstrumentStore.getState().instruments.find((i) => i.id === id);
const target = (instrumentId: number) => ({ channelIndex: 0, startRow: 0, instrumentId });

describe('committed voice notes play (owner report 2026-10-17)', () => {
  beforeEach(() => {
    resetStore(useTrackerStore);
    resetStore(useInstrumentStore);
  });

  it('melody into a fresh song plays on a Voice Lead synth, not a silent empty Sampler', () => {
    const res = commitVoiceNotes(sung, Q, target(1));
    expect(res?.written).toBe(1);
    const inst = instrument(rows()[0].instrument);
    expect(inst?.name).toBe(VOICE_LEAD_NAME);
    expect(inst?.synthType).toBe('Synth');
    expect(isPlayable(inst)).toBe(true);
  });

  it('melody aimed at an empty Sampler reuses one Voice Lead across commits', () => {
    const empty = useInstrumentStore.getState().createInstrument();
    commitVoiceNotes(sung, Q, target(empty));
    commitVoiceNotes(sung, Q, target(empty));
    const leads = useInstrumentStore.getState().instruments.filter((i) => i.name === VOICE_LEAD_NAME);
    expect(leads).toHaveLength(1);
    expect(rows()[0].instrument).toBe(leads[0].id);
  });

  it('melody aimed at a playable instrument keeps it and creates nothing', () => {
    const synth = useInstrumentStore.getState().createInstrument({ synthType: 'FMSynth', name: 'Mine' });
    const res = commitVoiceNotes(sung, Q, target(synth));
    expect(res?.instrumentId).toBe(synth);
    expect(useInstrumentStore.getState().instruments).toHaveLength(1);
    expect(rows()[0].instrument).toBe(synth);
  });

  it('drums into a fresh song play on TR-808 voices at C-4, one per class', () => {
    const map = defaultDrumMap([], 1);
    const res = commitDrumHits([hit(0, 'kick'), hit(4, 'snare'), hit(8, 'hat'), hit(12, 'kick')], map, Q, target(1));
    expect(res?.written).toBe(4);
    const voices = [0, 4, 8, 12].map((r) => {
      const inst = instrument(rows()[r].instrument);
      expect(inst?.synthType).toBe('TR808');
      expect(rows()[r].note).toBe(midiToXMNote(DRUM_808_MIDI));
      return inst?.parameters?.io808Type;
    });
    expect(voices).toEqual(['kick', 'snare', 'closedHat', 'kick']);
    expect(useInstrumentStore.getState().instruments).toHaveLength(3);
    // The next default map points at the 808s the commit created
    expect(defaultDrumMap(useInstrumentStore.getState().instruments, 1).kick).toEqual(res?.drumMap.kick);
  });

  it('a drum class mapped to a playable instrument keeps that instrument and note', () => {
    const mine = useInstrumentStore.getState().createInstrument({ synthType: 'MembraneSynth', name: 'My Kick' });
    const map = { ...defaultDrumMap([], 1), kick: { instrumentId: mine, midi: 36 } };
    commitDrumHits([hit(0, 'kick')], map, Q, target(1));
    expect(rows()[0].instrument).toBe(mine);
    expect(rows()[0].note).toBe(midiToXMNote(36));
  });
});
