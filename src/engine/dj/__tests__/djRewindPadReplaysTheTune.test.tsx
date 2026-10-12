/**
 * Owner decision 2026-10-12: the reggae sound-system Rewind on the DJ deck.
 * Reachability: the deck's Rewind pad (DeckFXPads) -> the DJ FX registry
 * (fx_deck_rewind) -> DJActions.rewindDeck -> the selector's hand in the ported
 * two-body turntable model (turntableSim.simulate, one run) played by the platter
 * driver -> the deck's scratch rate. Owner 2026-10-12: the old constant -3 pull
 * "sounds weird and pitched up": the rate now ramps through 0 (the catch), pulls in
 * uneven strokes and never sits on one value. Sentinel: the model's run, the driver's
 * ticks, the rate went backward, then the deck was cued to the tune's first downbeat at
 * rate 1, on the other (heard) deck's next bar; the Dub Siren wailed through
 * the pull-back and the Air Horn blew on the restart.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TurntablePhysics } from '@/engine/turntable/TurntablePhysics';
import { useDJStore } from '@/stores/useDJStore';

const holder = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

afterEach(() => { cleanup(); vi.useRealTimers(); });

const grid = (bpm: number, firstDownbeat: number, lengthSec: number) => {
  const beat = 60 / bpm;
  const beats: number[] = [];
  for (let t = firstDownbeat; t < lengthSec; t += beat) beats.push(t);
  return { bpm, timeSignature: 4, beats, downbeats: beats.filter((_, i) => i % 4 === 0) };
};

describe('the deck Rewind pad', () => {
  it('pulls the record back through the platter physics and replays the same tune from its first downbeat on the other deck\'s next bar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const rates: number[] = [];
    const cues: Array<{ sec: number; t: number; rate: number }> = [];
    let scratching = false;
    const physics = new TurntablePhysics();
    const deckA = {
      physics, playbackMode: 'audio' as const,
      isPlaying: () => true,
      startScratch: () => { scratching = true; },
      setScratchVelocity: (v: number) => { rates.push(v); },
      stopScratch: () => { scratching = false; },
      cueSeconds: (sec: number) => { cues.push({ sec, t: Date.now(), rate: physics.playbackRate }); return true; },
      getHeardPosition: () => 95,
    };
    // Deck B plays, heard, at 10.3 s of a 120 BPM grid: its next bar is at 12 s, 1.7 s away.
    const deckB = { physics: new TurntablePhysics(), playbackMode: 'audio' as const, isPlaying: () => true, getHeardPosition: () => 10.3 };
    holder.engine = { getDeck: (id: string) => (id === 'A' ? deckA : deckB) };
    const s = useDJStore.getState();
    s.setCrossfader(0.5);
    s.setDeckState('A', { isPlaying: true, volume: 1, effectiveBPM: 120, beatGrid: grid(120, 0.48, 200), durationMs: 200_000 });
    s.setDeckState('B', { isPlaying: true, volume: 1, effectiveBPM: 120, beatGrid: grid(120, 0, 200), durationMs: 200_000 });

    const { DeckFXPads } = await import('@/components/dj/DeckFXPads');
    const { rewindStats } = await import('../DJActions');
    const { turntableSimStats } = await import('@/engine/turntable/turntableSim');
    const simsBefore = turntableSimStats.runs;
    const { djFxFireCounts } = await import('@/engine/drumpad/DjFxActions');
    const ticksBefore = rewindStats.ticks;
    const restartsBefore = rewindStats.restarts;
    const sirenBefore = djFxFireCounts.fx_dub_siren ?? 0;
    const hornBefore = djFxFireCounts.fx_air_horn ?? 0;
    const { getByTitle } = render(<DeckFXPads deckId="A" />);
    const pressedAt = Date.now();
    fireEvent.pointerDown(getByTitle(/^Rewind/));

    expect(turntableSimStats.runs - simsBefore, 'the selector\'s hand in the turntable model').toBe(1);
    expect(scratching, 'the deck audio follows the platter').toBe(true);
    expect(djFxFireCounts.fx_dub_siren, 'the Dub Siren wails through the pull-back').toBe(sirenBefore + 1);
    for (let i = 0; i < 600 && scratching; i++) vi.advanceTimersByTime(8);

    expect(rewindStats.ticks - ticksBefore, 'driver ticks').toBeGreaterThan(50);
    expect(Math.min(...rates), 'the deck rate went backward, fast').toBeLessThan(-1.5);
    // a hand, not a constant: the pull passes through 0 from the catch, changes every tick, no jumps
    const pull = rates.slice(0, rates.findIndex((r) => r < -0.05) + 60);
    expect(pull.some((r) => r > 0 && r < 0.6), 'the catch slows the record before it reverses').toBe(true);
    expect(new Set(rates.filter((r) => r < -0.3).map((r) => r.toFixed(2))).size, 'no constant pull rate').toBeGreaterThan(20);
    for (let i = 1; i < rates.length; i++) expect(Math.abs(rates[i]! - rates[i - 1]!), `smooth at tick ${i}`).toBeLessThan(0.6);
    expect(scratching, 'the hand let go').toBe(false);
    expect(rewindStats.restarts - restartsBefore).toBe(1);
    expect(cues, 'one restart').toHaveLength(1);
    expect(cues[0].sec, 'the same tune again, from its first downbeat').toBeCloseTo(0.48, 5);
    expect(physics.playbackRate, 'at full speed').toBe(1);
    expect(cues[0].rate, 'the platter was at speed when the tune dropped').toBe(1);
    expect(rewindStats.lastAlignedTo, 'on the heard deck\'s bar').toBe('B');
    expect((cues[0].t - pressedAt) / 1000, 'the restart lands on deck B\'s next bar').toBeCloseTo(1.7, 1);
    expect(djFxFireCounts.fx_air_horn, 'the Air Horn on the restart downbeat').toBe(hornBefore + 1);
    expect(physics.externallyDriven).toBe(false);
  }, 120_000); // DeckFXPads pulls the dub and pad engines in: a slow first import under load

  it('restarts right after the pull-back when no other deck is heard', async () => {
    const { rewindRestartTiming, REWIND_PULL_SEC } = await import('../DJActions');
    holder.engine = { getDeck: () => ({ isPlaying: () => false }) };
    expect(rewindRestartTiming('A')).toEqual({ waitSec: REWIND_PULL_SEC, alignedTo: null });
  });

  it('the one-shot kit\'s Rewind pad is the deck move; the canned sound stays in the library as Rewind Sound', async () => {
    const { DJ_PAD_PRESETS } = await import('@/constants/djPadPresets');
    const { ALL_ONE_SHOT_PRESETS } = await import('@/constants/djOneShotPresetsByCategory');
    const kit = DJ_PAD_PRESETS.find((p) => p.id === 'oneshots-live')!.create();
    const pad = kit.pads.find((p) => p.name === 'Rewind')!;
    expect(pad.djFxAction).toBe('fx_deck_rewind');
    expect(pad.synthConfig).toBeUndefined();
    expect(ALL_ONE_SHOT_PRESETS.find((p) => p.index === 31)?.name).toBe('Rewind Sound');
  });
});
