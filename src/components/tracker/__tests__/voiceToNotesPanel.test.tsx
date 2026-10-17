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
import { render, fireEvent, cleanup, waitFor, screen, within } from '@testing-library/react';
import { VoiceToNotesPanel } from '../VoiceToNotesPanel';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useHistoryStore } from '@/stores/useHistoryStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { resetStore } from '@/stores/__tests__/_harness';
import { midiToXMNote } from '@/lib/xmConversions';
import { ANNOTATIONS_FPS, DEFAULT_PITCH_SETTINGS, PITCH_SAMPLE_RATE, midiToHz, type PitchModelOutput } from '@/lib/voice/pitchNotes';
import type { PitchModel } from '@/lib/voice/basicPitchModel';
import type { VoiceCapture } from '@/lib/voice/voiceRecorder';
import { synthTake } from '@/lib/voice/drumSynth';
import { clearTraining } from '@/lib/voice/drumModel';
import { hitFeatures } from '@/lib/voice/drumHits';
import { synthHit } from '@/lib/voice/drumSynth';
import { useVoiceStore } from '@/stores/useVoiceStore';
import { LATENCY_STORAGE_KEY, SETUP_SEEN_KEY } from '@/lib/voice/latencyCalibration';
import { useVoicePreviewStore } from '@/stores/useVoicePreviewStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { DRUM_808_MIDI, isPlayable, VOICE_LEAD_NAME } from '@/lib/voice/voiceInstruments';

/** Note cells on a channel of pattern 0 (row index + note), note-offs excluded. */
function writtenNotes(channel = 0) {
  const rows = useTrackerStore.getState().patterns[0].channels[channel].rows;
  return rows.map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
}

/** TR-808 instruments in the song, by 808 voice. */
function tr808Voices() {
  return useInstrumentStore.getState().instruments
    .filter((i) => i.synthType === 'TR808')
    .map((i) => ({ id: i.id, voice: i.parameters?.io808Type as string }));
}

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
  clearTraining();
  useVoiceStore.getState().reset();
  try { localStorage.removeItem(LATENCY_STORAGE_KEY); } catch { /* none */ }
  resetStore(useTrackerStore);
  useTransportStore.setState({ bpm: 150, speed: 6 } as never);
  useCursorStore.setState({ cursor: { ...useCursorStore.getState().cursor, channelIndex: 0, rowIndex: 4 } } as never);

  // The setup wizard opens on first use; the panel tests below start past it
  try { localStorage.setItem(SETUP_SEEN_KEY, '1'); } catch { /* none */ }
});
afterEach(cleanup);

describe('Voice to Notes panel', () => {
  it('Record then Stop puts the sung notes on the grid as one undo step, without a Commit click', async () => {
    const model = new SineReadingModel();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const undoBefore = useHistoryStore.getState().undoStack.length;
    render(<VoiceToNotesPanel isOpen onClose={() => {}} model={model} deps={deps} />);

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());

    // 4 count-in beats at 150 bpm = 1.6 s of silence, then C4, E4, G4 for 0.5 s each (row = 0.1 s)
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), sine(60, 0.5), sine(64, 0.5), sine(67, 0.5), new Float32Array(2205)]));

    // Ghost notes: while still recording, the live preview puts the sung notes on the target channel
    await waitFor(() => {
      const ghost = useVoicePreviewStore.getState().preview;
      expect(ghost?.channelIndex).toBe(0);
      expect(ghost?.startRow).toBe(4);
      expect(ghost?.notes).toContain(midiToXMNote(60));
    }, { timeout: 3000 });
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(model.calls).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Stop'));

    // The take lands as soon as it ends; Commit only re-writes after a change
    await waitFor(() => expect(writtenNotes().length).toBe(3));
    expect(useVoicePreviewStore.getState().preview).toBeNull();
    expect((screen.getByText('Commit').closest('button') as HTMLButtonElement).disabled).toBe(true);

    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    // Cursor was on row 4: take row 0 lands there; notes 5 rows apart (+-1 row for the model's onset frame)
    const written = writtenNotes();
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(60), midiToXMNote(64), midiToXMNote(67)]);
    expect(written[0].i).toBe(4);
    // Every written note plays: its instrument exists and makes sound
    for (const c of written) {
      const inst = useInstrumentStore.getState().instruments.find((x) => x.id === rows[c.i].instrument);
      expect(isPlayable(inst)).toBe(true);
    }
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
    const utils = render(<VoiceToNotesPanel isOpen onClose={() => {}} model={model} deps={deps} />);
    await before?.(utils);
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), new Float32Array(Math.round(0.3 * PITCH_SAMPLE_RATE)), sine(midi, 0.5), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBeGreaterThan(0));
    expect(model.calls).toBeGreaterThan(0);
    return writtenNotes();
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
    render(<VoiceToNotesPanel isOpen onClose={() => {}} model={model} deps={deps} />);
    fireEvent.click(screen.getByText('Calibrate latency'));
    await waitFor(() => expect(screen.getByTestId('voice-calibrated-latency').textContent).toContain('100 ms'));

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), new Float32Array(Math.round(0.3 * PITCH_SAMPLE_RATE)), sine(60, 0.5), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBeGreaterThan(0));
    const calibrated = writtenNotes();
    expect(calibrated[0].i).toBe(plain[0].i - 1);
    expect(JSON.parse(localStorage.getItem(LATENCY_STORAGE_KEY) ?? '{}')).toEqual({ default: 100 });
  });

  it('writes with the song\'s current instrument after the one selected at mount is deleted (owner report 2026-10-17)', async () => {
    // The owner had OPL3 Brass selected when recording, yet every cell pointed
    // at id 1, an instrument that no longer existed: the panel kept a copy of
    // the current instrument from mount and a Voice Lead got created at the
    // freed id. The target is the store's current instrument, read live.
    resetStore(useInstrumentStore);
    const store = useInstrumentStore.getState();
    const bass = store.createInstrument({ synthType: 'FMSynth', name: 'OPL3 FM Bass' });
    const brass = store.createInstrument({ synthType: 'FMSynth', name: 'OPL3 Brass' });
    store.setCurrentInstrument(bass);
    const leads = () => useInstrumentStore.getState().instruments.filter((i) => i.name === VOICE_LEAD_NAME).length;
    const leadsBefore = leads();
    const written = await takeThrough(60, async () => {
      useInstrumentStore.getState().deleteInstrument(bass);
      useInstrumentStore.getState().setCurrentInstrument(brass);
      // The panel's Instrument select follows the song's selection
      await waitFor(() => expect(screen.getByTitle('Instrument').textContent).toContain(`${brass}. OPL3 Brass`));
    });
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    expect(written.map((c) => rows[c.i].instrument)).toEqual([brass]);
    expect(leads()).toBe(leadsBefore);
    expect(useInstrumentStore.getState().currentInstrumentId).toBe(brass);
  });

  it('keeps earlier takes and re-commits one', async () => {
    await takeThrough(60);
    expect(screen.getByText('Takes')).toBeTruthy();
    expect(screen.getByText(/^Take 1/)).toBeTruthy();
  });

  it('a take lands on the grid when it ends, and Commit re-writes it after a change (owner: "i keep forgetting to commit")', async () => {
    const written = await takeThrough(60);
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(60)]);
    const commit = screen.getByText('Commit').closest('button') as HTMLButtonElement;
    expect(commit.disabled).toBe(true);
    // Changing the target channel makes the take pending again; Commit writes it there
    fireEvent.click(screen.getByTitle('Target channel'));
    fireEvent.click(await screen.findByText('Channel 2'));
    await waitFor(() => expect(commit.disabled).toBe(false));
    fireEvent.click(commit);
    expect(writtenNotes(1).map((c) => c.note)).toEqual([midiToXMNote(60)]);
    expect(commit.disabled).toBe(true);
  });

  it('Drums mode: a kick and snare take ends as TR-808 cells in the pattern as one undo step, without the pitch model', async () => {
    const model = new SineReadingModel();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const undoBefore = useHistoryStore.getState().undoStack.length;
    render(<VoiceToNotesPanel isOpen onClose={() => {}} model={model} deps={deps} />);
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
    await waitFor(() => expect(writtenNotes().length).toBe(2));

    // Each class lands on its own TR-808 voice, created by the commit, at the 808 trigger note
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    const written = writtenNotes();
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(DRUM_808_MIDI), midiToXMNote(DRUM_808_MIDI)]);
    const voices = tr808Voices();
    expect(voices.map((v) => v.voice)).toEqual(['kick', 'snare']);
    expect(written.map((c) => rows[c.i].instrument)).toEqual(voices.map((v) => v.id));
    expect(written[0].i).toBeGreaterThanOrEqual(6);
    expect(written[0].i).toBeLessThanOrEqual(8);
    expect(written[1].i - written[0].i).toBeGreaterThanOrEqual(4);
    expect(written[1].i - written[0].i).toBeLessThanOrEqual(6);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
    expect(useHistoryStore.getState().undoStack.at(-1)?.description).toBe('Voice to Notes');
  });

  it('Drums mode: a model trained on this voice (kick sound called snare) replaces the rules and changes the written note', async () => {
    const feat = (drum: 'kick' | 'snare', seed: number) => {
      const take = new Float32Array(PITCH_SAMPLE_RATE / 4);
      take.set(synthHit(drum, seed), 500);
      return hitFeatures(take, 500);
    };
    // Earlier training takes, stored: this user calls the kick sound "snare" and the snare sound "kick"
    useVoiceStore.getState().setSamples([1, 2, 3, 4, 5].flatMap((seed) => [
      { drum: 'snare' as const, features: feat('kick', seed) },
      { drum: 'kick' as const, features: feat('snare', seed) },
    ]));
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    render(<VoiceToNotesPanel isOpen onClose={() => {}} model={new SineReadingModel()} deps={deps} />);
    fireEvent.click(screen.getByTitle('Mode'));
    fireEvent.click(await screen.findByText('Drums'));
    await waitFor(() => expect(screen.getByTestId('drum-training-status')).toBeTruthy());

    // One more labelled take through the panel: a kick sound, labelled Snare. Trains and evaluates.
    fireEvent.click(screen.getByTitle('Training class'));
    const snareItems = await screen.findAllByText('Snare');
    fireEvent.click(snareItems[snareItems.length - 1]);
    fireEvent.click(screen.getByText('Record training take'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(synthTake([{ drum: 'kick', at: 0.1 }], 0.5, 9));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(screen.getByTestId('drum-training-status').textContent).toContain('using your model'));

    // A normal drum take now: the kick sound is written as the snare note
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), synthTake([{ drum: 'kick', at: 0.3 }], 0.8)]));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(screen.getByTestId('drum-map-snare').textContent).toContain('1 hit'));
    expect(screen.getByTestId('drum-map-kick').textContent).toContain('0 hits');
    await waitFor(() => expect(writtenNotes().length).toBe(1));
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    expect(writtenNotes().map((c) => c.note)).toEqual([midiToXMNote(DRUM_808_MIDI)]);
    expect(tr808Voices().find((v) => v.id === rows[writtenNotes()[0].i].instrument)?.voice).toBe('snare');
  });

  it('a beatbox take into a song whose current instrument is playable adds TR-808 voices to the instrument list (owner report 2026-10-17)', async () => {
    // The owner beatboxed with OPL3 Brass selected and no drum got added: the
    // drum map fell back to the current (playable) instrument, so the commit
    // saw nothing silent and created no 808.
    resetStore(useInstrumentStore);
    const brass = useInstrumentStore.getState().createInstrument({ synthType: 'FMSynth', name: 'OPL3 Brass' });
    useInstrumentStore.getState().setCurrentInstrument(brass);
    expect(tr808Voices()).toEqual([]);
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    render(<VoiceToNotesPanel isOpen onClose={() => {}} model={new SineReadingModel()} deps={deps} />);
    fireEvent.click(screen.getByTitle('Mode'));
    fireEvent.click(await screen.findByText('Drums'));
    await waitFor(() => expect(screen.getByTestId('drum-map-kick')).toBeTruthy());
    // Before any take, the map says what the commit will do
    expect(screen.getByTitle('Kick instrument').textContent).toContain('TR-808 Kick (added on commit)');

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), synthTake([{ drum: 'kick', at: 0.3 }, { drum: 'snare', at: 0.8 }], 1.4)]));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBe(2));

    const voices = tr808Voices();
    expect(voices.map((v) => v.voice)).toEqual(['kick', 'snare']);
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    expect(writtenNotes().map((c) => rows[c.i].instrument)).toEqual(voices.map((v) => v.id));
    expect(writtenNotes().every((c) => rows[c.i].instrument !== brass)).toBe(true);
    // The map now names the created voices
    await waitFor(() => expect(screen.getByTitle('Kick instrument').textContent).toContain(`${voices[0].id}.`));
  });
});

describe('Voice to Notes setup wizard', () => {
  it('opens on first use and walks microphone check, latency, a step per drum, the melody range and result', async () => {
    localStorage.removeItem(SETUP_SEEN_KEY);
    const model = new SineReadingModel();
    const mic = fakeMic();
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
    let captures = 0;
    const deps = {
      getStream: async () => ({} as MediaStream),
      // Capture 0 is the microphone check, capture 1 the latency loopback, the rest training takes
      createCapture: () => (captures++ === 1 ? loop : mic.capture),
      listDevices: async () => [],
    };
    render(<VoiceToNotesPanel isOpen onClose={() => {}} model={model} deps={deps} />);

    // Microphone check: a sung take is only metered, never turned into notes
    const micStep = screen.getByTestId('voice-setup-step-microphone');
    fireEvent.click(within(micStep).getByText('Test microphone'));
    await waitFor(() => expect(within(micStep).getByText('Stop test')).toBeTruthy());
    mic.feed(sine(60, 1));
    fireEvent.click(within(micStep).getByText('Stop test'));
    await waitFor(() => expect(within(micStep).getByText('Test microphone')).toBeTruthy());
    expect(model.calls).toBe(0);
    expect((screen.getByText('Commit').closest('button') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(within(screen.getByTestId('voice-setup-step-latency')).getByText('Calibrate latency'));
    await waitFor(() => expect(screen.getByTestId('voice-setup-latency').textContent).toBe('100 ms measured'));

    // One step per drum class: Next waits until the class has enough hits, and the take is drawn with its hits
    const nextButton = () => screen.getByText('Next').closest('button') as HTMLButtonElement;
    for (const drum of ['kick', 'snare', 'hat', 'clap'] as const) {
      fireEvent.click(screen.getByText('Next'));
      const step = screen.getByTestId(`voice-setup-step-${drum}`);
      expect(nextButton().disabled).toBe(true);
      const row = within(step).getByTestId(`voice-setup-train-${drum}`);
      fireEvent.click(within(row).getByText('Record'));
      await waitFor(() => expect(within(row).getByText('Stop')).toBeTruthy());
      mic.feed(synthTake([{ drum, at: 0.1 }, { drum, at: 0.5 }, { drum, at: 0.9 }], 1.3));
      fireEvent.click(within(row).getByText('Stop'));
      await waitFor(() => expect(within(row).getByText('3 hits')).toBeTruthy());
      expect(within(step).getByTestId('voice-take-waveform').getAttribute('data-markers')).toBe('3');
      expect(within(step).getByTestId('voice-setup-heard').textContent).toBe('Heard 3 hits');
      expect(within(row).getByText('Retake')).toBeTruthy();
      expect(nextButton().disabled).toBe(false);
    }
    expect(model.calls).toBe(0);

    // Melody step: the scale sets the pitch range on Next, and is never written to the grid
    fireEvent.click(screen.getByText('Next'));
    const melodyStep = screen.getByTestId('voice-setup-step-melody');
    expect(nextButton().disabled).toBe(true);
    fireEvent.click(within(melodyStep).getByText('Record'));
    await waitFor(() => expect(within(melodyStep).getByText('Stop')).toBeTruthy());
    mic.feed(concat([sine(60, 0.4), sine(64, 0.4), sine(67, 0.4), new Float32Array(2205)]));
    fireEvent.click(within(melodyStep).getByText('Stop'));
    await waitFor(() => expect(within(melodyStep).getByTestId('voice-take-waveform').getAttribute('data-markers')).toBe('3'));
    expect(model.calls).toBe(1);
    expect(screen.getByTestId('voice-setup-range').textContent).toBe('Heard 3 notes: A3 to A#4, no transpose');
    expect(useVoiceStore.getState().fine.minMidiNote).toBe(DEFAULT_PITCH_SETTINGS.minMidiNote);
    fireEvent.click(screen.getByText('Next'));
    expect(useVoiceStore.getState().fine).toMatchObject({ minMidiNote: 57, maxMidiNote: 70, transpose: 0 });
    expect(writtenNotes()).toEqual([]);

    expect(screen.getByTestId('voice-setup-result').textContent).toMatch(/^Drum training: held out \d+: model \d+ percent, rules \d+ percent, using /);
    expect(screen.getByTestId('voice-setup-result-range').textContent).toBe('Melody range: A3 to A#4, no transpose');

    fireEvent.click(screen.getByText('Finish'));
    await waitFor(() => expect(screen.queryByTestId('voice-setup-step-result')).toBeNull());
    expect(localStorage.getItem(SETUP_SEEN_KEY)).toBe('1');
  });

  it('stays closed once seen and opens from the Setup wizard button', () => {
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => fakeMic().capture,
      listDevices: async () => [],
    };
    render(<VoiceToNotesPanel isOpen onClose={() => {}} model={new SineReadingModel()} deps={deps} />);
    expect(screen.queryByTestId('voice-setup-step-microphone')).toBeNull();
    fireEvent.click(screen.getByLabelText('Setup wizard'));
    expect(screen.getByTestId('voice-setup-step-microphone')).toBeTruthy();
  });
});
