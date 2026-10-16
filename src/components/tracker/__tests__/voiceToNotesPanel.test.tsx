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
import { synthTake } from '@/lib/voice/drumSynth';
import { clearTakes } from '@/lib/voice/takeHistory';
import { LATENCY_STORAGE_KEY } from '@/lib/voice/latencyCalibration';

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
  clearTakes();
  try { localStorage.removeItem(LATENCY_STORAGE_KEY); } catch { /* none */ }
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

  /** One take through the panel: 0.3 s silence after the count-in, then a sine note. */
  async function takeThrough(midi: number, before?: (utils: ReturnType<typeof render>) => Promise<void> | void) {
    const model = new SineReadingModel();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const utils = render(<VoiceToNotesPanel onClose={() => {}} model={model} deps={deps} />);
    await before?.(utils);
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), new Float32Array(Math.round(0.3 * PITCH_SAMPLE_RATE)), sine(midi, 0.5), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));
    const commit = screen.getByText('Commit').closest('button') as HTMLButtonElement;
    await waitFor(() => expect(commit.disabled).toBe(false));
    expect(model.calls).toBeGreaterThan(0);
    fireEvent.click(commit);
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    return rows.map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
  }

  it('Snap to key moves an out-of-key note onto the key (C sharp to C in C major)', async () => {
    const plain = await takeThrough(61);
    expect(plain.map((c) => c.note)).toEqual([midiToXMNote(61)]);
    cleanup();
    resetStore(useTrackerStore);
    const snapped = await takeThrough(61, () => {
      fireEvent.click(screen.getByLabelText('Snap to key'));
    });
    expect(snapped.map((c) => c.note)).toEqual([midiToXMNote(60)]);
  });

  it('Calibrate latency measures a 100 ms loopback and moves the committed notes one row earlier', async () => {
    const plain = await takeThrough(60);
    cleanup();
    resetStore(useTrackerStore);

    // Loopback fake: the click comes back on the input 100 ms after it was scheduled
    let deliver: (b: Float32Array) => void = () => {};
    const loop: VoiceCapture = {
      sampleRate: PITCH_SAMPLE_RATE,
      start: async (cb) => { deliver = cb; },
      click: (delay) => {
        const total = new Float32Array(PITCH_SAMPLE_RATE);
        const at = Math.round((delay + 0.1) * PITCH_SAMPLE_RATE);
        for (let i = 0; i < 40; i++) total[at + i] = 0.8 * (i % 2 ? -1 : 1);
        setTimeout(() => { for (let i = 0; i < total.length; i += 128) deliver(total.slice(i, i + 128)); }, 0);
      },
      stop: () => {},
    };
    let calibrationCaptures = 0;
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => (calibrationCaptures++ === 0 ? loop : mic.capture),
      listDevices: async () => [],
    };
    const model = new SineReadingModel();
    render(<VoiceToNotesPanel onClose={() => {}} model={model} deps={deps} />);
    fireEvent.click(screen.getByText('Calibrate latency'));
    await waitFor(() => expect(screen.getByTestId('voice-calibrated-latency').textContent).toContain('100 ms'));

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), new Float32Array(Math.round(0.3 * PITCH_SAMPLE_RATE)), sine(60, 0.5), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));
    const commit = screen.getByText('Commit').closest('button') as HTMLButtonElement;
    await waitFor(() => expect(commit.disabled).toBe(false));
    fireEvent.click(commit);
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    const calibrated = rows.map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
    expect(calibrated[0].i).toBe(plain[0].i - 1);
    expect(JSON.parse(localStorage.getItem(LATENCY_STORAGE_KEY) ?? '{}')).toEqual({ default: 100 });
  });

  it('keeps earlier takes and re-commits one', async () => {
    await takeThrough(60);
    expect(screen.getByText('Takes')).toBeTruthy();
    expect(screen.getByText(/^Take 1/)).toBeTruthy();
  });

  it('Drums mode: a kick and snare take ends as mapped cells in the pattern as one undo step, without the pitch model', async () => {
    const model = new SineReadingModel();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const undoBefore = useHistoryStore.getState().undoStack.length;
    render(<VoiceToNotesPanel onClose={() => {}} model={model} deps={deps} />);
    fireEvent.click(screen.getByTitle('Mode'));
    fireEvent.click(await screen.findByText('Drums'));
    await waitFor(() => expect(screen.getByTestId('drum-map-kick')).toBeTruthy());

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), synthTake([{ drum: 'kick', at: 0.3 }, { drum: 'snare', at: 0.8 }], 1.4)]));
    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => expect(screen.getByTestId('drum-map-kick').textContent).toContain('1 hit'));
    expect(screen.getByTestId('drum-map-snare').textContent).toContain('1 hit');
    expect(model.calls).toBe(0);
    fireEvent.click(screen.getByText('Commit').closest('button') as HTMLButtonElement);

    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    const written = rows.map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(36), midiToXMNote(38)]);
    expect(written[0].i).toBeGreaterThanOrEqual(6);
    expect(written[0].i).toBeLessThanOrEqual(8);
    expect(written[1].i - written[0].i).toBeGreaterThanOrEqual(4);
    expect(written[1].i - written[0].i).toBeLessThanOrEqual(6);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
    expect(useHistoryStore.getState().undoStack.at(-1)?.description).toBe('Voice to Notes');
  });
});
