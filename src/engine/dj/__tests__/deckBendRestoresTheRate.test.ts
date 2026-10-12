/**
 * A rate bend (a jog-wheel push) moves a deck's playback rate for a while and
 * then returns it to exactly the pitch fader's rate. Phase correction of a
 * playing deck rides on it (DJAutoSync.bendToPhase), and so does the nudge of
 * an audio deck: Auto DJ decks play pre-rendered audio, where the old nudge
 * only told the (idle) tracker replayer and so did nothing (plan
 * 2026-10-11-dj-juggling C6).
 *
 * Drives the real DeckEngine methods on a stand-in object (a real DeckEngine
 * needs an AudioContext); the players record the rates they receive.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});

import { DeckEngine } from '../DeckEngine';

function ratePlayer() {
  return {
    rate: 1,
    setPlaybackRate(r: number) { this.rate = r; },
    getPlaybackRate() { return this.rate; },
  };
}

function deck(mode: 'audio' | 'tracker') {
  const audioPlayer = ratePlayer();
  const stemPlayer = ratePlayer();
  const replayer = {
    tempo: 1, pitch: 1, nudges: [] as Array<[number, number]>,
    setTempoMultiplier(m: number) { this.tempo = m; },
    getTempoMultiplier() { return this.tempo; },
    setPitchMultiplier(m: number) { this.pitch = m; },
    setDetuneCents() {},
    setNudge(offset: number, ticks: number) { this.nudges.push([offset, ticks]); },
  };
  const keyLock = { compensate: 0, setPitchSemiTones(s: number) { this.compensate = s; } };
  const d = Object.assign(Object.create(DeckEngine.prototype), {
    audioPlayer, stemPlayer, replayer, keyLock,
    _playbackMode: mode,
    _repitchLocked: false,
    _isScratchActive: false,
    keyLockEnabled: false,
    restMultiplier: 1,
    _currentPitchSemitones: 0,
    scratchPlayback: { isPatternActive: () => false },
  }) as DeckEngine;
  return { d, audioPlayer, stemPlayer, replayer, keyLock };
}

describe('a rate bend returns the deck to the fader rate', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('audio deck: bends to rest x ratio, then restores exactly the rest rate', () => {
    const { d, audioPlayer, stemPlayer } = deck('audio');
    d.setPitch(2);
    const rest = Math.pow(2, 2 / 12);
    d.bendRate(1.03, 500);
    expect(audioPlayer.rate).toBeCloseTo(rest * 1.03, 9);
    expect(stemPlayer.rate).toBeCloseTo(rest * 1.03, 9);
    vi.advanceTimersByTime(499);
    expect(audioPlayer.rate).toBeCloseTo(rest * 1.03, 9);
    vi.advanceTimersByTime(1);
    expect(audioPlayer.rate).toBe(rest);
    expect(stemPlayer.rate).toBe(rest);
  });

  it('a bend is clamped to 6 % either way', () => {
    const { d, audioPlayer } = deck('audio');
    d.bendRate(1.5, 100);
    expect(audioPlayer.rate).toBeCloseTo(1.06, 9);
    d.bendRate(0.5, 100);
    expect(audioPlayer.rate).toBeCloseTo(0.94, 9);
  });

  it('a second bend replaces the first and only its own restore runs', () => {
    const { d, audioPlayer } = deck('audio');
    d.bendRate(1.05, 100);
    d.bendRate(0.98, 1000);
    vi.advanceTimersByTime(150);
    expect(audioPlayer.rate).toBeCloseTo(0.98, 9);
    vi.advanceTimersByTime(850);
    expect(audioPlayer.rate).toBe(1);
  });

  it('a held jog wheel (scratch) is never bent', () => {
    const { d, audioPlayer } = deck('audio');
    (d as unknown as { _isScratchActive: boolean })._isScratchActive = true;
    d.bendRate(1.05, 100);
    expect(audioPlayer.rate).toBe(1);
  });

  it('key lock on: the bend keeps the key, and the restore keeps the Key Lock pitch compensation', () => {
    const { d, audioPlayer, keyLock } = deck('audio');
    (d as unknown as { keyLockEnabled: boolean }).keyLockEnabled = true;
    d.setPitch(1);
    expect(keyLock.compensate).toBe(-1);
    d.bendRate(1.04, 200);
    expect(audioPlayer.rate).toBeCloseTo(Math.pow(2, 1 / 12) * 1.04, 9);
    expect(keyLock.compensate).toBeCloseTo(-(1 + 12 * Math.log2(1.04)), 9);
    vi.advanceTimersByTime(200);
    expect(keyLock.compensate).toBe(-1);
    expect(audioPlayer.rate).toBe(Math.pow(2, 1 / 12));
  });

  it('tracker deck: the bend moves the tempo multiplier, then restores it', () => {
    const { d, replayer } = deck('tracker');
    d.setPitch(-1);
    const rest = Math.pow(2, -1 / 12);
    d.bendRate(0.97, 300);
    expect(replayer.tempo).toBeCloseTo(rest * 0.97, 9);
    vi.advanceTimersByTime(300);
    expect(replayer.tempo).toBe(rest);
  });

  it('stop() cancels a pending restore timer and puts the rest rate back', () => {
    const { d, audioPlayer } = deck('audio');
    Object.assign(d, { _stemMode: false });
    (audioPlayer as unknown as { stop(): void }).stop = () => {};
    d.bendRate(1.05, 1000);
    d.stop();
    expect(audioPlayer.rate).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('nudging an audio deck moves its playback rate', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('dj_nudge / nudgeDeck on an audio deck speeds it up for ticks x 20 ms, then restores', () => {
    const { d, audioPlayer, replayer } = deck('audio');
    d.nudge(2, 8);
    expect(audioPlayer.rate, 'an audio-deck nudge left the playback rate untouched').toBeCloseTo(1.02, 9);
    expect(replayer.nudges).toEqual([]);
    vi.advanceTimersByTime(160);
    expect(audioPlayer.rate).toBe(1);
  });

  it('a backward nudge slows the audio deck', () => {
    const { d, audioPlayer } = deck('audio');
    d.nudge(-5, 16);
    expect(audioPlayer.rate).toBeCloseTo(0.95, 9);
    vi.advanceTimersByTime(320);
    expect(audioPlayer.rate).toBe(1);
  });

  it('a tracker deck still nudges through the replayer', () => {
    const { d, replayer } = deck('tracker');
    d.nudge(3, 8);
    expect(replayer.nudges).toEqual([[3, 8]]);
    expect(replayer.tempo).toBe(1);
  });
});

describe('a held nudge button bends until it is released', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('audio deck: stays bent for as long as the button is held, then returns to the fader rate', () => {
    const { d, audioPlayer } = deck('audio');
    d.holdNudge(2);
    expect(audioPlayer.rate).toBeCloseTo(1.02, 9);
    vi.advanceTimersByTime(5000);
    expect(audioPlayer.rate).toBeCloseTo(1.02, 9);
    d.releaseNudge();
    expect(audioPlayer.rate).toBe(1);
  });

  it('tracker deck: the nudge offset holds until release, then clears', () => {
    const { d, replayer } = deck('tracker');
    d.holdNudge(-5);
    expect(replayer.nudges.at(-1)).toEqual([-5, Number.MAX_SAFE_INTEGER]);
    d.releaseNudge();
    expect(replayer.nudges.at(-1)).toEqual([0, 0]);
  });
});

