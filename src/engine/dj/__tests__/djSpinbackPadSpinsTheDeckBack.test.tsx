/**
 * Owner decision 2026-10-12: a Spinback on the DJ deck. Reachability: the
 * deck's Spinback pad (DeckFXPads) -> the DJ FX registry (fx_deck_spinback)
 * -> DJActions.spinbackDeck -> the deck's own TurntablePhysics.triggerSpinback
 * (the tracker's spinback) ticked by the engine driver -> the deck's scratch
 * rate. Sentinel: the driver's physics ticks, and the rate the deck was given
 * went negative (the audio rewinds) and came back (the record plays on).
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
    const trigger = vi.spyOn(physics, 'triggerSpinback');
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
    const ticksBefore = spinbackStats.ticks;
    const { getByTitle } = render(<DeckFXPads deckId="A" />);
    fireEvent.pointerDown(getByTitle(/^Spinback/));

    expect(trigger, 'the physics spinback ran').toHaveBeenCalledTimes(1);
    expect(scratching).toBe(true);
    for (let i = 0; i < 800 && scratching; i++) vi.advanceTimersByTime(8);

    expect(spinbackStats.ticks - ticksBefore, 'driver ticks').toBeGreaterThan(10);
    expect(Math.min(...rates), 'the deck rate went backward').toBeLessThan(-0.05);
    expect(scratching, 'the spinback ended').toBe(false);
    expect(rates[rates.length - 1], 'back at speed').toBeGreaterThan(0.9);
    expect(playing, 'the pad\'s record plays on').toBe(true);
    expect(physics.externallyDriven).toBe(false);
  }, 120_000); // DeckFXPads pulls the dub and pad engines in: a slow first import under load
});
