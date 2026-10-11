/**
 * The audible crossfader follows the store's crossfader.
 *
 * Owner 2026-10-11: deck B playing, crossfader fully on B, SYNC on deck A ->
 * both decks audible at once. syncDeckBPM wrote the crossfader to the store
 * only; the mixer stayed at 0.5 (both decks at 71 %) while the fader showed B.
 * Ten call sites wrote the store and each had to remember the mixer too.
 * DJEngine now makes the mixer follow the store, so none can drift.
 *
 * Drives the real DJEngine constructor and syncDeckBPM; the audio nodes are
 * stand-ins (no AudioContext in the test).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mixerCalls: number[] = [];
const mixerState = { position: 0.5, curve: 'smooth' as string };

vi.mock('../DJMixerEngine', () => ({
  DJMixerEngine: class {
    inputA = {}; inputB = {}; inputC = {};
    setCueEngine() {}
    getMasterGain() { return { connect() {} }; }
    setCrossfader(p: number) { mixerCalls.push(p); mixerState.position = p; }
    getCrossfader() { return mixerState.position; }
    setCurve(c: string) { mixerState.curve = c; }
    getCurve() { return mixerState.curve; }
    dispose() {}
  },
}));
vi.mock('../DJCueEngine', () => ({
  DJCueEngine: class { getMasterTap() { return {}; } init() { return Promise.resolve(); } dispose() {} },
}));
vi.mock('../DJMicEngine', () => ({ DJMicEngine: class { dispose() {} } }));
vi.mock('../DeckEngine', () => ({
  DeckEngine: class {
    playbackMode = 'audio';
    replayer = { getSong: () => null };
    stop() {}
    dispose() {}
    play() { return Promise.resolve(); }
  },
}));

import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '../DJEngine';
import { syncDeckBPM } from '../DJActions';

describe('the mixer follows the store crossfader', () => {
  beforeEach(() => {
    mixerCalls.length = 0;
  });

  it('SYNC on deck A moves the audible mix fully to deck B, not just the fader on screen', () => {
    getDJEngine();
    useDJStore.getState().setCrossfader(0.5);
    useDJStore.getState().setDeckState('B', { fileName: 'b.mod', detectedBPM: 140, isPlaying: true });
    useDJStore.getState().setDeckState('A', { fileName: 'a.mod', detectedBPM: 125, isPlaying: true });

    syncDeckBPM('A');

    expect(useDJStore.getState().crossfaderPosition).toBe(1);
    expect(mixerState.position).toBe(1);
  });

  it('a store-only crossfader write reaches the mixer', () => {
    getDJEngine();
    useDJStore.getState().setCrossfader(0.25);
    expect(mixerCalls.at(-1)).toBe(0.25);
  });
});
