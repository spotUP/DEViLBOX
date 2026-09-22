import { describe, it, expect } from 'vitest';
import {
  buildChannelSegments,
  segmentAtOrder,
  nextSegment,
} from '../channelSegments';
import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';

/**
 * A tracker channel is a lane, not an instrument. These assert the two failure
 * modes the plan names: a timeline so twitchy it is just the raw fingerprints
 * again, and one so blunt it averages a real change of part away.
 */

function cell(note = 0, instrument = 0): TrackerCell {
  return { note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** A channel playing `notes` at `step` intervals, all on `instrument`. */
function chan(notes: number[], instrument: number, length = 16, step = 4): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => cell());
  notes.forEach((n, i) => { const r = i * step; if (r < length) rows[r] = cell(n, instrument); });
  return {
    id: 'c', name: 'c', rows,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: instrument, color: null,
  };
}

/** A channel whose cells name several instruments, like a drum kit. */
function kit(pairs: [number, number][], length = 16, step = 4): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => cell());
  pairs.forEach(([note, inst], i) => { const r = i * step; if (r < length) rows[r] = cell(note, inst); });
  return {
    id: 'k', name: 'k', rows,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: null, color: null,
  };
}

const silent = () => chan([], 1);
const pattern = (channels: ChannelData[]): Pattern =>
  ({ id: `p${Math.random()}`, name: 'p', length: 16, channels });

describe('a stable channel is one segment', () => {
  it('does not split a channel that plays the same way throughout', () => {
    const p = pattern([chan([40, 40, 42, 40], 1)]);
    const segs = buildChannelSegments([p], [0, 0, 0, 0])[0];
    expect(segs).toHaveLength(1);
    expect(segs[0].startOrder).toBe(0);
    expect(segs[0].endOrder).toBe(3);
    expect(segs[0].boundary).toBe('song-start');
  });

  it('does not split a drum kit because a different piece dominates', () => {
    // The measured failure: on jennipha.ahx channel 0 the most-used instrument
    // alternates 3,1,2 / 1,3,2 / 3,7,2 / 7,3,2 across eleven positions while the
    // channel plays one kit throughout. Keying on the top member gave eleven
    // segments for a channel that never changes what it is.
    const a = pattern([kit([[40, 3], [40, 1], [42, 3], [40, 2]])]);
    const b = pattern([kit([[40, 1], [40, 3], [42, 2], [40, 3]])]);
    const c = pattern([kit([[40, 3], [40, 7], [42, 2], [40, 3]])]);
    const segs = buildChannelSegments([a, b, c], [0, 1, 2, 1, 0])[0];
    expect(segs).toHaveLength(1);
  });
});

describe('structural boundaries are trusted immediately', () => {
  it('opens a segment when a channel enters', () => {
    const quiet = pattern([silent()]);
    const playing = pattern([chan([40, 40, 40, 40], 1)]);
    const segs = buildChannelSegments([quiet, playing], [0, 0, 1, 1])[0];
    expect(segs.map(s => s.boundary)).toEqual(['song-start', 'entry']);
    expect(segs[0].silent).toBe(true);
    expect(segs[0].summary).toBeNull();
    expect(segs[1].startOrder).toBe(2);
  });

  it('opens a segment when a channel drops out', () => {
    const quiet = pattern([silent()]);
    const playing = pattern([chan([40, 40, 40, 40], 1)]);
    const segs = buildChannelSegments([playing, quiet], [0, 0, 1, 1])[0];
    expect(segs.map(s => s.boundary)).toEqual(['song-start', 'exit']);
    expect(segs[1].silent).toBe(true);
  });

  it('opens a segment when the instruments share nothing', () => {
    const bassish = pattern([chan([20, 20, 22, 20], 1)]);
    const other = pattern([chan([20, 20, 22, 20], 9)]);
    const segs = buildChannelSegments([bassish, other], [0, 0, 1, 1])[0];
    expect(segs).toHaveLength(2);
    expect(segs[1].boundary).toBe('instrument-change');
    expect(segs[1].summary?.instrumentIds).toEqual([9]);
  });
});

describe('behavioural boundaries need to persist', () => {
  it('ignores a single pattern that differs — a fill is not a new part', () => {
    const groove = pattern([chan([40, 40, 42, 40], 1)]);
    // Same instrument, two octaves up: a big change, but only for one position.
    const fill = pattern([chan([64, 64, 66, 64], 1)]);
    const segs = buildChannelSegments([groove, fill], [0, 0, 1, 0, 0])[0];
    expect(segs).toHaveLength(1);
  });

  it('opens a segment when the change persists', () => {
    const groove = pattern([chan([40, 40, 42, 40], 1)]);
    const higher = pattern([chan([64, 64, 66, 64], 1)]);
    const segs = buildChannelSegments([groove, higher], [0, 0, 1, 1, 1])[0];
    expect(segs).toHaveLength(2);
    expect(segs[1].boundary).toBe('behaviour-change');
    // The change began where it first differed, not where it was confirmed.
    expect(segs[1].startOrder).toBe(2);
  });

  it('measures against the segment opening, not the previous position', () => {
    // Comparing to the previous position lets a part drift arbitrarily far in
    // small steps without ever opening a segment.
    const p40 = pattern([chan([40, 40, 40, 40], 1)]);
    const p44 = pattern([chan([44, 44, 44, 44], 1)]);
    const p48 = pattern([chan([48, 48, 48, 48], 1)]);
    const segs = buildChannelSegments([p40, p44, p48], [0, 1, 2, 2])[0];
    // 40 -> 44 is under the threshold; 40 -> 48 is over it, and it persists.
    expect(segs.length).toBeGreaterThan(1);
  });
});

describe('order positions, not pattern indices', () => {
  it('keeps a repeated pattern as separate positions', () => {
    const p = pattern([chan([40, 40, 42, 40], 1)]);
    const segs = buildChannelSegments([p], [0, 0, 0])[0];
    expect(segs[0].patternIndices).toEqual([0, 0, 0]);
    expect(segs[0].endOrder).toBe(2);
  });
});

describe('look-up', () => {
  const quiet = pattern([silent()]);
  const playing = pattern([chan([40, 40, 40, 40], 1)]);
  const segs = buildChannelSegments([quiet, playing], [0, 0, 1, 1])[0];

  it('finds the segment covering a position', () => {
    expect(segmentAtOrder(segs, 0)?.silent).toBe(true);
    expect(segmentAtOrder(segs, 3)?.silent).toBe(false);
    expect(segmentAtOrder(segs, 99)).toBeNull();
  });

  it('looks ahead to what the channel becomes next', () => {
    const next = nextSegment(segs, 0);
    expect(next?.boundary).toBe('entry');
    // Nothing follows the last segment.
    expect(nextSegment(segs, 3)).toBeNull();
  });
});
