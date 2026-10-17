/**
 * noteEffects.ts - what the voice did on each note, as tracker effects.
 *
 * Pure. A take's pitch contour (the pitch tracker's voiced frames, one per
 * hop) is read once per take; each quantised note is then compared with the
 * contour under it:
 *
 *  - a pitch that leaves the note's start and settles a semitone or more away
 *    is a tone portamento (3xx) on the rows the slide was heard on, with the
 *    target note on the first of them;
 *  - a pitch that wobbles around its trend at 3..9 Hz is a vibrato (4xy);
 *  - a level that falls or rises by 6 dB over the note's rows is a volume
 *    slide (Axy) on the rows after the note;
 *  - a note kept off its row by the quantiser is a note delay (EDx);
 *  - three or more short notes inside one row window are one note with an
 *    arpeggio (0xy); this runs before quantising, which merges same-row notes.
 *
 * Parameter maths follow FastTracker II linear-frequency rules: 16 portamento
 * units per semitone per tick, vibrato speed x = cycles per tick * 64, vibrato
 * depth y = semitones * 8, volume slide per tick in 1/64 steps, tick = 2.5/bpm s.
 */
import type { VoiceEffectToggles } from '@/stores/useVoiceStore';
import type { VoiceNote } from './pitchNotes';
import { TRACK_VOICED_CONFIDENCE, hzToMidi, type F0Track } from './pitchTrack';
import { anchorToFirstNote, quantiseNotes, rowSeconds, type QuantisedNote, type QuantiseSettings } from './quantise';
import type { VoiceEffect } from './voiceEffects';
import { spanRms } from './voicing';

/** Every effect on: the pipeline without a panel (MCP, tests). */
export const ALL_EFFECTS: VoiceEffectToggles = { volume: true, slides: true, vibrato: true, arpeggio: true, flams: true };

/**
 * The span one tracker frame averages its pitch over. A wobble whose period
 * is near this span reads shallower by sinc(rate x span); the vibrato detector
 * undoes that. SWIFTF0_PROBE_SECONDS is set from the depth loss measured on
 * synthetic vibratos through the tracker in Chrome (plan WC-5): a voice-like
 * tone (8 harmonics, midi 55 and 67) with 0.5-2 semitone vibrato at 3-7 Hz
 * reads 0.92-1.03 of its depth, with no loss that grows with rate. SwiftF0
 * frames do not smear a vocal vibrato, so the span is 0. (A pure sine reads
 * shallower and drops voicing, but that loss depends on pitch and depth, not
 * on rate, and a voice is never a pure sine.)
 */
export const SWIFTF0_PROBE_SECONDS = 0;
/** A contour probe further than this from its neighbours' median is a glitch, not a pitch. */
const DESPIKE_SEMITONES = 3;
/** Pitch must move at least this far to be a slide. */
const SLIDE_MIN_SEMITONES = 1;
/** Start and end medians are taken over this much of the note. */
const EDGE_SECONDS = 0.06;
/** A contour point within this of a pitch counts as being on it. */
const ON_PITCH_SEMITONES = 0.5;
/** Share of contour steps that must move the slide's way. */
const SLIDE_MONOTONE_SHARE = 0.8;
/** Segmented notes this close in time, one or two semitones apart, can be steps of one glide. */
const GLIDE_JOIN_GAP_SECONDS = 0.04;
const GLIDE_JOIN_MAX_STEP = 2;
/** A step note moving at least this far across its own span is part of a glide, not a held note. */
const GLIDE_MOVING_SEMITONES = 0.5;
const VIBRATO_MIN_HZ = 3;
const VIBRATO_MAX_HZ = 9;
const VIBRATO_MIN_DEPTH = 0.25;
const VIBRATO_MAX_DEPTH = 2;
const VIBRATO_MIN_CROSSINGS = 3;
/** Level change over the note that is written as a volume slide. */
const VOLUME_SLIDE_DB = 6;
/** A row louder than the previous by more than this breaks a decay. */
const VOLUME_MONOTONE_DB = 1;

export interface ContourPoint {
  /** Seconds from the take start. */
  time: number;
  /** Fractional MIDI pitch. */
  midi: number;
}

export interface TakeContour {
  points: ContourPoint[];
  /** Averaging span of one point (see SWIFTF0_PROBE_SECONDS). */
  probeSeconds: number;
}

export interface TakeAudio {
  audio: Float32Array;
  sampleRate: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The take's pitch contour: one point per tracker frame whose confidence
 * reaches TRACK_VOICED_CONFIDENCE. A frame more than DESPIKE_SEMITONES from
 * the median of its 5 neighbours (an octave error, a glitch) is replaced by
 * that median; every other frame is kept as read, so a wobble keeps its depth
 * (a plain 5-point median flattened a 5 Hz vibrato to half). Read once per
 * take and shared by every quantise setting.
 */
export function contourFromTrack(track: F0Track, probeSeconds = SWIFTF0_PROBE_SECONDS): TakeContour {
  const step = track.hopSeconds;
  const raw: ContourPoint[] = [];
  for (let i = 0; i < track.hz.length; i++) {
    if (track.confidence[i] < TRACK_VOICED_CONFIDENCE || track.hz[i] <= 0) continue;
    raw.push({ time: i * step, midi: hzToMidi(track.hz[i]) });
  }
  const points: ContourPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const window: number[] = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(raw.length - 1, i + 2); j++) {
      // Only neighbours of the same voiced run; a gap of more than two frames is a new run.
      if (Math.abs(raw[j].time - raw[i].time) <= step * 2.5) window.push(raw[j].midi);
    }
    const smooth = median(window);
    points.push({ time: raw[i].time, midi: Math.abs(raw[i].midi - smooth) > DESPIKE_SEMITONES ? smooth : raw[i].midi });
  }
  return { points, probeSeconds };
}

function contourUnder(contour: TakeContour, start: number, end: number): ContourPoint[] {
  return contour.points.filter((p) => p.time >= start && p.time < end);
}

/** A note written `offsetRows` late (0 < offset < 1 row) as a note delay, or null when it cannot be. */
export function noteDelayEffect(offsetRows: number, speed: number): VoiceEffect | null {
  if (offsetRows <= 0 || speed < 2) return null;
  return { kind: 'noteDelay', param: clamp(Math.round(offsetRows * speed), 1, speed - 1), rowOffset: 0 };
}

/**
 * Three or more short notes (each under a row) that start inside one row
 * window, on two or three pitches, become one note at the lowest pitch with
 * an arpeggio of the others. Runs on the sung notes, before quantising.
 */
export function arpeggiateNotes(notes: readonly VoiceNote[], q: QuantiseSettings): VoiceNote[] {
  const rs = rowSeconds(q.bpm, q.speed);
  const sorted = [...notes].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const out: VoiceNote[] = [];
  let i = 0;
  while (i < sorted.length) {
    const first = sorted[i];
    let j = i;
    while (
      j < sorted.length &&
      sorted[j].durationSeconds < rs &&
      sorted[j].startTimeSeconds - first.startTimeSeconds < rs
    ) {
      j++;
    }
    const group = sorted.slice(i, j);
    const pitches = [...new Set(group.map((n) => Math.round(n.pitchMidi)))].sort((a, b) => a - b);
    if (group.length >= 3 && pitches.length >= 2 && pitches.length <= 3) {
      const last = group[group.length - 1];
      const x = clamp(pitches[1] - pitches[0], 0, 15);
      const y = pitches.length === 3 ? clamp(pitches[2] - pitches[0], 0, 15) : 0;
      out.push({
        startTimeSeconds: first.startTimeSeconds,
        durationSeconds: last.startTimeSeconds + last.durationSeconds - first.startTimeSeconds,
        pitchMidi: pitches[0],
        amplitude: Math.max(...group.map((n) => n.amplitude)),
        effects: [{ kind: 'arpeggio', param: (x << 4) | y, rowOffset: 0 }],
      });
      i = j;
    } else {
      out.push(first);
      i++;
    }
  }
  return out;
}

/** Pitch travelled across a note's span, from a least-squares line through its contour. */
function contourTravel(points: readonly ContourPoint[], start: number, end: number): number {
  if (points.length < 2) return 0;
  const n = points.length;
  let st = 0;
  let sm = 0;
  let stt = 0;
  let stm = 0;
  for (const p of points) {
    st += p.time;
    sm += p.midi;
    stt += p.time * p.time;
    stm += p.time * p.midi;
  }
  const denom = n * stt - st * st;
  return denom !== 0 ? ((n * stm - st * sm) / denom) * (end - start) : 0;
}

/**
 * The segmenter splits a sung glide into semitone steps, as SwiftF0 itself
 * does (segmentNotes parity). Back-to-back steps the same way, with an
 * unbroken contour across each join and at least one side of each join
 * moving, become one note at the first step's pitch; the slide detector then
 * hears the glide on it. Two held notes sung legato stay two notes: neither
 * side moves. Runs on the sung notes, before quantising.
 */
export function joinGlides(notes: readonly VoiceNote[], contour: TakeContour): VoiceNote[] {
  const sorted = [...notes].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const travel = (n: VoiceNote): number => {
    const end = n.startTimeSeconds + n.durationSeconds;
    return contourTravel(contourUnder(contour, n.startTimeSeconds, end), n.startTimeSeconds, end);
  };
  const unbroken = (a: VoiceNote, b: VoiceNote): boolean => {
    const join = contourUnder(contour, a.startTimeSeconds + a.durationSeconds - EDGE_SECONDS, b.startTimeSeconds + EDGE_SECONDS);
    if (join.length < 2) return false;
    for (let i = 1; i < join.length; i++) {
      if (join[i].time - join[i - 1].time > GLIDE_JOIN_GAP_SECONDS) return false;
      if (Math.abs(join[i].midi - join[i - 1].midi) > ON_PITCH_SEMITONES) return false;
    }
    return true;
  };
  const out: VoiceNote[] = [];
  let i = 0;
  while (i < sorted.length) {
    const first = sorted[i];
    let last = first;
    let direction = 0;
    let j = i + 1;
    for (; j < sorted.length; j++) {
      const next = sorted[j];
      const step = Math.round(next.pitchMidi) - Math.round(last.pitchMidi);
      const gap = next.startTimeSeconds - (last.startTimeSeconds + last.durationSeconds);
      if (step === 0 || Math.abs(step) > GLIDE_JOIN_MAX_STEP || gap > GLIDE_JOIN_GAP_SECONDS) break;
      if (direction !== 0 && Math.sign(step) !== direction) break;
      const moving = (n: VoiceNote): boolean => travel(n) * Math.sign(step) >= GLIDE_MOVING_SEMITONES;
      if (!moving(last) && !moving(next)) break;
      if (!unbroken(last, next)) break;
      direction = Math.sign(step);
      last = next;
    }
    if (last === first) {
      out.push(first);
    } else {
      const group = sorted.slice(i, j);
      out.push({
        startTimeSeconds: first.startTimeSeconds,
        durationSeconds: last.startTimeSeconds + last.durationSeconds - first.startTimeSeconds,
        pitchMidi: first.pitchMidi,
        amplitude: Math.max(...group.map((n) => n.amplitude)),
      });
    }
    i = j;
  }
  return out;
}

interface SlideHeard {
  startMidi: number;
  endMidi: number;
  /** Rows after the note where the pitch starts leaving the start pitch. */
  fromRow: number;
  /** Rows the slide takes. */
  rows: number;
}

function slideHeard(points: readonly ContourPoint[], note: QuantisedNote, noteStart: number, rs: number): SlideHeard | null {
  if (note.lengthRows < 2 || points.length < 4) return null;
  const end = points[points.length - 1].time;
  const head = points.filter((p) => p.time < noteStart + EDGE_SECONDS).map((p) => p.midi);
  const tail = points.filter((p) => p.time >= end - EDGE_SECONDS).map((p) => p.midi);
  if (head.length === 0 || tail.length === 0) return null;
  const startMedian = median(head);
  const endMedian = median(tail);
  const semis = endMedian - startMedian;
  if (Math.abs(semis) < SLIDE_MIN_SEMITONES) return null;
  let agree = 0;
  let moves = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].midi - points[i - 1].midi;
    if (Math.abs(d) < 0.05) continue;
    moves++;
    if (Math.sign(d) === Math.sign(semis)) agree++;
  }
  if (moves === 0 || agree / moves < SLIDE_MONOTONE_SHARE) return null;
  const leave = points.find((p) => Math.abs(p.midi - startMedian) > ON_PITCH_SEMITONES) ?? points[0];
  const reach = points.find((p) => p.time > leave.time && Math.abs(p.midi - endMedian) <= ON_PITCH_SEMITONES) ?? points[points.length - 1];
  const startMidi = Math.round(startMedian + 12 * Math.round((note.midi - startMedian) / 12));
  const fromRow = clamp(Math.round((leave.time - noteStart) / rs), 1, note.lengthRows - 1);
  const reachRow = clamp(Math.round((reach.time - noteStart) / rs), fromRow + 1, note.lengthRows);
  return { startMidi, endMidi: startMidi + Math.round(semis), fromRow, rows: reachRow - fromRow };
}

interface VibratoHeard {
  rateHz: number;
  depthSemitones: number;
}

/**
 * Vibrato rate and depth of a note's contour. Each contour point averages
 * its pitch over the contour's probe span, which flattens a wobble whose
 * period is near that span by sinc(rate x span). The depth is divided by that
 * loss before it becomes the y nibble.
 */
function vibratoHeard(points: readonly ContourPoint[], probeSeconds: number): VibratoHeard | null {
  if (points.length < 8) return null;
  // Least-squares line through the contour; the wobble is what is left.
  const n = points.length;
  const t0 = points[0].time;
  let st = 0;
  let sm = 0;
  let stt = 0;
  let stm = 0;
  for (const p of points) {
    const t = p.time - t0;
    st += t;
    sm += p.midi;
    stt += t * t;
    stm += t * p.midi;
  }
  const denom = n * stt - st * st;
  const slope = denom !== 0 ? (n * stm - st * sm) / denom : 0;
  const intercept = (sm - slope * st) / n;
  const dev = points.map((p) => p.midi - (intercept + slope * (p.time - t0)));
  // Where the wobble crosses the line, interpolated between probes; each
  // crossing is half a period, so the rate comes from the first to the last.
  const crossings: number[] = [];
  for (let i = 1; i < dev.length; i++) {
    if (Math.sign(dev[i]) === Math.sign(dev[i - 1]) || dev[i] === 0) continue;
    const t1 = points[i - 1].time;
    const t2 = points[i].time;
    crossings.push(t1 + ((t2 - t1) * dev[i - 1]) / (dev[i - 1] - dev[i]));
  }
  if (crossings.length < VIBRATO_MIN_CROSSINGS) return null;
  // Amplitude of the wobble from its RMS: one stray probe cannot set the depth.
  const depth = Math.sqrt((2 * dev.reduce((sum, d) => sum + d * d, 0)) / n);
  if (depth < VIBRATO_MIN_DEPTH || depth > VIBRATO_MAX_DEPTH) return null;
  const seconds = crossings[crossings.length - 1] - crossings[0];
  if (seconds <= 0) return null;
  const rateHz = (crossings.length - 1) / 2 / seconds;
  if (rateHz < VIBRATO_MIN_HZ || rateHz > VIBRATO_MAX_HZ) return null;
  const smear = Math.PI * rateHz * probeSeconds;
  const probeLoss = smear > 0 ? Math.max(0.25, Math.sin(smear) / smear) : 1;
  return { rateHz, depthSemitones: depth / probeLoss };
}

interface VolumeHeard {
  /** Positive = louder, negative = quieter, in volume-column units (0..64). */
  change: number;
}

function volumeHeard(take: TakeAudio, note: QuantisedNote, noteStart: number, rs: number): VolumeHeard | null {
  if (note.lengthRows < 2) return null;
  const levels: number[] = [];
  for (let r = 0; r < note.lengthRows; r++) {
    const level = spanRms(take.audio, take.sampleRate, noteStart + r * rs, rs);
    if (level <= 0) return null;
    levels.push(20 * Math.log10(level));
  }
  const total = levels[levels.length - 1] - levels[0];
  if (Math.abs(total) < VOLUME_SLIDE_DB) return null;
  for (let r = 1; r < levels.length; r++) {
    const d = levels[r] - levels[r - 1];
    if (total < 0 ? d > VOLUME_MONOTONE_DB : d < -VOLUME_MONOTONE_DB) return null;
  }
  const first = Math.pow(10, levels[0] / 20);
  const last = Math.pow(10, levels[levels.length - 1] / 20);
  return { change: 64 * note.velocity * (last / first - 1) };
}

/**
 * The effects heard on each quantised note. Slides rewrite the note at its
 * heard start pitch and put the target on the slide's first row; the other
 * effects only add to the note. `take` null (no audio, as from the live
 * preview) gives note delays only.
 */
export function detectNoteEffects(
  notes: readonly QuantisedNote[],
  take: TakeAudio | null,
  contour: TakeContour | null,
  q: QuantiseSettings,
  toggles: VoiceEffectToggles,
): QuantisedNote[] {
  const rs = rowSeconds(q.bpm, q.speed);
  const shift = q.latencyNudgeMs / 1000;
  const ticksPerSecond = q.bpm / 2.5;
  const ticksPerRow = Math.max(1, q.speed - 1);
  return notes.map((n, i) => {
    const effects: VoiceEffect[] = [...(n.effects ?? [])];
    let midi = n.midi;
    const delay = noteDelayEffect(n.offsetRows, q.speed);
    if (delay) effects.push(delay);

    const noteStart = n.heardSeconds + shift;
    const next = notes[i + 1];
    const noteEnd = Math.min(noteStart + n.lengthRows * rs, next ? next.heardSeconds + shift : Infinity);
    const points = contour ? contourUnder(contour, noteStart, noteEnd) : [];

    const slide = toggles.slides ? slideHeard(points, n, noteStart, rs) : null;
    if (slide) {
      midi = slide.startMidi;
      const param = clamp(Math.round((Math.abs(slide.endMidi - slide.startMidi) * 16) / (slide.rows * ticksPerRow)), 1, 255);
      for (let r = 0; r < slide.rows; r++) {
        effects.push({ kind: 'tonePorta', param, rowOffset: slide.fromRow + r, ...(r === 0 ? { midi: slide.endMidi } : {}) });
      }
    }

    const vibrato = toggles.vibrato && !slide && contour ? vibratoHeard(points, contour.probeSeconds) : null;
    if (vibrato) {
      const x = clamp(Math.round((vibrato.rateHz * 64) / ticksPerSecond), 1, 15);
      const y = clamp(Math.round(vibrato.depthSemitones * 8), 1, 15);
      for (let r = 0; r < n.lengthRows; r++) effects.push({ kind: 'vibrato', param: (x << 4) | y, rowOffset: r });
    }

    const volume = toggles.volume && take ? volumeHeard(take, n, noteStart, rs) : null;
    if (volume) {
      const perTick = clamp(Math.round(Math.abs(volume.change) / ((n.lengthRows - 1) * ticksPerRow)), 1, 15);
      const param = volume.change < 0 ? perTick : perTick << 4;
      for (let r = 1; r < n.lengthRows; r++) effects.push({ kind: 'volumeSlide', param, rowOffset: r });
    }

    return effects.length ? { ...n, midi, effects } : { ...n, midi };
  });
}

/**
 * The notes a take is heard as before quantising: glide steps joined into one
 * note when slides are on. The note roll draws these, melodyRows writes them.
 */
export function heardNotes(notes: readonly VoiceNote[], contour: TakeContour | null, toggles: VoiceEffectToggles): readonly VoiceNote[] {
  return toggles.slides && contour ? joinGlides(notes, contour) : notes;
}

/**
 * The rows a melody take writes: arpeggios folded, quantised, effects
 * attached, first note on row 0. The one path for the commit, the pattern preview and the panel's
 * written-rows table.
 */
export function melodyRows(
  notes: readonly VoiceNote[],
  q: QuantiseSettings,
  take: TakeAudio | null,
  contour: TakeContour | null,
  toggles: VoiceEffectToggles,
): QuantisedNote[] {
  const heard = heardNotes(notes, contour, toggles);
  const folded = toggles.arpeggio ? arpeggiateNotes(heard, q) : heard;
  return anchorToFirstNote(detectNoteEffects(quantiseNotes(folded, q), take, contour, q, toggles));
}
