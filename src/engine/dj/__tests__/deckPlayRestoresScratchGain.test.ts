/**
 * A scratch drops deckGain to 0 on every backward phase. Owner 2026-11-27:
 * "Sync on left deck ... silent when faded to; scratch brings it alive": a deck
 * left at gain 0 by a scratch played silent, and a pattern scratch kept looping
 * (and gating the gain) on a stopped deck. stop() now ends the pattern scratch
 * and play() puts deckGain back to its rest (trim) value.
 *
 * Drives the real DeckEngine methods on a stand-in object (a real DeckEngine
 * needs an AudioContext); the raw gain param records the values it receives.
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

function deck() {
  const gain = { value: 0, cancelScheduledValues() {}, setValueAtTime(v: number) { this.value = v; } };
  const scratchPlayback = {
    active: false,
    isPatternActive() { return this.active; },
    stopPattern() { this.active = false; },
    isFaderLFOActive: false,
  };
  const audioPlayer = { playing: false, async play() { this.playing = true; }, stop() { this.playing = false; } };
  const d = Object.assign(Object.create(DeckEngine.prototype), {
    _rawDeckGainParam: gain,
    deckGain: { gain: { rampTo() {} } },
    scratchPlayback,
    audioPlayer,
    _playbackMode: 'audio',
    _stemMode: false,
    _isScratchActive: false,
    _restGain: 1,
    _cancelPrimingIfActive: async () => {},
    _endPatternScratch: () => {},
    _disableReverbSend: () => {},
    _decayToRest: () => {},
    _endBend: () => {},
  }) as DeckEngine;
  return { d, gain, scratchPlayback, audioPlayer };
}

describe('a scratch never leaves a deck silent', () => {
  it('play() after a scratch left deckGain at 0 puts it back to 1', async () => {
    const { d, gain } = deck();
    await d.play();
    expect(gain.value).toBe(1);
  });

  it('play() restores the trim gain, not a flat 1', async () => {
    const { d, gain } = deck();
    d.setTrimGain(-6);
    gain.value = 0;
    await d.play();
    expect(gain.value).toBeCloseTo(Math.pow(10, -6 / 20), 9);
  });

  it('stop() ends a looping pattern scratch, so the next play() is audible', async () => {
    const { d, gain, scratchPlayback } = deck();
    scratchPlayback.active = true;
    d.stop();
    expect(scratchPlayback.active).toBe(false);
    await d.play();
    expect(gain.value).toBe(1);
  });

  it('play() during a pattern scratch leaves the scratch gate alone', async () => {
    const { d, gain, scratchPlayback } = deck();
    scratchPlayback.active = true;
    await d.play();
    expect(gain.value).toBe(0);
  });
});
