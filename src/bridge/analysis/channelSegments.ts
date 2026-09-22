/**
 * Channel segments — where a channel's behaviour changes during the song.
 *
 * Phase 4 of `thoughts/shared/plans/2026-09-22-channel-intelligence.md`. A
 * tracker channel is a lane, not an instrument: it can carry a bassline for
 * sixteen bars, a vocal chop for eight, and a horn stab after that. A single
 * permanent `ChannelRole` cannot express any of it.
 *
 * The corpus says so directly. Per-pattern readings for jennipha.ahx:
 *
 *     ch0: bass x11
 *     ch1: bass x8,  pad x3
 *     ch2: bass x10, empty x1
 *     ch3: bass x6,  chord x2, empty x3
 *
 * This groups the per-pattern evidence from `channelEvidence.ts` into runs of
 * stable behaviour, so a caller can ask what a channel is doing NOW and what it
 * will do next, rather than what it does on average.
 *
 * Related but different from `SongRoleTimeline.ts`, which records where a
 * channel's CED instrument TYPE changes. That one needs CED and answers "what
 * instrument"; this one needs only the pattern data and answers "what
 * behaviour". A channel can keep its instrument and change what it plays — a
 * piano going from offbeat chords to a single-note melody is the case the plan
 * calls out, and only this layer sees it.
 *
 * Evidence in, evidence out. No roles, no dub targeting: those consume this.
 */

import type { Pattern } from '@typedefs/tracker';
import type { InstrumentConfig } from '@typedefs/instrument';
import { fingerprintSong, type PatternFingerprint } from './channelEvidence';
import { classifyChannelWithInstruments } from './ChannelNaming';
import type { ChannelRole, ChannelSongContext } from './MusicAnalysis';

/** Why a segment began. Hard boundaries are structural and trusted at once. */
export type SegmentBoundary =
  | 'song-start'
  | 'entry'              // channel was silent and started playing
  | 'exit'               // channel stopped playing
  | 'instrument-change'  // the dominant instrument changed
  | 'behaviour-change';  // same instrument, different playing

export interface SegmentSummary {
  /** Median of the per-pattern medians across the segment. */
  medianNote: number;
  /** Mean note density across the segment. */
  density: number;
  /** Mean share of onsets falling off the beat. */
  offbeatRatio: number;
  /** Mean share of stepwise motion. */
  stepwiseRatio: number;
  /** Largest polyphony seen anywhere in the segment. */
  maxPolyphony: number;
  /** Instruments used, most frequent first. */
  instrumentIds: number[];
}

export interface ChannelSegment {
  channelIndex: number;
  /** Inclusive range of ORDER positions, not pattern indices. */
  startOrder: number;
  endOrder: number;
  /** The patterns played across that range, in order, with repeats. */
  patternIndices: number[];
  silent: boolean;
  boundary: SegmentBoundary;
  summary: SegmentSummary | null;
  /**
   * What this channel is during THIS stretch of the song.
   *
   * Voted across the segment's own patterns rather than the whole song, which
   * is the entire point: a channel that plays bass for eight positions and a
   * pad for three has two answers, and the song-wide vote can only report the
   * winner. Null when no instrument lookup was supplied or the segment is
   * silent.
   */
  role: ChannelRole | null;
}

/**
 * How much behaviour must change, and for how long, before it is a new segment.
 *
 * Two knobs, for the two failure modes. Too sensitive and the timeline becomes
 * one segment per pattern, which is just the raw fingerprints with extra steps
 * and makes a performer behave erratically — the plan's "bass, bass, unknown,
 * bass, lead" problem. Too blunt and a genuine change of part is averaged away.
 *
 * The distance thresholds are per-axis rather than a single combined number so
 * that a change in ONE dimension is enough: a part that keeps its register and
 * density but moves from the downbeat to the offbeat has become a different
 * part, and a Euclidean distance over everything would dilute that.
 */
const CHANGE = {
  /** Semitones of median movement that counts as a register change. */
  medianNote: 7,
  /** Absolute change in notes-per-row. */
  density: 0.2,
  /** Absolute change in the off-beat share. */
  offbeatRatio: 0.35,
  /** Absolute change in the stepwise share. */
  stepwiseRatio: 0.45,
};

/**
 * Order positions a behaviour change must persist for before it opens a
 * segment.
 *
 * One pattern of difference is a fill, a turnaround, or a bar of silence. Two
 * in a row is the part having changed. Structural boundaries — entry, exit, a
 * new instrument — skip this entirely, because the tracker has told us
 * outright rather than us inferring it.
 */
const HYSTERESIS = 2;

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function summarise(fps: PatternFingerprint[]): SegmentSummary | null {
  const sounding = fps.filter(f => !f.silent && f.pitch);
  if (sounding.length === 0) return null;
  const counts = new Map<number, number>();
  for (const f of fps) {
    for (const id of f.source.instrumentIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    medianNote: medianOf(sounding.map(f => f.pitch!.median)),
    density: mean(sounding.map(f => f.rhythm.density)),
    offbeatRatio: mean(sounding.map(f => f.rhythm.offbeatRatio)),
    stepwiseRatio: mean(sounding.map(f => f.pitch!.stepwiseRatio)),
    maxPolyphony: Math.max(...sounding.map(f => f.harmony.maxPolyphony)),
    instrumentIds: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
  };
}

/**
 * Whether two positions are playing a different SET of instruments.
 *
 * Not "is the most-used instrument the same". A drum channel cycles a kit, and
 * which member happens to dominate moves pattern to pattern: measured on
 * jennipha.ahx channel 0, the top instrument alternates 3,1,2 / 1,3,2 / 3,7,2 /
 * 7,3,2 across eleven positions while the channel plays one kit the whole way
 * through. Keying on the top member produced eleven segments for a channel that
 * never changes what it is — the "too twitchy" failure the plan warns about,
 * where the performer sees bass, unknown, bass, lead and behaves erratically.
 *
 * Disjoint sets are a real change: nothing carried over. Overlapping sets are
 * the same material rearranged.
 */
function instrumentsChanged(prev: PatternFingerprint, cur: PatternFingerprint): boolean {
  const a = prev.source.instrumentIds;
  const b = cur.source.instrumentIds;
  if (a.length === 0 || b.length === 0) return false;   // nothing to compare
  const setB = new Set(b);
  return !a.some(id => setB.has(id));
}

/** True when two sounding fingerprints describe meaningfully different playing. */
function behaviourDiffers(a: PatternFingerprint, b: PatternFingerprint): boolean {
  if (!a.pitch || !b.pitch) return false;
  if (Math.abs(a.pitch.median - b.pitch.median) >= CHANGE.medianNote) return true;
  if (Math.abs(a.rhythm.density - b.rhythm.density) >= CHANGE.density) return true;
  if (Math.abs(a.rhythm.offbeatRatio - b.rhythm.offbeatRatio) >= CHANGE.offbeatRatio) return true;
  if (Math.abs(a.pitch.stepwiseRatio - b.pitch.stepwiseRatio) >= CHANGE.stepwiseRatio) return true;
  return false;
}

/**
 * Segment one channel across the song.
 *
 * `perOrder` is that channel's fingerprint at each order position, in play
 * order — so a pattern played three times contributes three entries and can
 * belong to three different segments.
 */
export function segmentChannel(
  channelIndex: number,
  perOrder: { orderIndex: number; patternIndex: number; fp: PatternFingerprint }[],
): ChannelSegment[] {
  const segments: ChannelSegment[] = [];
  if (perOrder.length === 0) return segments;

  let start = 0;
  let boundary: SegmentBoundary = 'song-start';
  /** Consecutive positions that differ from the segment's opening behaviour. */
  let pendingDiff = 0;

  const close = (endIdx: number, nextBoundary: SegmentBoundary) => {
    const span = perOrder.slice(start, endIdx + 1);
    const fps = span.map(s => s.fp);
    segments.push({
      channelIndex,
      startOrder: span[0].orderIndex,
      endOrder: span[span.length - 1].orderIndex,
      patternIndices: span.map(s => s.patternIndex),
      silent: fps.every(f => f.silent),
      boundary,
      summary: summarise(fps),
      role: null,
    });
    start = endIdx + 1;
    boundary = nextBoundary;
    pendingDiff = 0;
  };

  for (let i = 1; i < perOrder.length; i++) {
    const prev = perOrder[i - 1].fp;
    const cur = perOrder[i].fp;

    // Structural boundaries. The tracker states these outright, so they take
    // effect immediately rather than accumulating evidence.
    if (prev.silent !== cur.silent) {
      close(i - 1, cur.silent ? 'exit' : 'entry');
      continue;
    }
    if (instrumentsChanged(prev, cur)) {
      close(i - 1, 'instrument-change');
      continue;
    }

    // Behavioural boundaries, measured against the position that OPENED the
    // segment rather than against the previous one. Comparing to the previous
    // position lets a part drift arbitrarily far in small steps without ever
    // opening a segment.
    if (cur.silent) { pendingDiff = 0; continue; }
    if (behaviourDiffers(perOrder[start].fp, cur)) {
      pendingDiff++;
      if (pendingDiff >= HYSTERESIS) {
        // The change began at the first differing position, not here.
        close(i - pendingDiff, 'behaviour-change');
      }
    } else {
      pendingDiff = 0;
    }
  }

  close(perOrder.length - 1, 'song-start');
  return segments;
}

/** Segment every channel of a song. Index of the outer array is the channel. */
export function buildChannelSegments(
  patterns: Pattern[],
  order: number[],
  instruments?: Map<number, InstrumentConfig>,
): ChannelSegment[][] {
  const song = fingerprintSong(patterns, order);
  const channelCount = patterns[0]?.channels?.length ?? 0;

  // The song's register floor, so a segment role asks the same relative
  // question `classifySongChannels` does rather than an absolute one.
  const ctx: ChannelSongContext | undefined = (() => {
    const medians: number[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const notes: number[] = [];
      for (const p of patterns) {
        for (const cell of p.channels?.[ch]?.rows ?? []) {
          if (cell && cell.note >= 1 && cell.note <= 96) notes.push(cell.note);
        }
      }
      if (notes.length === 0) continue;
      notes.sort((a, b) => a - b);
      const mid = notes.length >> 1;
      medians.push(notes.length % 2 ? notes[mid] : (notes[mid - 1] + notes[mid]) / 2);
    }
    return medians.length > 1 ? { songLowestMedian: Math.min(...medians) } : undefined;
  })();

  const out: ChannelSegment[][] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const perOrder = song
      .map(entry => ({
        orderIndex: entry.orderIndex,
        patternIndex: entry.patternIndex,
        fp: entry.channels.find(c => c.channelIndex === ch),
      }))
      .filter((e): e is { orderIndex: number; patternIndex: number; fp: PatternFingerprint } => !!e.fp);
    const segments = segmentChannel(ch, perOrder);
    if (instruments) {
      for (const seg of segments) {
        seg.role = seg.silent
          ? null
          : roleForSegment(ch, patterns, seg.patternIndices, instruments, ctx);
      }
    }
    out.push(segments);
  }
  return out;
}

/**
 * The role for one segment, voted across the patterns it actually spans.
 *
 * Uses the same classifier the rest of the system uses, so a segment role and a
 * song role cannot disagree about method — only about scope.
 */
function roleForSegment(
  channelIndex: number,
  patterns: Pattern[],
  patternIndices: number[],
  instruments: Map<number, InstrumentConfig>,
  ctx: ChannelSongContext | undefined,
): ChannelRole | null {
  const votes = new Map<ChannelRole, number>();
  for (const pi of patternIndices) {
    const ch = patterns[pi]?.channels?.[channelIndex];
    if (!ch) continue;
    const r = classifyChannelWithInstruments(ch, channelIndex, instruments, ctx).role;
    if (r === 'empty') continue;
    votes.set(r, (votes.get(r) ?? 0) + 1);
  }
  let best: ChannelRole | null = null;
  let bestCount = 0;
  for (const [role, count] of votes) {
    if (count > bestCount) { bestCount = count; best = role; }
  }
  return best;
}

/** The segment covering an order position, or null when the channel has none. */
export function segmentAtOrder(
  segments: readonly ChannelSegment[],
  orderIndex: number,
): ChannelSegment | null {
  for (const s of segments) {
    if (orderIndex >= s.startOrder && orderIndex <= s.endOrder) return s;
  }
  return null;
}

/** The segment after the one covering `orderIndex`, for anticipation. */
export function nextSegment(
  segments: readonly ChannelSegment[],
  orderIndex: number,
): ChannelSegment | null {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (orderIndex >= s.startOrder && orderIndex <= s.endOrder) return segments[i + 1] ?? null;
  }
  return null;
}
