import { describe, it, expect } from 'vitest';
import { classifyChannel } from '../MusicAnalysis';
import { classifySongRoles } from '../ChannelNaming';
import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';

/**
 * `bass` is a statement about a channel's place in an ARRANGEMENT, not about an
 * absolute octave.
 *
 * The heuristic was tuned on formats whose note numbering starts an octave or
 * two higher than the chip formats. Measured 2026-09-22 on jennipha.ahx, the
 * first rule — `avgOctave <= 2.5 && uniquePitchClasses <= 4 && avgInterval <= 7`
 * — fired in 35 of 40 channel-patterns and every channel came back `bass`. The
 * four channel medians are 25, 34, 10 and 29: one of those is the bassline and
 * the one at 34 sits two octaves above it.
 *
 * With the song's lowest median supplied, the rule asks the only question that
 * matters — is this channel at the bottom of THIS song.
 */

function cell(note = 0, instrument = 0): TrackerCell {
  return { note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** A channel playing `notes` in order, one every `step` rows. */
function channel(notes: number[], length = 64, step = 4): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => cell());
  notes.forEach((n, i) => { const r = i * step; if (r < length) rows[r] = cell(n, 1); });
  return {
    id: 'c', name: 'c', rows,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: 1, color: null,
  };
}

describe('classifyChannel — register is relative to the song', () => {
  const lowStepwise = [25, 25, 27, 25, 25, 27, 25, 25];

  it('keeps calling a low stepwise part bass when no context is given', () => {
    // Backwards compatibility: every existing caller passes no context and must
    // see exactly what it saw before.
    const r = classifyChannel(0, lowStepwise, 64);
    expect(r.role).toBe('bass');
  });

  it('still calls it bass when it IS the lowest channel', () => {
    const r = classifyChannel(0, lowStepwise, 64, { songLowestMedian: 25 });
    expect(r.role).toBe('bass');
  });

  it('allows an octave of headroom, so a doubled bassline still reads as bass', () => {
    // A tune doubling its bass an octave up has two bass channels, not one bass
    // and one mystery.
    const r = classifyChannel(0, lowStepwise, 64, { songLowestMedian: 13 });
    expect(r.role).toBe('bass');
  });

  it('refuses bass for a channel two octaves above the song floor', () => {
    // jennipha channel 1: median 34 against a song floor of 10.
    const r = classifyChannel(0, lowStepwise, 64, { songLowestMedian: 1 });
    expect(r.role).not.toBe('bass');
  });

  it('applies the same question to the octave fallback', () => {
    // The default branch classified by absolute octave too, so a part that fell
    // through every rule still landed on `bass` regardless of the arrangement.
    const wide = [20, 34, 22, 36, 21, 35, 23, 37, 20, 33];
    expect(classifyChannel(0, wide, 64, { songLowestMedian: 20 }).role)
      .not.toBe('lead');            // sanity: it is not automatically lead either
    expect(classifyChannel(0, wide, 64, { songLowestMedian: 1 }).role)
      .not.toBe('bass');
  });
});

describe('classifySongRoles — the song supplies its own floor', () => {
  function song(channels: number[][]): Pattern[] {
    return [{
      id: 'p0', name: 'p0', length: 64,
      channels: channels.map(notes => channel(notes)),
    }];
  }

  it('does not label every channel bass just because the format numbers notes low', () => {
    // Four chip-register channels: one genuinely at the bottom, three above it.
    const roles = classifySongRoles(song([
      [10, 10, 12, 10, 10, 12, 10, 10],   // the bass
      [34, 34, 36, 34, 34, 36, 34, 34],   // two octaves up
      [29, 29, 31, 29, 29, 31, 29, 29],
      [25, 25, 27, 25, 25, 27, 25, 25],
    ]), new Map());
    expect(roles[0]).toBe('bass');
    expect(roles.filter(r => r === 'bass')).toHaveLength(1);
  });

  it('leaves a single-channel song alone', () => {
    // One sounding channel cannot be high or low relative to anything, so the
    // absolute rule stands rather than the floor being its own median.
    const roles = classifySongRoles(song([[25, 25, 27, 25, 25, 27, 25, 25]]), new Map());
    expect(roles[0]).toBe('bass');
  });
});
