import { describe, it, expect } from 'vitest';
import { resolveChannelName, resolveChannelNames } from '../channelNames';

/**
 * DEViLBOX holds two competing names per channel and the Dub Deck was reading
 * the wrong one.
 *
 * Measured 2026-09-22 on amanda.ahx: `get_channel_roles` reported
 * `Bass 1, Kick, Chords, Bass 2` from the tracker store, while
 * `get_mixer_state` reported `CH 1, CH 2, CH 3, CH 4`. The deck showed the
 * placeholders — and `versionDrop` passed them into the channel profile as the
 * instrument-name evidence, so the profile was told every channel is called
 * "CH 1".
 */

describe('resolving a channel name', () => {
  it('prefers a real mixer name, because a user typed it', () => {
    expect(resolveChannelName('My Bass', 'Kick', 0)).toBe('My Bass');
  });

  it('falls back to the tracker name when the mixer holds a placeholder', () => {
    expect(resolveChannelName('CH 1', 'Kick', 0)).toBe('Kick');
    expect(resolveChannelName('CH 12', 'Chords', 11)).toBe('Chords');
  });

  it('treats the other placeholder spellings as placeholders too', () => {
    // `isGenericChannelName` knows `Channel 3` and `CH3` as well as `CH 3`.
    expect(resolveChannelName('Channel 3', 'Snare', 2)).toBe('Snare');
    expect(resolveChannelName('CH3', 'Snare', 2)).toBe('Snare');
  });

  it('keeps a placeholder when neither source says anything better', () => {
    expect(resolveChannelName('CH 1', 'CH 1', 0)).toBe('CH 1');
    expect(resolveChannelName(null, null, 0)).toBe('CH 1');
    expect(resolveChannelName(undefined, undefined, 7)).toBe('CH 8');
  });

  it('uses the tracker name when the mixer has none at all', () => {
    expect(resolveChannelName(null, 'Sub Bass', 0)).toBe('Sub Bass');
  });
});

describe('resolving a whole mixer', () => {
  it('maps the measured amanda.ahx case', () => {
    const mixer = ['CH 1', 'CH 2', 'CH 3', 'CH 4', 'CH 5'];
    const tracker = ['Bass 1', 'Kick', 'Chords', 'Bass 2'];
    expect(resolveChannelNames(mixer, tracker))
      .toEqual(['Bass 1', 'Kick', 'Chords', 'Bass 2', 'CH 5']);
  });

  it('follows the mixer length, so extra mixer channels keep placeholders', () => {
    expect(resolveChannelNames(['CH 1', 'CH 2'], ['Kick'])).toEqual(['Kick', 'CH 2']);
  });
});
