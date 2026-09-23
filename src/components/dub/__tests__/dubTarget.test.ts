import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveDubTarget,
  isDubTargetChannel,
  describeDubTarget,
  DUB_TARGET_TTL_MS,
  type DubTarget,
} from '../dubTarget';

/**
 * The deck used to stamp all nine per-channel ops onto every channel card —
 * 72 buttons on an eight-channel song. "we have all these per channel buttons
 * i have never seen a real mixing desk have that like that" (2026-09-23).
 *
 * A desk routes through the SENDS, and the ops that genuinely name a channel
 * act on the one your hand is on. These pin the resolution, because getting it
 * wrong means an op fires at the wrong channel or at none.
 */
const at = (channelId: number, touchedAtMs: number): DubTarget => ({ channelId, touchedAtMs });

describe('resolveDubTarget', () => {
  it('fires on every channel when no fader has been touched', () => {
    expect(resolveDubTarget(null, 4, 1000)).toEqual([0, 1, 2, 3]);
  });

  it('fires on exactly the channel whose fader was touched', () => {
    expect(resolveDubTarget(at(2, 1000), 8, 1000)).toEqual([2]);
  });

  it('falls back to all channels once the target goes stale', () => {
    const t = at(2, 0);
    expect(resolveDubTarget(t, 8, DUB_TARGET_TTL_MS - 1)).toEqual([2]);
    expect(resolveDubTarget(t, 8, DUB_TARGET_TTL_MS + 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('falls back to all channels when the pattern no longer has that channel', () => {
    // A song change can leave a target pointing past the end of the pattern.
    // Firing at a channel that is not there is worse than firing at all.
    expect(resolveDubTarget(at(9, 1000), 4, 1000)).toEqual([0, 1, 2, 3]);
    expect(resolveDubTarget(at(-1, 1000), 4, 1000)).toEqual([0, 1, 2, 3]);
  });

  it('is empty only when the pattern is', () => {
    expect(resolveDubTarget(null, 0, 1000)).toEqual([]);
    expect(resolveDubTarget(at(0, 1000), 0, 1000)).toEqual([]);
  });
});

describe('isDubTargetChannel', () => {
  it('marks the targeted strip and no other', () => {
    const t = at(3, 1000);
    expect(isDubTargetChannel(t, 3, 8, 1000)).toBe(true);
    expect(isDubTargetChannel(t, 4, 8, 1000)).toBe(false);
  });

  it('marks nothing when every channel is the target', () => {
    // "All channels" must not light all eight strips — that reads as eight
    // targets rather than none.
    for (let i = 0; i < 8; i++) expect(isDubTargetChannel(null, i, 8, 1000)).toBe(false);
  });
});

describe('describeDubTarget', () => {
  it('says what the op panel is about to do', () => {
    expect(describeDubTarget(null, 8, 1000)).toBe('All channels');
    expect(describeDubTarget(at(0, 1000), 8, 1000)).toBe('Channel 1');
    expect(describeDubTarget(at(7, 1000), 8, 1000)).toBe('Channel 8');
  });

  it('says so the moment the target expires, not after the next fire', () => {
    expect(describeDubTarget(at(1, 0), 8, DUB_TARGET_TTL_MS + 1)).toBe('All channels');
  });
});

/**
 * And the wiring: a channel strip carries no op buttons any more.
 *
 * This is the assertion that fails before the change and passes after. The op
 * buttons live once, in the shared panel.
 */
describe('the channel strip is a strip, not a rack', () => {
  const DECK = readFileSync(resolve(__dirname, '..', 'DubDeckStrip.tsx'), 'utf8');

  it('maps CHANNEL_OPS exactly once — in the op panel, not per channel', () => {
    const maps = (DECK.match(/CHANNEL_OPS\.map\(/g) ?? []).length;
    expect(maps, 'a second CHANNEL_OPS.map is a per-channel rack').toBe(1);
  });

  it('resolves the target rather than firing at a hardcoded channel list', () => {
    expect(DECK).toContain('resolveDubTarget');
  });

  it('shows which channel the ops will hit', () => {
    // Without this the target is invisible and aiming an op is a guess.
    expect(DECK).toContain('describeDubTarget');
    expect(DECK).toContain('isDubTargetChannel');
  });
});
