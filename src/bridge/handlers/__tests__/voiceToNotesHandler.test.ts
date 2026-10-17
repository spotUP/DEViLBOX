/**
 * voice_to_notes MCP handler: an audio file's bytes go through the same core as
 * the panel (shape, quantise, write) into the pattern at the cursor channel,
 * as one undo step. Sentinel: the fake tracker's calls and the decoder's input.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { voiceToNotes, type VoiceToNotesDeps } from '../voiceHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useHistoryStore } from '@/stores/useHistoryStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { resetStore } from '@/stores/__tests__/_harness';
import { midiToXMNote } from '@/lib/xmConversions';
import { TRACK_HOP_SECONDS, midiToHz, type F0Track } from '@/lib/voice/pitchTrack';
import { synthTake } from '@/lib/voice/drumSynth';
import { DRUM_808_MIDI } from '@/lib/voice/voiceInstruments';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

/** A 2 s track with one voiced note of `midi` from 0.27 s to 0.96 s. */
function oneNoteTrack(midi: number): F0Track {
  const frames = Math.round(2 / TRACK_HOP_SECONDS);
  const hz = new Float32Array(frames);
  const confidence = new Float32Array(frames);
  const loudnessDb = new Float32Array(frames).fill(-100);
  for (let f = 17; f < 60; f++) {
    hz[f] = midiToHz(midi);
    confidence[f] = 0.9;
    loudnessDb[f] = -20;
  }
  return { hz, confidence, loudnessDb, hopSeconds: TRACK_HOP_SECONDS };
}

describe('voice_to_notes handler', () => {
  let calls = 0;
  let decoded = 0;
  const deps: VoiceToNotesDeps = {
    tracker: { track: async () => { calls++; return oneNoteTrack(61); } },
    decode: async (b) => { decoded = b.byteLength; return new Float32Array(44100); },
    fetchBytes: async () => new ArrayBuffer(3),
  };

  beforeEach(() => {
    calls = 0;
    decoded = 0;
    resetStore(useTrackerStore);
    useTransportStore.setState({ bpm: 150, speed: 6 } as never);
    useCursorStore.setState({ cursor: { ...useCursorStore.getState().cursor, channelIndex: 1, rowIndex: 2 } } as never);
  });

  it('writes the detected note at the cursor channel and row, snapped to the key, as one undo step', async () => {
    const undoBefore = useHistoryStore.getState().undoStack.length;
    const res = await voiceToNotes({ data: btoa('abcd'), keyTonic: 0, keyScale: 'major' }, deps);
    expect(res.error).toBeUndefined();
    expect(calls).toBe(1);
    expect(decoded).toBe(4);
    const rows = useTrackerStore.getState().patterns[0].channels[1].rows;
    const written = rows.map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(60)]); // 61 snapped down
    expect(written[0].i).toBe(2); // the take's first note lands on the start row (cursor row 2), lead-in silence cut (VNR-24)
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
  });

  it('without a key it writes the raw pitch; a url goes through the fetcher; no source is an error', async () => {
    await voiceToNotes({ url: 'http://x/a.wav' }, deps);
    const rows = useTrackerStore.getState().patterns[0].channels[1].rows;
    expect(rows.some((r) => r.note === midiToXMNote(61))).toBe(true);
    expect(decoded).toBe(3);
    expect((await voiceToNotes({}, deps)).error).toBeDefined();
  });

  it('drums mode detects kick and snare hits and writes the mapped notes without calling the pitch model', async () => {
    const take = synthTake([{ drum: 'kick', at: 0.3 }, { drum: 'snare', at: 0.8 }], 1.5);
    const drumDeps: VoiceToNotesDeps = { ...deps, decode: async () => take };
    const undoBefore = useHistoryStore.getState().undoStack.length;
    // Snare mapped to a playable synth at E-2 by the caller; kick unmapped, so the commit adds a TR-808 kick
    const snareSynth = useInstrumentStore.getState().createInstrument({ synthType: 'FMSynth', name: 'FM Snare Synth' });
    const res = await voiceToNotes({ data: btoa('abcd'), mode: 'drums', drumMap: { snare: { instrumentId: snareSynth, midi: 40 } } }, drumDeps);
    expect(res.error).toBeUndefined();
    expect(calls).toBe(0);
    expect(res.hits).toEqual({ kick: 1, snare: 1, hat: 0, clap: 0 });
    const rows = useTrackerStore.getState().patterns[0].channels[1].rows;
    const written = rows.map((r, i) => ({ i, note: r.note, instrument: r.instrument })).filter((c) => c.note > 0 && c.note !== 97);
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(DRUM_808_MIDI), midiToXMNote(40)]);
    const kick808 = useInstrumentStore.getState().instruments.find((i) => i.synthType === 'TR808' && i.parameters?.io808Type === 'kick');
    expect(written.map((c) => c.instrument)).toEqual([kick808?.id, snareSynth]);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
    expect((await voiceToNotes({ data: 'AA==', mode: 'bogus' }, deps)).error).toBeDefined();
  });
});
