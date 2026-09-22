import { describe, it, expect, beforeEach } from 'vitest';
import { useMixerStore } from '../useMixerStore';

/**
 * The Dub Deck opening with faders already up.
 *
 * Reported 2026-09-22: loading jennipha.ahx into a session and opening the Dub
 * Deck — before pressing play — showed 45% / 25% / 43% / 25% on channels
 * nobody had touched.
 *
 * A dub send is a fader position on the desk for ONE song, but nothing reset
 * them when a new module loaded, so they carried over. And because sends are
 * written back into the store from the audio graph by the mixer's ratchet,
 * what carried over was frequently not a position anyone chose at all — it was
 * the residue of a move that rode the fader and stopped somewhere.
 *
 * A dub producer starts with the sends down and brings them up.
 */

beforeEach(() => {
  const m = useMixerStore.getState();
  for (let i = 0; i < 4; i++) m.setChannelDubSend(i, 0);
});

describe('resetting the dub sends', () => {
  it('puts every channel back to zero', () => {
    const m = useMixerStore.getState();
    m.setChannelDubSend(0, 0.45);
    m.setChannelDubSend(1, 0.25);
    m.setChannelDubSend(2, 0.43);
    // The ratchet defers store writes; force them out before asserting.
    useMixerStore.getState().resetDubSends();
    const channels = useMixerStore.getState().channels;
    expect(channels.slice(0, 4).every(c => (c.dubSend ?? 0) === 0)).toBe(true);
  });

  it('leaves the rest of the channel alone', () => {
    // Set through the snapshot path, which applies synchronously — the
    // per-control setters are ratcheted and would not have landed yet.
    useMixerStore.getState().loadMixerState({
      channels: [{ volume: 0.8, pan: -0.5, muted: true, dubSend: 0.9 }],
    });
    useMixerStore.getState().resetDubSends();
    const ch = useMixerStore.getState().channels[0];
    expect(ch.dubSend).toBe(0);
    expect(ch.volume).toBeCloseTo(0.8, 5);
    expect(ch.pan).toBeCloseTo(-0.5, 5);
    expect(ch.muted).toBe(true);
  });

  it('is safe to call when nothing was ever sent', () => {
    expect(() => useMixerStore.getState().resetDubSends()).not.toThrow();
    expect(useMixerStore.getState().channels[0].dubSend ?? 0).toBe(0);
  });
});

describe('a saved project still wins', () => {
  it('loadMixerState can put sends back after a reset', () => {
    // The .dbx path restores positions the user DID choose; the reset must not
    // make those unreachable.
    useMixerStore.getState().resetDubSends();
    useMixerStore.getState().loadMixerState({ channels: [{ dubSend: 0.7 }] });
    expect(useMixerStore.getState().channels[0].dubSend).toBeCloseTo(0.7, 5);
  });
});
