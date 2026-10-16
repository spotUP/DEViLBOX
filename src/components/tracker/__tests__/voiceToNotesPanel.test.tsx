/**
 * Voice to Notes reachability: the panel's Record, Stop and Commit buttons,
 * driven by a synthetic sine melody through a fake microphone, put the notes
 * on the grid at the right rows as exactly ONE undo entry.
 *
 * The pitch model is a fake that reads the recorded samples (zero-crossing
 * pitch per frame), so the take really passes through recorder, panel,
 * extraction, quantiser and writer. Sentinel: the fake model's calls.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor, screen } from '@testing-library/react';
import { VoiceToNotesPanel } from '../VoiceToNotesPanel';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useHistoryStore } from '@/stores/useHistoryStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { resetStore } from '@/stores/__tests__/_harness';
import { midiToXMNote } from '@/lib/xmConversions';
import { ANNOTATIONS_FPS, PITCH_SAMPLE_RATE, midiToHz, type PitchModelOutput } from '@/lib/voice/pitchNotes';
import type { PitchModel } from '@/lib/voice/basicPitchModel';
import type { VoiceCapture } from '@/lib/voice/voiceRecorder';

const HOP = 256;

/** Frame pitch from zero crossings; silent frames give no note. */
class SineReadingModel implements PitchModel {
  calls = 0;
  async evaluate(samples: Float32Array): Promise<PitchModelOutput> {
    this.calls++;
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const contours: number[][] = [];
    const count = Math.floor(samples.length / HOP);
    let prev = -1;
    for (let f = 0; f < count; f++) {
      const from = f * HOP;
      const to = Math.min(samples.length, from + 2048);
      let crossings = 0;
      let peak = 0;
      for (let i = from + 1; i < to; i++) {
        peak = Math.max(peak, Math.abs(samples[i]));
        if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
      }
      const hz = (crossings / 2) / ((to - from) / PITCH_SAMPLE_RATE);
      const midi = peak > 0.05 ? Math.round(69 + 12 * Math.log2(hz / 440)) : -1;
      const fr = new Array(88).fill(0);
      const on = new Array(88).fill(0);
      if (midi >= 21) {
        fr[midi - 21] = 0.9;
        if (midi !== prev) on[midi - 21] = 0.9;
      }
      prev = midi;
      frames.push(fr);
      onsets.push(on);
      contours.push(new Array(264).fill(0));
    }
    return { frames, onsets, contours };
  }
}

function fakeMic() {
  let deliver: (b: Float32Array) => void = () => {};
  const capture: VoiceCapture = {
    sampleRate: PITCH_SAMPLE_RATE,
    start: async (cb) => { deliver = cb; },
    click: () => {},
    stop: () => {},
  };
  return {
    capture,
    feed(samples: Float32Array) {
      for (let i = 0; i < samples.length; i += 128) deliver(samples.slice(i, i + 128));
    },
  };
}

function sine(midi: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * PITCH_SAMPLE_RATE));
  const w = (2 * Math.PI * midiToHz(midi)) / PITCH_SAMPLE_RATE;
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin(w * i);
  return out;
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

beforeEach(() => {
  resetStore(useTrackerStore);
  useTransportStore.setState({ bpm: 150, speed: 6 } as never);
  useCursorStore.setState({ cursor: { ...useCursorStore.getState().cursor, channelIndex: 0, rowIndex: 4 } } as never);
});
afterEach(cleanup);

describe('Voice to Notes panel', () => {
  it('Record, Stop, Commit puts the sung notes on the grid as one undo step', async () => {
    const model = new SineReadingModel();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const undoBefore = useHistoryStore.getState().undoStack.length;
    render(<VoiceToNotesPanel onClose={() => {}} model={model} deps={deps} />);

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());

    // 4 count-in beats at 150 bpm = 1.6 s of silence, then C4, E4, G4 for 0.5 s each (row = 0.1 s)
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), sine(60, 0.5), sine(64, 0.5), sine(67, 0.5), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));

    const commit = screen.getByText('Commit').closest('button') as HTMLButtonElement;
    await waitFor(() => expect(commit.disabled).toBe(false));
    expect(model.calls).toBeGreaterThan(0);
    fireEvent.click(commit);

    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    // Cursor was on row 4: take row 0 lands there; notes 5 rows apart (+-1 row for the model's onset frame)
    const written = rows.map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(60), midiToXMNote(64), midiToXMNote(67)]);
    expect(written[0].i).toBe(4);
    expect(written[1].i - written[0].i).toBeGreaterThanOrEqual(4);
    expect(written[1].i - written[0].i).toBeLessThanOrEqual(6);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
    expect(useHistoryStore.getState().undoStack.at(-1)?.description).toBe('Voice to Notes');
    expect(ANNOTATIONS_FPS).toBe(86);
  });
});
