/**
 * voice_to_notes MCP handler: an audio file's bytes go through the same core as
 * the panel (shape, quantise, write) into the pattern at the cursor channel,
 * as one undo step. Sentinel: the fake model's calls and the decoder's input.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { voiceToNotes, type VoiceToNotesDeps } from '../voiceHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useHistoryStore } from '@/stores/useHistoryStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { resetStore } from '@/stores/__tests__/_harness';
import { midiToXMNote } from '@/lib/xmConversions';
import { ANNOTATIONS_FPS } from '@/lib/voice/pitchNotes';
import { synthTake } from '@/lib/voice/drumSynth';

function oneNoteOutput(midi: number) {
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  for (let f = 0; f < ANNOTATIONS_FPS * 2; f++) {
    const fr = new Array(88).fill(0);
    const on = new Array(88).fill(0);
    if (f >= 17 && f < 60) fr[midi - 21] = 0.9;
    if (f === 17) on[midi - 21] = 0.9;
    frames.push(fr);
    onsets.push(on);
    contours.push(new Array(264).fill(0));
  }
  return { frames, onsets, contours };
}

describe('voice_to_notes handler', () => {
  let calls = 0;
  let decoded = 0;
  const deps: VoiceToNotesDeps = {
    model: { evaluate: async () => { calls++; return oneNoteOutput(61); } },
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
    expect(written[0].i).toBeGreaterThanOrEqual(4); // row 2 + onset at ~0.2 s (2 rows)
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
    const res = await voiceToNotes({ data: btoa('abcd'), mode: 'drums', drumMap: { snare: { midi: 40 } } }, drumDeps);
    expect(res.error).toBeUndefined();
    expect(calls).toBe(0);
    expect(res.hits).toEqual({ kick: 1, snare: 1, hat: 0, clap: 0 });
    const rows = useTrackerStore.getState().patterns[0].channels[1].rows;
    const written = rows.map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(36), midiToXMNote(40)]);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
    expect((await voiceToNotes({ data: 'AA==', mode: 'bogus' }, deps)).error).toBeDefined();
  });
});
