/**
 * Channel evidence — what the TRACKER knows about one channel over one pattern.
 *
 * Phase 1 of `thoughts/shared/plans/2026-09-22-channel-intelligence.md`. This
 * is the evidence layer, not a classifier: it answers "what is measurably
 * happening in these cells", and says nothing about instrument family, musical
 * function or dub targeting. Those are later phases and they consume this.
 *
 * Why a separate layer at all. The current pipeline collapses everything into
 * one `ChannelRole` per channel per song, and measurement on 2026-09-22 showed
 * what that costs: on jennipha.ahx the first heuristic in `classifyChannel`
 *
 *     avgOctave <= 2.5 && uniquePitchClasses <= 4 && avgInterval <= 7 -> bass
 *
 * fired in 35 of 40 channel-patterns, because AHX note numbering sits in
 * octaves 0-3. Every channel came back `bass`, so `riddimSection` — which mutes
 * melodic channels to leave bass and drums — had nothing to mute and fired as a
 * no-op. The same tune's per-pattern tally shows the channels are NOT one thing:
 *
 *     ch0: bass x11
 *     ch1: bass x8,  pad x3
 *     ch2: bass x10, empty x1
 *     ch3: bass x6,  chord x2, empty x3
 *
 * So evidence is gathered per PATTERN, never per song. A channel is a lane, not
 * an instrument, and the unit that can be honestly described is one channel's
 * behaviour inside one pattern.
 *
 * Everything here is a pure function of cells. No stores, no audio, no engine —
 * so it can be tested against real songs without a browser, and so the same
 * numbers can be computed offline for a validation corpus.
 */

import type { ChannelData, Pattern, TrackerCell } from '@typedefs/tracker';
import { detectSkankPattern } from './MusicAnalysis';

/** Notes 1..96 are playable; 97 is note-off and is not a pitch. */
const MIN_NOTE = 1;
const MAX_NOTE = 96;

/** Every note column a cell can carry, in column order. */
const NOTE_COLUMNS = ['note', 'note2', 'note3', 'note4'] as const;

export interface PitchEvidence {
  /** Lowest and highest sounding note, in tracker note numbers. */
  lowest: number;
  highest: number;
  /** Middle of the sounded range, not the mean — robust to one stray octave. */
  median: number;
  /** highest - lowest, in semitones. */
  range: number;
  /** Mean absolute semitone step between consecutive onsets. */
  avgInterval: number;
  /**
   * Share of consecutive intervals that are 2 semitones or less.
   *
   * Separates stepwise writing (basslines, arpeggios, skanks) from leaping
   * writing (melodies, stabs) far more directly than `avgInterval`, which one
   * octave jump can dominate.
   */
  stepwiseRatio: number;
  /** Share of consecutive intervals of 7 semitones or more. */
  leapRatio: number;
  /** Distinct pitch classes used (0-12). */
  uniquePitchClasses: number;
  /** Distinct octaves touched. */
  octaveSpread: number;
}

export interface RhythmEvidence {
  /** Onsets in this pattern, counting every note column. */
  onsetCount: number;
  /** Onsets per row. */
  density: number;
  /**
   * Share of onsets landing on the first half of each beat unit.
   *
   * `offbeatRatio` is its complement; both are reported because a reader
   * should not have to remember which way round the convention runs.
   */
  onbeatRatio: number;
  offbeatRatio: number;
  /** `detectSkankPattern`'s confidence that this is off-beat writing (0-1). */
  skankConfidence: number;
  /** Median rows between consecutive onsets. 0 when there are fewer than two. */
  medianInterOnset: number;
  /**
   * How regular the spacing is, 0-1.
   *
   * 1 means every gap between onsets is identical — a metronomic part. Low
   * values mean the part breathes or is played in bursts.
   */
  regularity: number;
  /** Rows from the first onset to the last, over the pattern length. */
  span: number;
}

export interface HarmonyEvidence {
  /** Largest number of notes sounding from one row. */
  maxPolyphony: number;
  /** Mean notes per row that has any. */
  avgPolyphony: number;
  /** True when no row ever carries more than one note. */
  monophonic: boolean;
  /** Rows carrying three or more simultaneous notes. */
  chordRows: number;
}

export interface SourceEvidence {
  /** Instrument numbers referenced, most used first. */
  instrumentIds: number[];
  /** Share of instrument-bearing cells using the most common instrument. */
  dominance: number;
  /** True when more than one instrument appears in this pattern. */
  instrumentChanges: boolean;
  /** Effect types present, ascending. Evidence of technique, not of identity. */
  effectTypes: number[];
}

export interface PatternFingerprint {
  channelIndex: number;
  patternIndex: number;
  /** Rows in the pattern this was measured over. */
  totalRows: number;
  /** True when the channel has no notes at all here. */
  silent: boolean;
  pitch: PitchEvidence | null;
  rhythm: RhythmEvidence;
  harmony: HarmonyEvidence;
  source: SourceEvidence;
}

/** Every sounding note in a cell, across all note columns. */
function notesInCell(cell: TrackerCell | undefined): number[] {
  if (!cell) return [];
  const out: number[] = [];
  for (const col of NOTE_COLUMNS) {
    const n = cell[col];
    if (typeof n === 'number' && n >= MIN_NOTE && n <= MAX_NOTE) out.push(n);
  }
  return out;
}

/** Effect types present in a cell, across the primary and secondary slots. */
function effectsInCell(cell: TrackerCell | undefined): number[] {
  if (!cell) return [];
  const out: number[] = [];
  if (cell.effTyp > 0) out.push(cell.effTyp);
  if (cell.effTyp2 > 0) out.push(cell.effTyp2);
  for (const k of ['effTyp3', 'effTyp4', 'effTyp5', 'effTyp6', 'effTyp7', 'effTyp8'] as const) {
    const t = cell[k];
    if (typeof t === 'number' && t > 0) out.push(t);
  }
  return out;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Beat unit for on/off-beat measurement.
 *
 * Tracker patterns are overwhelmingly written in powers of two, and a beat is
 * conventionally four rows at the default speed. Falling back to 4 keeps the
 * measure meaningful for the odd pattern length rather than returning nothing.
 */
function beatRows(totalRows: number): number {
  return totalRows % 4 === 0 ? 4 : Math.max(2, Math.round(totalRows / 16));
}

function pitchEvidence(notes: number[]): PitchEvidence | null {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort((a, b) => a - b);
  let intervalSum = 0;
  let stepwise = 0;
  let leaps = 0;
  for (let i = 1; i < notes.length; i++) {
    const d = Math.abs(notes[i] - notes[i - 1]);
    intervalSum += d;
    if (d <= 2) stepwise++;
    if (d >= 7) leaps++;
  }
  const gaps = Math.max(1, notes.length - 1);
  return {
    lowest: sorted[0],
    highest: sorted[sorted.length - 1],
    median: median(sorted),
    range: sorted[sorted.length - 1] - sorted[0],
    avgInterval: notes.length > 1 ? intervalSum / gaps : 0,
    stepwiseRatio: notes.length > 1 ? stepwise / gaps : 0,
    leapRatio: notes.length > 1 ? leaps / gaps : 0,
    uniquePitchClasses: new Set(notes.map(n => (n - 1) % 12)).size,
    octaveSpread: new Set(notes.map(n => Math.floor((n - 1) / 12))).size,
  };
}

function rhythmEvidence(onsetRows: number[], totalRows: number): RhythmEvidence {
  const empty: RhythmEvidence = {
    onsetCount: 0, density: 0, onbeatRatio: 0, offbeatRatio: 0,
    skankConfidence: 0, medianInterOnset: 0, regularity: 0, span: 0,
  };
  if (onsetRows.length === 0) return empty;

  const unit = beatRows(totalRows);
  let onbeat = 0;
  for (const row of onsetRows) {
    if (row % unit < unit / 2) onbeat++;
  }

  const gaps: number[] = [];
  for (let i = 1; i < onsetRows.length; i++) gaps.push(onsetRows[i] - onsetRows[i - 1]);
  const medGap = median([...gaps].sort((a, b) => a - b));
  // Regularity as 1 - (mean absolute deviation / median gap): every gap equal
  // gives 1, and a part played in bursts falls towards 0.
  let regularity = 0;
  if (gaps.length > 0 && medGap > 0) {
    const dev = gaps.reduce((s, g) => s + Math.abs(g - medGap), 0) / gaps.length;
    regularity = Math.max(0, 1 - dev / medGap);
  }

  return {
    onsetCount: onsetRows.length,
    density: onsetRows.length / Math.max(totalRows, 1),
    onbeatRatio: onbeat / onsetRows.length,
    offbeatRatio: 1 - onbeat / onsetRows.length,
    skankConfidence: detectSkankPattern(onsetRows, totalRows),
    medianInterOnset: medGap,
    regularity,
    span: (onsetRows[onsetRows.length - 1] - onsetRows[0]) / Math.max(totalRows, 1),
  };
}

/**
 * Measure one channel's behaviour inside one pattern.
 *
 * `patternIndex` is carried through untouched so a caller can key a timeline by
 * pattern instance rather than by absolute row — the plan's point about order
 * and pattern reuse depends on keeping that distinction.
 */
export function fingerprintChannelPattern(
  channel: ChannelData | undefined,
  channelIndex: number,
  patternIndex: number,
  totalRows: number,
): PatternFingerprint {
  const rows = channel?.rows ?? [];
  const notes: number[] = [];
  const onsetRows: number[] = [];
  const instrumentCounts = new Map<number, number>();
  const effectTypes = new Set<number>();
  let maxPolyphony = 0;
  let polyphonyRows = 0;
  let polyphonySum = 0;
  let chordRows = 0;

  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r];
    const cellNotes = notesInCell(cell);
    for (const e of effectsInCell(cell)) effectTypes.add(e);
    if (cell && cell.instrument > 0) {
      instrumentCounts.set(cell.instrument, (instrumentCounts.get(cell.instrument) ?? 0) + 1);
    }
    if (cellNotes.length === 0) continue;
    notes.push(...cellNotes);
    onsetRows.push(r);
    polyphonyRows++;
    polyphonySum += cellNotes.length;
    if (cellNotes.length > maxPolyphony) maxPolyphony = cellNotes.length;
    if (cellNotes.length >= 3) chordRows++;
  }

  const byUse = [...instrumentCounts.entries()].sort((a, b) => b[1] - a[1]);
  const instrumentCells = byUse.reduce((s, [, c]) => s + c, 0);

  return {
    channelIndex,
    patternIndex,
    totalRows,
    silent: notes.length === 0,
    pitch: pitchEvidence(notes),
    rhythm: rhythmEvidence(onsetRows, totalRows),
    harmony: {
      maxPolyphony,
      avgPolyphony: polyphonyRows > 0 ? polyphonySum / polyphonyRows : 0,
      monophonic: maxPolyphony <= 1,
      chordRows,
    },
    source: {
      instrumentIds: byUse.map(([id]) => id),
      dominance: instrumentCells > 0 ? byUse[0][1] / instrumentCells : 0,
      instrumentChanges: byUse.length > 1,
      effectTypes: [...effectTypes].sort((a, b) => a - b),
    },
  };
}

/** Fingerprint every channel of one pattern. */
export function fingerprintPattern(pattern: Pattern, patternIndex: number): PatternFingerprint[] {
  const channels = pattern?.channels ?? [];
  return channels.map((ch, i) => fingerprintChannelPattern(ch, i, patternIndex, pattern.length));
}

/**
 * Fingerprint a whole song, in ORDER, one entry per pattern instance.
 *
 * Walking the order rather than the pattern list matters: the same pattern
 * played at two points in the song is two instances, and a later phase decides
 * whether they carry the same musical identity. Collapsing them here would
 * throw away the distinction before anything could use it.
 */
export function fingerprintSong(
  patterns: Pattern[],
  order: number[],
): { orderIndex: number; patternIndex: number; channels: PatternFingerprint[] }[] {
  const out: { orderIndex: number; patternIndex: number; channels: PatternFingerprint[] }[] = [];
  for (let o = 0; o < order.length; o++) {
    const patternIndex = order[o];
    const pattern = patterns[patternIndex];
    if (!pattern) continue;
    out.push({ orderIndex: o, patternIndex, channels: fingerprintPattern(pattern, patternIndex) });
  }
  return out;
}
