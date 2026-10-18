/**
 * Mute wins over solo (owner decision, 2026-10-18).
 *
 * The mixer read `isSoloing ? !soloed : muted`, so a channel that was both
 * muted and soloed kept playing: the mute button did nothing while a solo was
 * active. The pattern grid already dimmed that channel, so the screen and the
 * speakers disagreed. Every engine path (the bitmask the native engines get,
 * the Tone channel mute, the gain engines) now reads one rule.
 */
import { describe, it, expect } from 'vitest';
import { mixerAudibleMask } from '@/stores/useMixerStore';
import { isChannelSilenced } from '@/lib/tracker/channelDim';

describe('mute wins over solo', () => {
  it('a muted + soloed channel is silent', () => {
    expect(isChannelSilenced(true, true, true)).toBe(true);
  });

  it('the engine mute mask drops a channel that is muted and soloed', () => {
    const channels = [
      { muted: true, soloed: true },   // ch0: muted + soloed -> silent
      { muted: false, soloed: false }, // ch1: not soloed while a solo is on -> silent
      { muted: false, soloed: true },  // ch2: soloed -> audible
    ];
    expect(mixerAudibleMask(channels, true)).toBe(0b100);
  });

  it('without a solo, only the mute decides', () => {
    const channels = [{ muted: true, soloed: false }, { muted: false, soloed: false }];
    expect(mixerAudibleMask(channels, false)).toBe(0b10);
  });
});
