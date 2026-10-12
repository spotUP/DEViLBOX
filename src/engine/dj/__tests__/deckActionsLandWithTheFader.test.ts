/**
 * Deck actions land with the crossfader (JUGGLE-LAST-CUT-LATE follow-ups, 2026-10-12).
 *
 * Tone schedules a crossfader ramp at Tone.now() = currentTime + lookAhead (100 ms, measured live), while
 * a deck stop, a send change and a seek's kill of the playing sources acted at currentTime. A deck stopped
 * or reset right after a fader move changed while the crowd still heard it (a 100 ms hole before the
 * master's downbeat at a juggle's hand-back), and a seek of an audible deck stopped the old sources at
 * currentTime but started the new one at Tone.now(): 100 ms of silence in the middle of the track (a call
 * jump of the audible master). One time rule (stopPlayerNow.afterPendingMix, fed by the mixer) places
 * every one of them.
 *
 * The real DJMixerEngine, DeckAudioPlayer and DeckEngine code on stand-in objects (no AudioContext); the
 * Tone.Player stand-in schedules the way Tone does: an untimed start lands at currentTime + lookAhead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const LOOK_AHEAD = 0.1;
const raw = { currentTime: 0 };

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => raw.currentTime + LOOK_AHEAD, getContext: () => ({ rawContext: raw, state: 'running' }) };
});

import { DJMixerEngine } from '../DJMixerEngine';
import { DeckAudioPlayer } from '../DeckAudioPlayer';
import { DeckEngine } from '../DeckEngine';

interface Span { from: number; to: number; offset: number }

/** Tone.Player as DeckAudioPlayer uses it: sources that sound from their start until stopped. */
function tonePlayer() {
  const sounding: Span[] = [];
  const sources = new Set<{ stop(t: number): void }>();
  const player = {
    sounding,
    fadeIn: 0, fadeOut: 0, buffer: { loaded: true },
    _activeSources: sources,
    _state: { setStateAtTime: () => {} },
    seek: () => {},
    get state() { return sounding.some((s) => s.to === Infinity) ? 'started' : 'stopped'; },
    start(time?: number, offset = 0) {
      const span: Span = { from: Math.max(time ?? raw.currentTime + LOOK_AHEAD, raw.currentTime), to: Infinity, offset };
      sounding.push(span);
      sources.add({ stop: (t: number) => { span.to = Math.max(span.from, t); } });
    },
    stop(time?: number) {
      const t = Math.max(time ?? raw.currentTime + LOOK_AHEAD, raw.currentTime);
      for (const s of sounding) if (s.to === Infinity) s.to = Math.max(s.from, t + player.fadeOut);
      sources.clear();
    },
  };
  return player;
}

function audioPlayer() {
  const player = tonePlayer();
  const ap = Object.assign(Object.create(DeckAudioPlayer.prototype), {
    player, onRunningChange: null,
    _loaded: true, _duration: 300, _playbackRate: 1,
    _rateChangePos: 0, _rateChangeTime: 0, _rateTrackingActive: false,
    _pendingOffset: null, _seekCount: 0, _lastSeekTarget: 0,
  }) as DeckAudioPlayer;
  return { ap, player };
}

/** The real mixer's crossfader on stand-in gain nodes. */
function mixer() {
  const gain = () => ({ gain: { rampTo: () => {} } });
  return Object.assign(Object.create(DJMixerEngine.prototype), { inputA: gain(), inputB: gain(), position: 0.5, curve: 'smooth' }) as DJMixerEngine;
}

/** A param that records its scheduled events. */
function param() {
  const events: Array<{ t: number; v: number }> = [];
  return {
    events, value: 0,
    cancelScheduledValues: () => {},
    setValueAtTime: (v: number, t: number) => { events.push({ t, v }); },
    linearRampToValueAtTime: (v: number, t: number) => { events.push({ t, v }); },
  };
}

describe('deck actions land with the crossfader', () => {
  beforeEach(() => { raw.currentTime += 10; });

  it('a deck stopped right after a fader move stops when the move lands, not in its last audible 100 ms', () => {
    const { ap, player } = audioPlayer();
    player.start(raw.currentTime, 0);
    mixer().setCrossfader(0); // the hand-back: the fader moves to the master
    ap.stop();
    expect(player.sounding[0].to).toBeGreaterThanOrEqual(raw.currentTime + LOOK_AHEAD);
  });

  it('a send reset right after a fader move starts when the move lands', () => {
    const deck = Object.assign(Object.create(DeckEngine.prototype), { _echoSend: { gain: param() }, _reverbSend: { gain: param() } }) as DeckEngine;
    mixer().setCrossfader(1);
    deck.setEchoSend(0);
    deck.setReverbSend(0);
    const first = (p: ReturnType<typeof param>) => p.events[0].t;
    expect(first((deck as unknown as { _echoSend: { gain: ReturnType<typeof param> } })._echoSend.gain)).toBeGreaterThanOrEqual(raw.currentTime + LOOK_AHEAD);
    expect(first((deck as unknown as { _reverbSend: { gain: ReturnType<typeof param> } })._reverbSend.gain)).toBeGreaterThanOrEqual(raw.currentTime + LOOK_AHEAD);
  });

  it('a stop with no fader move pending still stops at once (a pause is immediate)', () => {
    const { ap, player } = audioPlayer();
    player.start(raw.currentTime, 0);
    raw.currentTime += 1; // the last fader move landed long ago
    ap.stop();
    expect(player.sounding[0].to).toBeCloseTo(raw.currentTime + 0.01, 6); // now, plus the 10 ms de-click fade
  });

  it('a seek of an audible deck leaves no silence: the old audio plays until the new starts', () => {
    const { ap, player } = audioPlayer();
    player.start(raw.currentTime, 0);
    raw.currentTime += 1;
    ap.seek(120);
    expect(player.sounding.length).toBe(2);
    const [before, after] = player.sounding;
    expect(after.offset).toBe(120);
    // Measured without the fix: the old source stopped at currentTime, the new one started a lookAhead later.
    expect((after.from - before.to) * 1000, `old ends ${before.to}, new starts ${after.from}`).toBeLessThan(1);
    // The position clock is unchanged in meaning: the new audio reaches the reported position on time.
    expect(ap.getPosition()).toBeCloseTo(120 + (raw.currentTime + LOOK_AHEAD - after.from), 6);
  });
});
