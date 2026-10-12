/**
 * SCR-P1.R1 reachability (owner scratch plan sections 19, 20, 81, 91):
 * `fireDjFx('fx_scratch_chirp', {deck: 'A', source: 'keyboard'})` - the one
 * action path the pads, keyboard, MIDI, MCP and Auto DJ share - reaches the
 * deck's pattern player, which reads the fader model for every tick: within
 * one beat at 120 BPM the model is consulted >= 4 times, the deck receives
 * both velocity signs (a chirp reverses), and the channel gain is 0 inside a
 * cut window and 1 inside an open one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ deck: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => holder.deck }),
  getDJEngineIfActive: () => holder.deck ? { getDeck: () => holder.deck } : null,
}));

import { ScratchPlayback, getPatternByName } from '../DJScratchEngine';
import { scratchFaderModelStats } from '../scratch/scratchFaderModel';
import { fireDjFx, releaseDjFx, djFxFireCounts, clearDjFxFireLog, DJ_FX_ACTION_MAP, SCRATCH_FX_ACTIONS } from '@/engine/drumpad/DjFxActions';
import { useDJStore } from '@/stores/useDJStore';
import type { DeckEngine } from '../DeckEngine';

interface Tick { velocity: number; gain: number | null }

function fakeDeck(bpm: number) {
  const ticks: Tick[] = [];
  let lastGain: number | null = null;
  const gainParam = {
    cancelScheduledValues: () => {},
    setValueAtTime: (v: number) => { lastGain = v; ticks[ticks.length - 1]!.gain = v; },
    linearRampToValueAtTime: () => {},
    value: 1,
  };
  const stub = {
    id: 'A',
    playbackMode: 'tracker',
    replayer: { getElapsedMs: () => 0 },
    setScratchVelocity: (v: number) => { ticks.push({ velocity: v, gain: lastGain }); },
    getChannelGainParam: () => gainParam,
    releaseChannelGainParam: () => {},
  };
  const playback = new ScratchPlayback(() => stub as unknown as DeckEngine, () => bpm);
  const deck = {
    id: 'A',
    ticks,
    patternCalls: [] as string[],
    stopCalls: 0,
    playPattern(name: string) {
      this.patternCalls.push(name);
      const pattern = getPatternByName(name);
      if (!pattern) return;
      playback.play(pattern);
      playback.schedulePatternFader(pattern, bpm);
    },
    stopPattern() { this.stopCalls++; playback.stopPattern(); },
    dispose() { playback.dispose(); },
  };
  return deck;
}

describe('a scratch gesture fired through the DJ FX registry reaches the deck (SCR-P1.R1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    clearDjFxFireLog();
    scratchFaderModelStats.faderGainAtCalls = 0;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('fx_scratch_chirp on deck A: fader model consulted >= 4x per beat, both velocity signs, gain 0 in cuts and 1 in open windows', () => {
    const deck = fakeDeck(120);
    holder.deck = deck;

    expect(fireDjFx('fx_scratch_chirp', { deck: 'A', source: 'keyboard' })).toBe(true);
    expect(djFxFireCounts.fx_scratch_chirp).toBe(1);
    expect(deck.patternCalls).toEqual(['Chirp']);
    expect(useDJStore.getState().decks.A.activePatternName).toBe('Chirp');
    expect(useDJStore.getState().djFxActive.fx_scratch_chirp).toBe('A');

    vi.advanceTimersByTime(500); // one beat at 120 BPM = four chirp cycles

    expect(scratchFaderModelStats.faderGainAtCalls).toBeGreaterThanOrEqual(4);
    const velocities = deck.ticks.map((t) => t.velocity);
    expect(velocities.some((v) => v > 0.5)).toBe(true);
    expect(velocities.some((v) => v < -0.5)).toBe(true);

    const gains = deck.ticks.map((t) => t.gain);
    expect(gains).toContain(0);
    expect(gains).toContain(1);
    // the chirp's velocity peak (2.0 at 0.25 of the cycle) lies inside the open
    // window (0.06, 0.44); its turnarounds (velocity ~0 at 0 and 0.5) inside cuts
    for (const t of deck.ticks) {
      if (Math.abs(t.velocity) > 1.5) expect(t.gain, `open window at v=${t.velocity}`).toBe(1);
      if (Math.abs(t.velocity) < 0.15) expect(t.gain, `cut window at v=${t.velocity}`).toBe(0);
    }

    releaseDjFx('fx_scratch_chirp', { deck: 'A', source: 'keyboard' });
    expect(deck.stopCalls).toBe(1);
    expect(useDJStore.getState().decks.A.activePatternName).toBeNull();
    expect(useDJStore.getState().djFxActive.fx_scratch_chirp ?? null).toBeNull();
    deck.dispose();
  });

  it('the registry carries one momentary action per catalogue gesture (31) plus stop, throw, cue, anchor, loop, record, release, in the scratch category', () => {
    expect(SCRATCH_FX_ACTIONS).toHaveLength(31 + 7);
    for (const a of SCRATCH_FX_ACTIONS) {
      expect(a.category).toBe('scratch');
      expect(DJ_FX_ACTION_MAP[a.id]).toBe(a);
      expect(a.name).toMatch(/^[A-Z][A-Za-z-]+( [A-Z][A-Za-z-]+)*$/);
    }
    expect(DJ_FX_ACTION_MAP.fx_scratch_stop.mode).toBe('oneshot');
    expect(DJ_FX_ACTION_MAP.fx_scratch_transformer4.name).toBe('Transformer');
    expect(DJ_FX_ACTION_MAP.fx_scratch_eightFingerCrab.name).toBe('Eight-Finger Crab');
  });
});
