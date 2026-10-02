/**
 * Version Drop and the deck must agree on what each channel is.
 *
 * The deck labelled the strips lead / chords / skank from Auto Dub's merged
 * roles, while Version Drop profiled the CURRENT pattern's notes alone. On a
 * song whose current pattern carried no evidence it said "nothing to drop —
 * every channel reads as riddim" (owner, 2026-10-02). And the profile cache,
 * keyed without the evidence, kept that empty answer for as long as the
 * pattern stayed loaded.
 */
import { describe, it, expect } from 'vitest';
import { getChannelProfiles } from '../channelProfiles';
import { planDrop, droppedChannels } from '@/lib/dub/arrangementIntelligence';
import type { Pattern } from '@/types/tracker';

/** A pattern with no notes in it: no evidence of its own. */
function emptyPattern(id: string, channels = 4): Pattern {
  return {
    id,
    channels: Array.from({ length: channels }, () => ({ name: null, rows: Array.from({ length: 64 }, () => ({ note: 0 })) })),
  } as unknown as Pattern;
}

describe('channel profiles take the song-wide roles', () => {
  it('a channel the deck calls lead is melody, not unknown', () => {
    const profiles = getChannelProfiles(emptyPattern('a'), [], 4, 16, undefined, ['lead', 'chord', 'skank', 'bass']);
    expect(profiles.get(0)?.musicalFunction.value).toBe('melody');
    expect(profiles.get(1)?.musicalFunction.value).toBe('harmony');
    expect(profiles.get(3)?.musicalFunction.value).toBe('foundation');
    expect(profiles.get(0)?.musicalFunction.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('Version Drop takes the arrangement and keeps the bass', () => {
    const profiles = getChannelProfiles(emptyPattern('b'), [], 4, 16, undefined, ['lead', 'chord', 'skank', 'bass']);
    const taking = droppedChannels(planDrop(profiles)).map(p => p.channel);
    expect(taking.length).toBeGreaterThan(0);
    expect(taking).not.toContain(3);
  });

  it('roles that arrive after the first call are not hidden by the cache', () => {
    const pattern = emptyPattern('c');
    const before = getChannelProfiles(pattern, [], 4, 16, undefined, []);
    expect(before.get(0)?.musicalFunction.value).toBe('unknown');
    const after = getChannelProfiles(pattern, [], 4, 16, undefined, ['lead', 'chord', 'skank', 'bass']);
    expect(after.get(0)?.musicalFunction.value).toBe('melody');
  });
});
