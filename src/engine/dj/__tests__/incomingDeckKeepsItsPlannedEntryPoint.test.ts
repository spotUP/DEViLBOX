/**
 * Auto DJ's incoming deck started at 0.0 s instead of the planned entry point
 * (live 2026-10-10: plan said 1.068 s; the seek landed at ~0.45 s after the
 * load and the deck sat at 0 by ~0.55 s), so the blend started off the grid.
 *
 * Cause: loading audio onto a deck fires the scratch-buffer priming, which
 * runs the player silently for ~150 ms and then seeks it back to 0. The
 * transition executor seeks the freshly loaded incoming deck to the planned
 * entry inside that window; priming's exit seek threw it away.
 *
 * Drives the real DeckEngine priming and the real DeckAudioPlayer transport
 * on stand-in objects (a real DeckEngine needs an AudioContext).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});

import { DeckEngine } from '../DeckEngine';
import { DeckAudioPlayer } from '../DeckAudioPlayer';

/** A DeckAudioPlayer whose transport methods are the real ones over a stub Tone.Player. */
function realTransport(): DeckAudioPlayer {
  const player = {
    state: 'stopped' as 'started' | 'stopped',
    fadeIn: 0, fadeOut: 0,
    _activeSources: new Set(),
    _state: { setStateAtTime: () => {} },
    buffer: { loaded: true },
    start() { this.state = 'started'; },
    stop() { this.state = 'stopped'; },
    seek() {},
  };
  return Object.assign(Object.create(DeckAudioPlayer.prototype), {
    player, _loaded: true, _duration: 180, _playbackRate: 1, _pendingOffset: null,
    _rateChangePos: 0, _rateChangeTime: 0, _rateTrackingActive: false,
    _seekCount: 0, _lastSeekTarget: 0, onRunningChange: null,
  }) as DeckAudioPlayer;
}

function deckWith(audioPlayer: DeckAudioPlayer): DeckEngine {
  const gain = { value: 1, cancelScheduledValues: () => {}, setValueAtTime: () => {} };
  return Object.assign(Object.create(DeckEngine.prototype), {
    audioPlayer,
    _playbackMode: 'audio',
    scratchBufferReady: true,
    channelGain: { gain },
    _primingScratchBuffer: false,
    _primingCancelRequested: false,
  }) as DeckEngine;
}

describe('the incoming deck keeps its planned entry point', () => {
  it('a seek made while the freshly loaded deck primes its scratch buffer is where the deck stays', async () => {
    const audio = realTransport();
    const deck = deckWith(audio);
    const priming = (deck as unknown as { _primeScratchBuffer(): Promise<void> })._primeScratchBuffer();
    // The executor seeks the incoming deck to the planned entry while priming holds the player.
    await new Promise((r) => setTimeout(r, 30));
    audio.seek(1.068);
    await priming;
    expect(audio.isCurrentlyPlaying()).toBe(false);
    expect(audio.getPosition()).toBeCloseTo(1.068, 6);
  });

  it('priming with no seek leaves the deck where it was', async () => {
    const audio = realTransport();
    audio.seek(12.5);
    const deck = deckWith(audio);
    await (deck as unknown as { _primeScratchBuffer(): Promise<void> })._primeScratchBuffer();
    expect(audio.getPosition()).toBeCloseTo(12.5, 6);
  });
});
