/**
 * Voice to Notes reachability: the panel's Record, Stop and Commit buttons,
 * driven by a synthetic sine melody through a fake microphone, put the notes
 * on the grid at the right rows as exactly ONE undo entry.
 *
 * The pitch tracker is a fake that reads the recorded samples (zero-crossing
 * pitch per frame), so the take really passes through recorder, panel,
 * segmenter, quantiser and writer. Sentinel: the fake tracker's calls.
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
import { DEFAULT_PITCH_SETTINGS, PITCH_SAMPLE_RATE, midiToHz } from '@/lib/voice/pitchNotes';
import { SineReadingTracker } from '@/lib/voice/__tests__/sineReadingTracker';
import type { VoiceCapture } from '@/lib/voice/voiceRecorder';
import { synthTake } from '@/lib/voice/drumSynth';
import { clearTraining } from '@/lib/voice/drumModel';
import { hitFeatures } from '@/lib/voice/drumHits';
import { synthHit } from '@/lib/voice/drumSynth';
import { useVoiceStore } from '@/stores/useVoiceStore';
import { LATENCY_STORAGE_KEY, SETUP_SEEN_KEY } from '@/lib/voice/latencyCalibration';
import { useVoicePreviewStore } from '@/stores/useVoicePreviewStore';
import { DRUMS_RESET_MESSAGE, V1_DRUM_KEYS } from '@/lib/persistence/migrations/voiceDrumsV2';
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

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * PITCH_SAMPLE_RATE));
}

/** A sine whose pitch moves evenly from one note to another over the span. */
function glide(fromMidi: number, toMidi: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * PITCH_SAMPLE_RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase += (2 * Math.PI * midiToHz(fromMidi + ((toMidi - fromMidi) * i) / out.length)) / PITCH_SAMPLE_RATE;
    out[i] = 0.5 * Math.sin(phase);
  }
  return out;
}

/** A sine with vibrato: `depth` semitones either side of the note at `rateHz`. */
function wobble(midi: number, seconds: number, rateHz: number, depth: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * PITCH_SAMPLE_RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / PITCH_SAMPLE_RATE;
    phase += (2 * Math.PI * midiToHz(midi + depth * Math.sin(2 * Math.PI * rateHz * t))) / PITCH_SAMPLE_RATE;
    out[i] = 0.5 * Math.sin(phase);
  }
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
  it('Record then Stop puts the sung notes on the grid from row 0 as one undo step, without a Commit click (VNR-24, owner: "why doesnt it put my voice -> note stuff on position 0?")', async () => {
    const tracker = new SineReadingTracker();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const undoBefore = useHistoryStore.getState().undoStack.length;
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());

    // 4 count-in beats at 150 bpm = 1.6 s of silence, then C4, E4, G4 for 0.5 s each (row = 0.1 s)
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), sine(60, 0.5), sine(64, 0.5), sine(67, 0.5), new Float32Array(2205)]));

    // Ghost notes: while still recording, the live preview puts the sung notes on the target channel
    await waitFor(() => {
      const ghost = useVoicePreviewStore.getState().preview;
      expect(ghost?.channelIndex).toBe(0);
      expect(ghost?.startRow).toBe(0);
      expect(ghost?.notes).toContain(midiToXMNote(60));
    }, { timeout: 3000 });
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(tracker.calls).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Stop'));

    // The take lands as soon as it ends; Commit only re-writes after a change
    await waitFor(() => expect(writtenNotes().length).toBe(3));
    expect(useVoicePreviewStore.getState().preview).toBeNull();
    expect((screen.getByText('Commit').closest('button') as HTMLButtonElement).disabled).toBe(true);

    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    // The cursor sits on row 4 but the take always starts at row 0; notes 5 rows apart (+-1 row for the onset frame)
    const written = writtenNotes();
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(60), midiToXMNote(64), midiToXMNote(67)]);
    expect(written[0].i).toBe(0);
    // Every written note plays: its instrument exists and makes sound
    for (const c of written) {
      const inst = useInstrumentStore.getState().instruments.find((x) => x.id === rows[c.i].instrument);
      expect(isPlayable(inst)).toBe(true);
    }
    expect(written[1].i - written[0].i).toBeGreaterThanOrEqual(4);
    expect(written[1].i - written[0].i).toBeLessThanOrEqual(6);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
    expect(useHistoryStore.getState().undoStack.at(-1)?.description).toBe('Voice to Notes');
  });

  it('a take longer than the pattern records on into a pattern added at the song end, as one undo step (VNR-27, owner: "it would be nicer if it recorded several patterns, for as long as it records")', async () => {
    const tracker = new SineReadingTracker();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    // 16 rows of 0.1 s: a 1.6 s pattern, the only one in the order
    useTrackerStore.getState().resizePattern(0, 16);
    expect(useTrackerStore.getState().patternOrder).toEqual([0]);
    const undoBefore = useHistoryStore.getState().undoStack.length;
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    // Count-in, then C4, E4, G4 for 1 s each: 30 rows, past the 16-row pattern
    mic.feed(concat([silence(1.6), sine(60, 1), sine(64, 1), sine(67, 1), new Float32Array(2205)]));
    await waitFor(() => expect(Number(screen.getByTestId('voice-take-waveform').dataset.audio)).toBeGreaterThanOrEqual(3), { timeout: 3000 });
    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => expect(useTrackerStore.getState().patterns.length).toBe(2));
    expect(tracker.calls).toBeGreaterThan(0);
    const { patterns, patternOrder } = useTrackerStore.getState();
    expect(patternOrder).toEqual([0, 1]);
    expect(patterns[1].length).toBe(16);
    const notesOf = (p: number) => patterns[p].channels[0].rows
      .map((r, i) => ({ i, note: r.note })).filter((c) => c.note > 0 && c.note !== 97);
    expect(notesOf(0).map((c) => c.note)).toEqual([midiToXMNote(60), midiToXMNote(64)]);
    // G4 starts 20 rows into the take (+-1 for the onset frame): row 4 of the added pattern
    expect(notesOf(1).map((c) => c.note)).toEqual([midiToXMNote(67)]);
    expect(Math.abs(notesOf(1)[0].i - 4)).toBeLessThanOrEqual(1);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);

    // One undo removes the added pattern and its order position again
    useTrackerStore.getState().undoEdit();
    expect(useTrackerStore.getState().patterns.length).toBe(1);
    expect(useTrackerStore.getState().patternOrder).toEqual([0]);
  });

  it('a take that starts late after the count-in still puts its first sung note and first hit on row 0, gaps kept (VNR-24, owner: "it lands on pos 6")', async () => {
    // Snapshot the pristine instrument store before the drum half adds TR-808 voices.
    resetStore(useInstrumentStore);
    const deps = (capture: VoiceCapture) => ({
      getStream: async () => ({} as MediaStream),
      createCapture: () => capture,
      listDevices: async () => [],
    });
    // Melody: 0.7 s of silence after the 1.6 s count-in, then C4 and E4 for 0.5 s each (row = 0.1 s)
    const mic = fakeMic();
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={new SineReadingTracker()} deps={deps(mic.capture)} />);
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(2.3 * PITCH_SAMPLE_RATE)), sine(60, 0.5), sine(64, 0.5), new Float32Array(2205)]));
    // The ghost preview while recording already starts the take on row 0
    await waitFor(() => {
      const ghost = useVoicePreviewStore.getState().preview;
      expect(ghost?.startRow).toBe(0);
      expect(ghost?.notes[0]).toBe(midiToXMNote(60));
    }, { timeout: 3000 });
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBe(2));
    const melody = writtenNotes();
    expect(melody.map((c) => c.note)).toEqual([midiToXMNote(60), midiToXMNote(64)]);
    expect(melody[0].i).toBe(0);
    expect(melody[1].i).toBeGreaterThanOrEqual(4);
    expect(melody[1].i).toBeLessThanOrEqual(6);
    cleanup();
    resetStore(useTrackerStore);

    // Drums: kick 0.7 s after beat 1, snare 0.5 s later
    const drumMic = fakeMic();
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={new SineReadingTracker()} deps={deps(drumMic.capture)} />);
    fireEvent.click(screen.getByTitle('Mode'));
    fireEvent.click(await screen.findByText('Drums'));
    await waitFor(() => expect(screen.getByTestId('drum-map-kick')).toBeTruthy());
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    drumMic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), synthTake([{ drum: 'kick', at: 0.7 }, { drum: 'snare', at: 1.2 }], 1.8)]));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBe(2));
    const hits = writtenNotes();
    expect(hits[0].i).toBe(0);
    expect(hits[1].i).toBeGreaterThanOrEqual(4);
    expect(hits[1].i).toBeLessThanOrEqual(6);
  });

  /** One take through the panel: 0.3 s silence after the count-in, then a sine note. */
  async function takeThrough(midi: number, before?: (utils: ReturnType<typeof render>) => Promise<void> | void) {
    const tracker = new SineReadingTracker();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const utils = render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);
    await before?.(utils);
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), new Float32Array(Math.round(0.3 * PITCH_SAMPLE_RATE)), sine(midi, 0.5), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBeGreaterThan(0));
    expect(tracker.calls).toBeGreaterThan(0);
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

  it('Calibrate latency measures a 100 ms loopback and hears the take 100 ms earlier', async () => {
    await takeThrough(60);
    const plainHeard = parseFloat(screen.getAllByTestId('voice-timing-heard')[0].textContent ?? '');
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
    const tracker = new SineReadingTracker();
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);
    fireEvent.click(screen.getByText('Calibrate latency'));
    await waitFor(() => expect(screen.getByTestId('voice-calibrated-latency').textContent).toContain('100 ms'));

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), new Float32Array(Math.round(0.3 * PITCH_SAMPLE_RATE)), sine(60, 0.5), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBeGreaterThan(0));
    // The first note is on row 0 either way (VNR-24); the calibration moves where it was heard
    expect(writtenNotes()[0].i).toBe(0);
    const calibratedHeard = parseFloat(screen.getAllByTestId('voice-timing-heard')[0].textContent ?? '');
    expect(calibratedHeard).toBeCloseTo(plainHeard - 0.1, 3);
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

  it('a take with a glide, a wobble and a late note writes tone portamento, vibrato and note delay cells, drawn as notes and markers in the modal (VNR-12, VNR-14)', async () => {
    const tracker = new SineReadingTracker();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    // Strength 0 keeps the timing as sung (the Strength knob's lowest setting), so
    // a late note keeps its offset and is written with a note delay
    useVoiceStore.getState().patchFine({ strength: 0 });
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);
    // The panel is a design-system Modal
    expect(within(screen.getByRole('dialog')).getByTestId('voice-to-notes-panel')).toBeTruthy();
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    // Rows are 0.1 s (150 BPM, speed 6). After the 1.6 s count-in: a glide of four
    // semitones over six rows from row 3, a 5 Hz wobble of 0.45 semitones over six
    // rows from row 11, and a plain note 35 ms (about two ticks) after row 19.
    mic.feed(concat([silence(1.6), silence(0.3), glide(60, 64, 0.6), silence(0.2), wobble(60, 0.6, 5, 0.45), silence(0.235), sine(67, 0.4), new Float32Array(2205)]));
    fireEvent.click(screen.getByText('Stop'));
    // Three heard notes; the glide's slide cell carries its target note too
    await waitFor(() => expect(writtenNotes().length).toBe(4));
    expect(tracker.calls).toBeGreaterThan(0);

    // The modal draws every heard note and marks each on the waveform
    expect(screen.getAllByTestId('voice-ghost-note')).toHaveLength(3);
    expect(Number(screen.getByTestId('voice-take-waveform').dataset.markers)).toBeGreaterThanOrEqual(3);

    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    const written = writtenNotes().filter((c) => rows[c.i].effTyp !== 0x3);
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(60), midiToXMNote(60), midiToXMNote(67)]);
    // The first note is on row 0 (VNR-24), not on the cursor's row 4 or the 0.3 s after beat 1
    expect(written.map((c) => c.i)).toEqual([0, 8, 16]);
    const commands = rows
      .flatMap((r, i) => [{ i, note: r.note, effTyp: r.effTyp, eff: r.eff }, { i, note: r.note, effTyp: r.effTyp2, eff: r.eff2 }])
      .filter((c) => c.effTyp !== 0 || c.eff !== 0);

    // The glide: written at its start pitch; later rows of its span slide (3xx) to the end pitch, named on the first slide cell
    const porta = commands.filter((c) => c.effTyp === 0x3);
    expect(porta.length).toBeGreaterThan(0);
    expect(porta[0].note).toBe(midiToXMNote(64));
    expect(porta.every((c) => c.i > written[0].i && c.i < written[1].i)).toBe(true);

    // The wobble: 4xy on every row of the note; x = 5 Hz * 64 / 60 ticks per second, y = 0.45 semitones * 8
    const vibrato = commands.filter((c) => c.effTyp === 0x4);
    expect(vibrato.length).toBeGreaterThanOrEqual(5);
    expect(vibrato.every((c) => c.i >= written[1].i && c.i < written[2].i)).toBe(true);
    expect(vibrato[0].eff >> 4).toBeGreaterThanOrEqual(4);
    expect(vibrato[0].eff >> 4).toBeLessThanOrEqual(6);
    expect(vibrato[0].eff & 0xf).toBeGreaterThanOrEqual(3);
    expect(vibrato[0].eff & 0xf).toBeLessThanOrEqual(5);

    // The late note: on its row with a note delay (EDx) of the ticks it was heard late
    const delay = commands.find((c) => c.i === written[2].i && c.effTyp === 0xe && (c.eff & 0xf0) === 0xd0);
    expect(delay).toBeTruthy();
    expect(delay!.eff & 0xf).toBeGreaterThanOrEqual(1);
    expect(delay!.eff & 0xf).toBeLessThanOrEqual(3);

    // The written-rows table names the effects by command
    const table = screen.getAllByTestId('voice-timing-effects').map((td) => td.textContent ?? '').join(' | ');
    expect(table).toMatch(/3[0-9A-F]{2}/);
    expect(table).toMatch(/4[0-9A-F]{2}/);
    expect(table).toMatch(/ED[1-3]/);
  });

  it('while recording, the waveform and note roll span the whole pattern from row 0 and show the growing take (VNR-23, owner: "it starts at the center and overflows on the right side")', async () => {
    const tracker = new SineReadingTracker();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);
    // 64 rows of 0.1 s from row 0: the pattern is 6.4 s long whatever row the cursor is on
    expect(useTrackerStore.getState().patterns[0].length).toBe(64);
    const waveform = () => screen.getByTestId('voice-take-waveform');
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    expect(waveform().dataset.seconds).toBe('6.40');
    expect(screen.getByTestId('voice-note-roll').dataset.seconds).toBe('6.40');

    // Count-in, then one note held for 5 s: the take grows on the pattern's axis, not a 4 s one
    mic.feed(concat([silence(1.6), sine(60, 5), new Float32Array(2205)]));
    await waitFor(() => expect(Number(waveform().dataset.audio)).toBeGreaterThanOrEqual(5), { timeout: 3000 });
    expect(waveform().dataset.seconds).toBe('6.40');
    await waitFor(() => expect(screen.getAllByTestId('voice-ghost-note').length).toBeGreaterThan(0), { timeout: 3000 });
    for (const rect of screen.getAllByTestId('voice-ghost-note')) {
      const x = Number(rect.getAttribute('x'));
      const w = Number(rect.getAttribute('width'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(100);
    }
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(writtenNotes().length).toBeGreaterThan(0));

    // The finished take is shorter than the pattern: the axis stays the pattern's length
    expect(waveform().dataset.seconds).toBe('6.40');
    expect(Number(waveform().dataset.audio)).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId('voice-note-roll').dataset.seconds).toBe('6.40');
  });

  it('Drums mode: a kick and snare take ends as TR-808 cells in the pattern as one undo step, without the pitch tracker', async () => {
    const tracker = new SineReadingTracker();
    const mic = fakeMic();
    const deps = {
      getStream: async () => ({} as MediaStream),
      createCapture: () => mic.capture,
      listDevices: async () => [],
    };
    const undoBefore = useHistoryStore.getState().undoStack.length;
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);
    fireEvent.click(screen.getByTitle('Mode'));
    fireEvent.click(await screen.findByText('Drums'));
    await waitFor(() => expect(screen.getByTestId('drum-map-kick')).toBeTruthy());

    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    mic.feed(concat([new Float32Array(Math.round(1.6 * PITCH_SAMPLE_RATE)), synthTake([{ drum: 'kick', at: 0.3 }, { drum: 'snare', at: 0.8 }], 1.4)]));
    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => expect(screen.getByTestId('drum-map-kick').textContent).toContain('1 hit'));
    expect(screen.getByTestId('drum-map-snare').textContent).toContain('1 hit');
    expect(tracker.calls).toBe(0);
    await waitFor(() => expect(writtenNotes().length).toBe(2));

    // Each class lands on its own TR-808 voice, created by the commit, at the 808 trigger note
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    const written = writtenNotes();
    expect(written.map((c) => c.note)).toEqual([midiToXMNote(DRUM_808_MIDI), midiToXMNote(DRUM_808_MIDI)]);
    const voices = tr808Voices();
    expect(voices.map((v) => v.voice)).toEqual(['kick', 'snare']);
    expect(written.map((c) => rows[c.i].instrument)).toEqual(voices.map((v) => v.id));
    // The first hit is on row 0 (VNR-24), not on the cursor's row 4 or the 0.3 s after beat 1
    expect(written[0].i).toBe(0);
    expect(written[1].i - written[0].i).toBeGreaterThanOrEqual(4);
    expect(written[1].i - written[0].i).toBeLessThanOrEqual(6);
    expect(useHistoryStore.getState().undoStack.length - undoBefore).toBe(1);
    expect(useHistoryStore.getState().undoStack.at(-1)?.description).toBe('Voice to Notes');
  });

  it('Drums mode: training on this voice (kick sound called snare) replaces the built-in samples and changes the written note', async () => {
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
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={new SineReadingTracker()} deps={deps} />);
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
    await waitFor(() => expect(screen.getByTestId('drum-training-status').textContent).toMatch(/held out \d+: 100 percent correct/));

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
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={new SineReadingTracker()} deps={deps} />);
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
  it('after the v2 drum migration it opens once more, with the reset message, even though setup was done', async () => {
    localStorage.setItem(SETUP_SEEN_KEY, '1');
    localStorage.setItem(V1_DRUM_KEYS[0], '{"version":1,"samples":[]}');
    useVoiceStore.getState().reset();
    const deps = { getStream: async () => ({} as MediaStream), createCapture: () => fakeMic().capture, listDevices: async () => [] };
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={new SineReadingTracker()} deps={deps} />);
    expect((await screen.findByTestId('voice-setup-notice')).textContent).toBe(DRUMS_RESET_MESSAGE);
  });

  it('opens on first use and walks microphone check, latency, a step per drum, the melody range and result', async () => {
    localStorage.removeItem(SETUP_SEEN_KEY);
    const tracker = new SineReadingTracker();
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
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={tracker} deps={deps} />);

    // Microphone check: a sung take is only metered, never turned into notes
    const micStep = screen.getByTestId('voice-setup-step-microphone');
    fireEvent.click(within(micStep).getByText('Test microphone'));
    await waitFor(() => expect(within(micStep).getByText('Stop test')).toBeTruthy());
    mic.feed(sine(60, 1));
    fireEvent.click(within(micStep).getByText('Stop test'));
    await waitFor(() => expect(within(micStep).getByText('Test microphone')).toBeTruthy());
    expect(tracker.calls).toBe(0);
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
      // Clap is recorded as asked (eight hits); the others fall short and get the retake hint
      const n = drum === 'clap' ? 8 : 3;
      mic.feed(synthTake(Array.from({ length: n }, (_, i) => ({ drum, at: 0.1 + i * 0.4 })), 0.5 + n * 0.4));
      fireEvent.click(within(row).getByText('Stop'));
      await waitFor(() => expect(within(row).getByText(`${n} hits`)).toBeTruthy());
      expect(within(step).getByTestId('voice-take-waveform').getAttribute('data-markers')).toBe(String(n));
      expect(within(step).getByTestId('voice-setup-heard').textContent).toBe(
        n === 8 ? 'Heard 8 of 8 hits' : 'Heard 3 of 8 hits. Retake with one hit per beat and short gaps.',
      );
      expect(within(row).getByText('Retake')).toBeTruthy();
      expect(nextButton().disabled).toBe(false);
    }
    expect(tracker.calls).toBe(0);

    // Melody step: the scale sets the pitch range on Next, and is never written to the grid
    fireEvent.click(screen.getByText('Next'));
    const melodyStep = screen.getByTestId('voice-setup-step-melody');
    expect(nextButton().disabled).toBe(true);
    fireEvent.click(within(melodyStep).getByText('Record'));
    await waitFor(() => expect(within(melodyStep).getByText('Stop')).toBeTruthy());
    mic.feed(concat([sine(60, 0.4), sine(64, 0.4), sine(67, 0.4), new Float32Array(2205)]));
    fireEvent.click(within(melodyStep).getByText('Stop'));
    await waitFor(() => expect(within(melodyStep).getByTestId('voice-take-waveform').getAttribute('data-markers')).toBe('3'));
    expect(tracker.calls).toBe(1);
    expect(screen.getByTestId('voice-setup-range').textContent).toBe('Heard 3 notes: A3 to A#4, no transpose');
    expect(useVoiceStore.getState().fine.minMidiNote).toBe(DEFAULT_PITCH_SETTINGS.minMidiNote);
    fireEvent.click(screen.getByText('Next'));
    expect(useVoiceStore.getState().fine).toMatchObject({ minMidiNote: 57, maxMidiNote: 70, transpose: 0 });
    expect(writtenNotes()).toEqual([]);

    expect(screen.getByTestId('voice-setup-result').textContent).toMatch(/^Drum training: held out \d+: \d+ percent correct/);
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
    render(<VoiceToNotesPanel isOpen onClose={() => {}} tracker={new SineReadingTracker()} deps={deps} />);
    expect(screen.queryByTestId('voice-setup-step-microphone')).toBeNull();
    fireEvent.click(screen.getByLabelText('Setup wizard'));
    expect(screen.getByTestId('voice-setup-step-microphone')).toBeTruthy();
  });
});
