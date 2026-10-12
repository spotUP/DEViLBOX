/**
 * Owner decision 2026-10-12: a Spinback on the DJ deck. Reachability: the
 * deck's Spinback pad (DeckFXPads) -> the DJ FX registry (fx_deck_spinback)
 * -> DJActions.spinbackDeck -> the DJ's flick in the ported two-body turntable
 * model (turntableSim.simulate, one run) played by the engine driver -> the
 * deck's scratch rate. Owner 2026-10-12 LOCAL: the old spinback "does nothing" -
 * measured: TurntablePhysics' impulse reversed the record for 48 ms and then held
 * it at 0.93 for 6 s. Now: >= 0.4 s heard backward, below -1.5 x, back at speed.
 * The heard audio of such a rate track is measured in djSpinbackIsHeardBackward.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TurntablePhysics } from '@/engine/turntable/TurntablePhysics';

const holder = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the deck Spinback pad', () => {
  it('spins the deck platter back through its physics and the deck audio follows the rate', async () => {
    vi.useFakeTimers();
    const rates: number[] = [];
    let scratching = false;
    let playing = true;
    const physics = new TurntablePhysics();
    const deck = {
      physics,
      isPlaying: () => playing,
      startScratch: () => { scratching = true; },
      setScratchVelocity: (v: number) => { rates.push(v); },
      stopScratch: () => { scratching = false; },
      pause: () => { playing = false; },
    };
    holder.engine = { getDeck: () => deck };

    const { DeckFXPads } = await import('@/components/dj/DeckFXPads');
    const { spinbackStats } = await import('../DJActions');
    const { turntableSimStats } = await import('@/engine/turntable/turntableSim');
    const simsBefore = turntableSimStats.runs;
    const ticksBefore = spinbackStats.ticks;
    const reverseBefore = spinbackStats.reverseMs;
    const { getByTitle } = render(<DeckFXPads deckId="A" />);
    fireEvent.pointerDown(getByTitle(/^Spinback/));

    expect(turntableSimStats.runs - simsBefore, 'the flick in the turntable model').toBe(1);
    expect(scratching).toBe(true);
    for (let i = 0; i < 800 && scratching; i++) vi.advanceTimersByTime(8);

    expect(spinbackStats.ticks - ticksBefore, 'driver ticks').toBeGreaterThan(10);
    expect(Math.min(...rates), 'the deck rate went backward').toBeLessThan(-1.5);
    expect(spinbackStats.reverseMs - reverseBefore, 'heard backward long enough to hear').toBeGreaterThanOrEqual(400);
    expect(scratching, 'the spinback ended').toBe(false);
    expect(rates[rates.length - 1], 'back at speed').toBeGreaterThanOrEqual(0.97);
    expect(playing, 'the pad\'s record plays on').toBe(true);
    expect(physics.externallyDriven).toBe(false);
  }, 120_000); // DeckFXPads pulls the dub and pad engines in: a slow first import under load
});
