/**
 * Smart Sort weighs a key by how sure it is (owner juggling plan section 31;
 * audit 2026-10-11 DJ1 (g)): two confident clashing keys cost the full clash
 * penalty, a clash between uncertain readings costs about what an unknown key
 * costs, and a key with no recorded confidence counts as unknown - the same
 * weighting the transition planner's harmonic rule uses.
 */
import { describe, it, expect } from 'vitest';
import { keyTerm } from '../DJPlaylistSort';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import type { DJTrackSummary } from '../autodj/types';

const track = (key: string | undefined, keyConfidence?: number): PlaylistTrack => ({
  id: `${key}-${keyConfidence}`, fileName: 'x', trackName: 'x', format: 'WAV', bpm: 125, duration: 300, addedAt: 0, musicalKey: key,
  djSummary: keyConfidence === undefined ? undefined : ({ keyConfidence } as unknown as DJTrackSummary),
});

describe('Smart Sort key term', () => {
  it('a clash between two sure keys costs the clash penalty; between two unsure readings about the unknown penalty', () => {
    const sure = keyTerm(track('A minor', 1), track('D# minor', 1));
    const unsure = keyTerm(track('A minor', 0.05), track('D# minor', 0.05));
    const unknown = keyTerm(track('A minor', 1), track(undefined));
    expect(sure).toBeCloseTo(50, 6);
    expect(Math.abs(unsure - unknown)).toBeLessThan(5);
  });

  it('a key with no recorded confidence counts as unknown', () => {
    expect(keyTerm(track('A minor'), track('D# minor'))).toBe(keyTerm(track('A minor', 1), track(undefined)));
  });

  it('a sure perfect match keeps its reward', () => {
    expect(keyTerm(track('A minor', 1), track('A minor', 1))).toBeCloseTo(-20, 6);
  });
});
