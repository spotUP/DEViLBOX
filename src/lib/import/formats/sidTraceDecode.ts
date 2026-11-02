/**
 * sidTraceDecode.ts - turn a per-frame SID register trace into notes,
 * instruments and a row grid. Pure functions; SIDParser.ts owns the emulation.
 *
 * Ported from MagPlaySID (https://github.com/MagnarHarestad/MagPlaySID,
 * Magnar Harestad / Censor Design, GPL-2.0-or-later; used here under
 * GPL-3.0-or-later):
 *   - recoverTuning        <- src/MagPlay.Transcribe/Music.cs  NoteTable / Tuning
 *   - fitGrid / bestPhase  <- src/MagSid.Core/SidImport/SidTranscriber.cs  GridFitting / BestPhase
 *   - gridOf (phase pick)  <- src/MagPlay.Transcribe/Music.cs  Grid.Of (single-row-length case)
 *   - instrument signature <- the "way a note is played" idea of Music.cs Sound.Hear
 *     (attack/decay, sustain/release, wave program, pulse program, filter), reduced
 *     to a signature key.
 * Funk tempo and shifting grids of MagPlaySID are not ported; a tune that fits
 * no single row length falls back to the shortest common one.
 */

/** One voice's registers in one frame. */
export interface VoiceFrame {
  freq: number;     // 16 bit
  pulse: number;    // 12 bit
  control: number;  // $D404 style control register
  ad: number;
  sr: number;
  /** Chip-wide filter state at this frame: cutoff high byte, resonance/route, mode/volume. */
  cutoff: number;
  resRoute: number;
  modeVol: number;
}

export interface DecodedNote {
  voice: number;
  start: number;        // frame of gate rise
  end: number | null;   // frame of gate fall, null when the trace ends gated
  note: number;         // 1..96, 0 when pitch unknown
  signature: string;
  instrument: number;   // 1-based, assigned by inferInstruments
  frame: VoiceFrame;    // registers at note start (after settling)
  program: SoundProgram;
  /**
   * Gate fall / rise pairs inside the note that are not note inits: the pitch,
   * pulse and envelope run on across them (a GoatTracker KEYOFF then KEYON).
   */
  regates: Array<{ off: number; on: number }>;
}

export interface SoundProgram {
  waves: number[];      // distinct waveform nibbles (control >> 4) in order of appearance
  ringSync: number;     // OR of ring (4) and sync (2) bits seen
  pulseMoves: boolean;
  pulseStart: number;
  toFilter: boolean;
  filterMode: number;   // modeVol bits 4..6
  resonance: number;
}

const WAVE_PROGRAM_FRAMES = 32;

function noteFromFreq(freq: number, clock: number, tuning: number): number {
  if (freq === 0) return 0;
  const hz = freq * clock / 16777216;
  if (hz < 20 || hz > 20000) return 0;
  const note = Math.round(12 * Math.log2(hz / 440) + 69 - tuning);
  return note >= 1 && note <= 96 ? note : 0;
}

/**
 * Semitone offset of the tune's tuning from A440, -0.5..0.5: circular mean of
 * the frequencies held across two frames, so notes either side of a half
 * semitone agree. 0 when fewer than 16 held frequencies or no agreement.
 */
export function recoverTuning(voices: VoiceFrame[][], clock: number): number {
  let sin = 0, cos = 0, count = 0;
  for (const frames of voices) {
    for (let f = 1; f < frames.length; f++) {
      const cur = frames[f];
      if ((cur.control & 1) && cur.freq >= 0x100 && cur.freq === frames[f - 1].freq) {
        const semis = 12 * Math.log2(cur.freq * clock / 16777216 / 440);
        const angle = 2 * Math.PI * (semis - Math.round(semis));
        sin += Math.sin(angle); cos += Math.cos(angle); count++;
      }
    }
  }
  if (count < 16 || Math.sqrt(sin * sin + cos * cos) < count * 0.5) return 0;
  return Math.atan2(sin, cos) / (2 * Math.PI);
}

function programOf(frames: VoiceFrame[], start: number, end: number): SoundProgram {
  const waves: number[] = [];
  let ringSync = 0;
  let pulseMoves = false;
  const first = frames[start];
  const stop = Math.min(end, start + WAVE_PROGRAM_FRAMES);
  for (let f = start; f < stop; f++) {
    const fr = frames[f];
    const wave = fr.control >> 4;
    if (wave !== 0 && waves[waves.length - 1] !== wave && waves.length < 8) waves.push(wave);
    ringSync |= fr.control & 0x06;
    if (fr.pulse !== first.pulse) pulseMoves = true;
  }
  return {
    waves, ringSync, pulseMoves, pulseStart: first.pulse,
    toFilter: false, filterMode: (first.modeVol >> 4) & 7, resonance: first.resRoute >> 4,
  };
}

/** Frames before a gate rise whose steps bound a continuing modulation. */
const CONTINUE_WINDOW = 4;

/**
 * True when the gate rise at `on` (gate off since `off`) is not a note init:
 * a player note init rewrites the frequency, restarts the wave and pulse
 * programs and usually hard-restarts the envelope. Here nothing restarts: the
 * envelope registers are unchanged across the gap, the waveform is the same
 * without the test bit, and the frequency and pulse steps at the rise are no
 * larger than the steps of a modulation that was moving just before. A held,
 * unmodulated tone gives no evidence and stays a new note.
 */
function continuesAcrossGate(frames: VoiceFrame[], off: number, on: number): boolean {
  const at = frames[on];
  if (off < 1 || on - off < 1 || (at.control & 0x08) !== 0) return false;
  if ((at.control >> 4) !== (frames[on - 1].control >> 4) || at.freq === 0) return false;
  for (let f = off - 1; f < on; f++) {
    if (frames[f].ad !== at.ad || frames[f].sr !== at.sr) return false;
  }
  const from = Math.max(1, on - CONTINUE_WINDOW);
  let freqStep = 0, pulseStep = 0;
  for (let f = from; f < on; f++) {
    freqStep = Math.max(freqStep, Math.abs(frames[f].freq - frames[f - 1].freq));
    pulseStep = Math.max(pulseStep, Math.abs(frames[f].pulse - frames[f - 1].pulse));
  }
  if (freqStep === 0 && pulseStep === 0) return false;
  return Math.abs(at.freq - frames[on - 1].freq) <= freqStep
    && Math.abs(at.pulse - frames[on - 1].pulse) <= pulseStep;
}

/**
 * The control register a note's own program writes at frame f: inside a
 * re-gate gap the gate is cleared by the pattern (KEYOFF), not by the program,
 * so the program keeps the gate bit.
 */
export function programControl(n: DecodedNote, frames: VoiceFrame[], f: number): number {
  const c = frames[f].control;
  return n.regates.some((r) => f >= r.off && f < r.on) ? c | 1 : c;
}

/**
 * Segment each voice by its gate: a note runs from a gate rise to the gate
 * fall. Pitch is read from the first settled frame (freq non-zero within three
 * frames of the rise) and snapped to the recovered tuning. Arpeggio, vibrato
 * and slides inside a held gate stay inside the one note, and so does a gate
 * rise that restarts nothing (continuesAcrossGate): it is a re-gate of the
 * previous note, recorded in `regates`.
 */
export function segmentNotes(voices: VoiceFrame[][], clock: number): DecodedNote[] {
  const tuning = recoverTuning(voices, clock);
  const notes: DecodedNote[] = [];
  voices.forEach((frames, voice) => {
    let open: DecodedNote | null = null;
    let last: DecodedNote | null = null;
    for (let f = 0; f < frames.length; f++) {
      const gate = (frames[f].control & 1) !== 0;
      const prevGate = f > 0 && (frames[f - 1].control & 1) !== 0;
      if (gate && !prevGate) {
        if (open) open.end = f;
        if (!open && last && last.end !== null && continuesAcrossGate(frames, last.end, f)) {
          last.regates.push({ off: last.end, on: f });
          last.end = null;
          open = last;
          continue;
        }
        let settle = f;
        while (settle < f + 3 && settle < frames.length - 1 && frames[settle].freq === 0) settle++;
        const note = noteFromFreq(frames[settle].freq, clock, tuning);
        open = {
          voice, start: f, end: null, note, signature: '', instrument: 0,
          frame: frames[settle], program: programOf(frames, f, frames.length), regates: [],
        };
        notes.push(open);
        last = open;
      } else if (!gate && prevGate && open) {
        open.end = f;
        open = null;
      }
    }
  });
  // Re-read each program up to its own end, and the filter route of its voice.
  for (const n of notes) {
    const frames = voices[n.voice];
    n.program = programOf(frames, n.start, n.end ?? frames.length);
    n.program.toFilter = (n.frame.resRoute & (1 << (n.voice % 3))) !== 0;
    n.signature = signatureOf(n.frame, n.program, 'full');
  }
  return notes.filter((n) => n.note > 0);
}

function signatureOf(fr: VoiceFrame, p: SoundProgram, level: 'full' | 'coarse' | 'basic'): string {
  const base = `${fr.ad}.${fr.sr}.${p.waves[0] ?? 0}`;
  if (level === 'basic') return base;
  const prog = `${base}.${p.waves.join('')}.${p.ringSync}.${p.toFilter ? 1 : 0}${p.toFilter ? p.filterMode : 0}`;
  if (level === 'coarse') return `${prog}.${p.pulseMoves ? 'm' : 's'}`;
  return `${prog}.${p.pulseMoves ? 'm' : p.pulseStart >> 8}`;
}

export const MAX_INFERRED_INSTRUMENTS = 63;

/**
 * One instrument per distinct way a note is played. When there are more than
 * MAX_INFERRED_INSTRUMENTS, the signature is coarsened (pulse start dropped,
 * then wave program dropped) until it fits. Assigns note.instrument (1-based)
 * and returns the representative note of each instrument.
 */
export function inferInstruments(notes: DecodedNote[]): DecodedNote[] {
  for (const level of ['full', 'coarse', 'basic'] as const) {
    const index = new Map<string, number>();
    const reps: DecodedNote[] = [];
    for (const n of notes) {
      const key = signatureOf(n.frame, n.program, level);
      if (!index.has(key)) { index.set(key, reps.length + 1); reps.push(n); }
      n.instrument = index.get(key)!;
    }
    if (reps.length <= MAX_INFERRED_INSTRUMENTS || level === 'basic') return reps;
  }
  return [];
}

// ── Row grid fitting ──

export interface RowGrid {
  /** Frames per row. */
  framesPerRow: number;
  /** Frame the first row starts on. */
  origin: number;
}

/** Phase of rows of `a` frames that puts most starts on a row (a start a frame either side counts from 4 frames up). */
function bestPhase(starts: number[], a: number): { phase: number; aligned: number } {
  const counts = new Array<number>(a).fill(0);
  for (const s of starts) counts[s % a]++;
  const tolerant = a >= 4;
  const near = (p: number) => tolerant
    ? counts[p % a] + counts[(p + 1) % a] + counts[(p + a - 1) % a]
    : counts[p % a];
  let best = 0;
  for (let p = 1; p < a; p++) {
    if (near(p) > near(best) || (near(p) === near(best) && counts[p] > counts[best])) best = p;
  }
  return { phase: best, aligned: near(best) };
}

/**
 * Longest row length (up to 16 frames) that puts nine note starts in ten on a
 * row; 1 when none does. Starts are the gate rises of every voice.
 */
export function fitGrid(notes: DecodedNote[]): RowGrid {
  const starts = notes.map((n) => n.start).sort((x, y) => x - y);
  if (starts.length === 0) return { framesPerRow: 6, origin: 0 };
  for (let a = 16; a >= 2; a--) {
    const { phase, aligned } = bestPhase(starts, a);
    if (aligned >= starts.length * 0.9) {
      // First row on or before the first note.
      let origin = phase;
      while (origin + a <= starts[0]) origin += a;
      return { framesPerRow: a, origin };
    }
  }
  return { framesPerRow: 1, origin: 0 };
}

/**
 * Row index a frame falls in: the last row starting on or before it, where from
 * 4 frames a row a start one frame early still counts as on its row (a
 * player's hard restart moves a gate rise by a frame).
 */
export function rowOfFrame(grid: RowGrid, frame: number): number {
  const tolerance = grid.framesPerRow >= 4 ? 1 : 0;
  return Math.max(0, Math.floor((frame - grid.origin + tolerance) / grid.framesPerRow));
}
