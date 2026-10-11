/**
 * Loading a track onto a stopped deck primes the scratch ring buffer: the deck
 * is muted (channelGain to 0), the player runs ~150 ms, pauses, and the gain
 * comes back. Tone schedules a bare start/stop one lookAhead (100 ms) after
 * the context's current time, so the pause took effect 100 ms after the gain
 * was restored and the owner heard the tail of the priming playback on every
 * load from the crate.
 *
 * Runs the real DeckAudioPlayer + DeckEngine priming code on stand-in objects
 * (a real deck needs an AudioContext). The Tone.Player stand-in schedules the
 * way Tone does: an untimed start/stop lands at currentTime + lookAhead, a
 * timed one is clamped to currentTime, and a stop keeps sounding through its
 * fadeOut. The deck is audible wherever the player sounds while the gain is up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const LOOK_AHEAD = 0.1;
const raw = { currentTime: 0 };

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => raw.currentTime + LOOK_AHEAD, getContext: () => ({ rawContext: raw, state: 'running' }) };
});

import { DeckAudioPlayer } from '../DeckAudioPlayer';
import { DeckEngine } from '../DeckEngine';

interface Span { from: number; to: number }

/** Tone.Player as far as DeckAudioPlayer uses it, with Tone's scheduling. */
function tonePlayer() {
  const events: Array<{ t: number; started: boolean }> = [];
  const sounding: Span[] = [];
  const stateAt = (t: number) => {
    let started = false;
    for (const e of events) if (e.t <= t) started = e.started;
    return started ? 'started' : 'stopped';
  };
  return {
    sounding,
    fadeIn: 0,
    fadeOut: 0,
    buffer: { loaded: true },
    _activeSources: new Set(),
    get state() { return stateAt(raw.currentTime + LOOK_AHEAD); },
    start(time?: number) {
      const t = Math.max(time ?? raw.currentTime + LOOK_AHEAD, raw.currentTime);
      events.push({ t, started: true });
      sounding.push({ from: t, to: Infinity });
    },
    stop(time?: number) {
      const t = Math.max(time ?? raw.currentTime + LOOK_AHEAD, raw.currentTime);
      events.push({ t, started: false });
      const open = sounding.find(s => s.to === Infinity);
      if (open) open.to = Math.max(open.from, t + this.fadeOut);
    },
  };
}

function audioPlayer() {
  const player = tonePlayer();
  const ap = Object.assign(Object.create(DeckAudioPlayer.prototype), {
    player, onRunningChange: null,
    _loaded: true, _duration: 30, _playbackRate: 1,
    _rateChangePos: 0, _rateChangeTime: 0, _rateTrackingActive: false,
    _pendingOffset: null, _seekCount: 0, _lastSeekTarget: 0,
  }) as DeckAudioPlayer;
  return { ap, player };
}

/** An AudioParam that remembers its setValueAtTime events. */
function gainParam(initial: number) {
  let events: Array<{ t: number; v: number }> = [{ t: -1, v: initial }];
  const valueAt = (t: number) => {
    let v = initial;
    for (const e of events) if (e.t <= t) v = e.v;
    return v;
  };
  return {
    valueAt,
    get value() { return valueAt(raw.currentTime); },
    cancelScheduledValues(t: number) { events = events.filter(e => e.t < t); },
    setValueAtTime(v: number, t: number) { events.push({ t, v }); },
  };
}

/** Context times at which the deck is heard: the player sounds and the gain is up. */
function audibleAt(sounding: Span[], gain: ReturnType<typeof gainParam>): number[] {
  const heard: number[] = [];
  for (const s of sounding) {
    const end = Math.min(s.to, 10);
    for (let t = s.from; t < end; t += 0.001) if (gain.valueAt(t) > 0) heard.push(+t.toFixed(3));
  }
  return heard;
}

async function runClockUntil(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) {
    raw.currentTime += 0.01;
    await vi.advanceTimersByTimeAsync(10);
  }
}

describe('loading a track onto a stopped deck makes no sound', () => {
  beforeEach(() => { vi.useFakeTimers(); raw.currentTime = 5; });
  afterEach(() => { vi.useRealTimers(); });

  it('the scratch-buffer priming that follows a load is never heard', async () => {
    const { ap, player } = audioPlayer();
    const gain = gainParam(1);
    const deck = Object.assign(Object.create(DeckEngine.prototype), {
      audioPlayer: ap,
      channelGain: { gain: { _param: gain } },
      _playbackMode: 'audio',
      scratchBufferReady: true,
      _primingScratchBuffer: false,
      _primingCancelRequested: false,
    }) as DeckEngine;

    let finished = false;
    void (deck as unknown as { _primeScratchBuffer(): Promise<void> })._primeScratchBuffer()
      .then(() => { finished = true; });
    await runClockUntil(() => finished);

    expect(finished).toBe(true);
    expect(player.sounding.length).toBe(1);            // priming did run the player
    expect(player.sounding[0].to).toBeLessThan(Infinity); // and paused it
    expect(audibleAt(player.sounding, gain)).toEqual([]);
    expect(gain.valueAt(raw.currentTime + 1)).toBe(1);  // the deck's gain comes back
  });

  it('a pause silences the deck by the time pause() returns, not one lookahead later', () => {
    const { ap, player } = audioPlayer();
    ap.resume();
    raw.currentTime += 1;
    const silentAt = ap.pause();
    expect(player.sounding[0].to).toBeLessThanOrEqual(raw.currentTime + DeckAudioPlayer.FADE_S);
    expect(silentAt).toBeGreaterThanOrEqual(player.sounding[0].to);
    expect(ap.isCurrentlyPlaying()).toBe(false);
    // Started at 5.1 (one lookahead after resume), stopped at 6.0: 0.9 s played.
    expect(ap.getPosition()).toBeCloseTo(0.9, 6);
  });
});
