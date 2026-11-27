/**
 * segmentNotes.ts - turn a SwiftF0 frame track into notes.
 *
 * Port of swift_f0/music.py `segment_notes` (exact dynamic program). It splits
 * the frames into notes and gaps with the smallest total cost
 *   J = sum over notes of [beta + sum over its frames of (offpitch + unvoiced + quiet)]
 * where gaps cost nothing and every note has one pitch mu, chosen from the
 * measured frame pitches rounded to a cent.
 * - offpitch = w * min(|m - mu|, 2), m the frame pitch in semitones, w its weight
 * - unvoiced = -ln(c / (1 - c)), c = w clipped to [0.01, 0.99]
 * - quiet    = dB by which the frame lies more than 3.01 dB below the loudest
 *              frames within 64 ms on both sides (splits repeated notes at a dip)
 * - beta     = pitchHoldMs / hop: the cost of one note
 *
 * Voice to Notes additions: frames below `voicingThreshold` get weight 0 (at 0
 * segmentFrames equals music.py); segmentNotes folds octave errors before the
 * DP and joins same-pitch notes split at a confidence dip after it (VNR-17),
 * then MIDI = nearest semitone, length and range filters, amplitude from loudness.
 */
import type { VoiceNote } from './pitchNotes';
import type { F0Track } from './pitchTrack';
import { hzToMidi } from './pitchTrack';

export interface SegmentSettings {
  /** SwiftF0 pitch_hold_ms: a one-semitone change must last this long to split. */
  pitchHoldMs: number;
  /** Frames below this confidence count as unvoiced. */
  voicingThreshold: number;
  minNoteLengthMs: number;
  minMidiNote: number;
  maxMidiNote: number;
}

export const DEFAULT_SEGMENT_SETTINGS: SegmentSettings = {
  pitchHoldMs: 80,
  voicingThreshold: 0.5,
  minNoteLengthMs: 90,
  minMidiNote: 21,
  maxMidiNote: 108,
};

/** One note of the dynamic program, in frames, before filters. */
export interface SegmentedNote {
  startFrame: number;
  /** Exclusive. */
  endFrame: number;
  /** Fitted pitch in semitones (fractional, cent-rounded). */
  mu: number;
}

const OFFPITCH_CAP = 2;
const QUIET_MARGIN_DB = 10 * Math.log10(2);
/** 64 ms at a 16 ms hop: the frame plus 4 on each side. */
const NEIGHBOURHOOD = 4;

/** The exact DP of music.py on a track; notes in time order, frame indices. */
export function segmentFrames(track: F0Track, pitchHoldMs: number, voicingThreshold = 0): SegmentedNote[] {
  const { hz, confidence, loudnessDb, hopSeconds } = track;
  const n = hz.length;
  const m = new Float64Array(n);
  const w = new Float64Array(n);
  const q = new Float64Array(n);
  const cents = new Set<number>();
  for (let t = 0; t < n; t++) {
    const f = hz[t];
    if (!(Number.isFinite(f) && f > 0)) continue;
    m[t] = hzToMidi(f);
    const c = confidence[t];
    w[t] = c >= voicingThreshold ? c : 0;
    cents.add(Math.floor(m[t] * 100 + 0.5));
  }
  if (cents.size === 0) return [];
  const mu = Float64Array.from([...cents].sort((a, b) => a - b), (c) => c / 100);

  // Loudness peaks over the 5 frames ending at / starting at t, symmetric padding.
  const level = (i: number): number => {
    const j = i < 0 ? -i - 1 : i >= n ? 2 * n - i - 1 : i;
    return loudnessDb[Math.min(n - 1, Math.max(0, j))];
  };
  for (let t = 0; t < n; t++) {
    let left = -Infinity;
    let right = -Infinity;
    for (let j = 0; j <= NEIGHBOURHOOD; j++) {
      left = Math.max(left, level(t - j));
      right = Math.max(right, level(t + j));
    }
    const cc = Math.min(0.99, Math.max(0.01, w[t]));
    q[t] = -Math.log(cc / (1 - cc)) + Math.max(0, Math.min(left, right) - loudnessDb[t] - QUIET_MARGIN_DB);
  }

  const k = mu.length;
  const beta = pitchHoldMs / 1000 / hopSeconds;
  const vn = new Float64Array(k).fill(Infinity);
  const noteStart = new Int32Array(k);
  const back = new Int32Array(n + 1);
  const kind = new Int32Array(n + 1).fill(-1);
  let best = 0;
  for (let t = 0; t < n; t++) {
    const start = best + beta;
    const mt = m[t];
    const wt = w[t];
    const qt = q[t];
    let jBest = 0;
    let vBest = Infinity;
    for (let j = 0; j < k; j++) {
      let v = vn[j];
      if (start < v) {
        v = start;
        noteStart[j] = t;
      }
      v += wt * Math.min(Math.abs(mu[j] - mt), OFFPITCH_CAP) + qt;
      vn[j] = v;
      if (v < vBest) {
        vBest = v;
        jBest = j;
      }
    }
    if (vBest < best) {
      best = vBest;
      back[t + 1] = noteStart[jBest];
      kind[t + 1] = jBest;
    } else {
      back[t + 1] = t;
    }
  }

  const notes: SegmentedNote[] = [];
  for (let b = n; b > 0; ) {
    const a = back[b];
    if (kind[b] >= 0) notes.push({ startFrame: a, endFrame: b, mu: mu[kind[b]] });
    b = a;
  }
  return notes.reverse();
}

/** Frames on each side whose median pitch a frame is checked against for an octave error. */
const FOLD_HALF_FRAMES = 8;
/** Two same-pitch notes this close, with no loudness dip between them, are one held note (VNR-17). */
const JOIN_GAP_MS = 100;
/** A gap frame this far below the quieter of the two notes is a real break (breath, consonant, re-attack). */
const JOIN_DIP_DB = 6;
/** Frames either side of the boundary searched for that dip (the DP cuts a quiet split inside the dip). */
const JOIN_EDGE_FRAMES = 2;

/**
 * Octave errors folded back: a voiced frame about an octave (or two) off the
 * median of the voiced frames within +-8 frames is moved onto that octave.
 * A bright vowel ("eee", strong 2nd harmonic) makes the tracker jump an
 * octave for a few frames; a sung octave leap held longer than the half
 * window keeps its pitch, because the median follows it.
 */
export function foldOctaveErrors(track: F0Track, voicingThreshold: number): Float32Array {
  const { hz, confidence } = track;
  const n = hz.length;
  const out = Float32Array.from(hz);
  const voiced = (t: number) => hz[t] > 0 && Number.isFinite(hz[t]) && confidence[t] >= Math.max(voicingThreshold, 1e-6);
  const near: number[] = [];
  for (let t = 0; t < n; t++) {
    if (!voiced(t)) continue;
    near.length = 0;
    for (let j = Math.max(0, t - FOLD_HALF_FRAMES); j <= Math.min(n - 1, t + FOLD_HALF_FRAMES); j++) if (voiced(j)) near.push(hzToMidi(hz[j]));
    near.sort((a, b) => a - b);
    const d = hzToMidi(hz[t]) - near[near.length >> 1];
    const k = Math.round(d / 12);
    if (k !== 0 && Math.abs(d - 12 * k) < 1) out[t] = hz[t] / 2 ** k;
  }
  return out;
}

/**
 * Join neighbouring notes of one semitone the DP split at a confidence dip:
 * a vowel change on a held pitch (ooo -> eee) lowers the tracker's
 * confidence for a few frames, which the DP reads as unvoiced and splits on.
 * A real break dips in loudness and stays split.
 */
export function joinHeldNotes(segs: readonly SegmentedNote[], track: F0Track): SegmentedNote[] {
  const { loudnessDb, hopSeconds } = track;
  const n = loudnessDb.length;
  const mean = (a: number, b: number) => {
    let sum = 0;
    for (let t = a; t < b; t++) sum += loudnessDb[t];
    return sum / Math.max(1, b - a);
  };
  const out: SegmentedNote[] = [];
  for (const seg of segs) {
    const prev = out[out.length - 1];
    if (prev && Math.floor(prev.mu + 0.5) === Math.floor(seg.mu + 0.5)
      && (seg.startFrame - prev.endFrame) * hopSeconds * 1000 <= JOIN_GAP_MS) {
      const floor = Math.min(mean(prev.startFrame, prev.endFrame), mean(seg.startFrame, seg.endFrame)) - JOIN_DIP_DB;
      let dip = false;
      for (let t = Math.max(0, prev.endFrame - JOIN_EDGE_FRAMES); t < Math.min(n, seg.startFrame + JOIN_EDGE_FRAMES); t++) {
        if (loudnessDb[t] < floor) dip = true;
      }
      if (!dip) {
        const a = prev.endFrame - prev.startFrame;
        const b = seg.endFrame - seg.startFrame;
        out[out.length - 1] = { startFrame: prev.startFrame, endFrame: seg.endFrame, mu: (prev.mu * a + seg.mu * b) / (a + b) };
        continue;
      }
    }
    out.push({ ...seg });
  }
  return out;
}

/**
 * Notes of a take: octave errors folded, DP, held notes joined, nearest
 * semitone, length and range filters, amplitude from loudness.
 */
export function segmentNotes(track: F0Track, s: SegmentSettings): VoiceNote[] {
  const hop = track.hopSeconds;
  const kept: { note: VoiceNote; level: number }[] = [];
  const folded: F0Track = { ...track, hz: foldOctaveErrors(track, s.voicingThreshold) };
  for (const seg of joinHeldNotes(segmentFrames(folded, s.pitchHoldMs, s.voicingThreshold), track)) {
    const pitchMidi = Math.floor(seg.mu + 0.5);
    const durationSeconds = (seg.endFrame - seg.startFrame) * hop;
    if (durationSeconds * 1000 < s.minNoteLengthMs) continue;
    if (pitchMidi < s.minMidiNote || pitchMidi > s.maxMidiNote) continue;
    let sum = 0;
    for (let t = seg.startFrame; t < seg.endFrame; t++) sum += 10 ** (track.loudnessDb[t] / 20);
    kept.push({
      note: { startTimeSeconds: seg.startFrame * hop, durationSeconds, pitchMidi, amplitude: 0 },
      level: sum / (seg.endFrame - seg.startFrame),
    });
  }
  const loudest = kept.reduce((max, k) => Math.max(max, k.level), 0);
  return kept.map(({ note, level }) => ({ ...note, amplitude: loudest > 0 ? level / loudest : 1 }));
}
