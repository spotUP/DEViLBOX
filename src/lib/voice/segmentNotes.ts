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
 * the result equals music.py), then MIDI = nearest semitone, length and range
 * filters, and amplitude from loudness.
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

/** Notes of a take: DP, nearest semitone, length and range filters, amplitude from loudness. */
export function segmentNotes(track: F0Track, s: SegmentSettings): VoiceNote[] {
  const hop = track.hopSeconds;
  const kept: { note: VoiceNote; level: number }[] = [];
  for (const seg of segmentFrames(track, s.pitchHoldMs, s.voicingThreshold)) {
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
