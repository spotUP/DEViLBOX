import { describe, it, expect } from 'vitest';
import { chooseRide, clampRide, MACHINE_RIDE_CEILING, type RideTickCtx } from '../chooseRide';
import { AUTO_DUB_PERSONAS } from '../AutoDubPersonas';

/**
 * "the autodub doesn't move any sliders only buttons" (2026-09-23).
 *
 * AutoDub could fire and hold but never move a value over time, which for a
 * dub performer is the missing gesture rather than a missing feature — the
 * effects are on aux sends, so the work IS riding the sends and the return.
 *
 * These drive the decision directly, seeded, with no bus and no transport.
 */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};
/** Always fires: intensity gate passes, first target, mid-range destination. */
const willRide = () => seq(0, 0, 0.5, 0.5);

const ctx = (over: Partial<RideTickCtx> = {}): RideTickCtx => ({
  bar: 100,
  isNewBar: true,
  intensity: 1,
  persona: AUTO_DUB_PERSONAS.scientist,
  lastRideBar: null,
  channelCount: 4,
  heldParams: new Set(),
  currentValue: () => 0.5,
  ...over,
});

describe('chooseRide — when the hand goes out', () => {
  it('rides', () => {
    // The whole point. If this returns null the feature does not exist.
    expect(chooseRide(ctx(), willRide())).not.toBeNull();
  });

  it('starts only on a bar line', () => {
    // Mid-bar is how a gesture arrives at a musically meaningless moment.
    expect(chooseRide(ctx({ isNewBar: false }), willRide())).toBeNull();
  });

  it('rests when intensity is zero', () => {
    // REST is a real decision in this engine, not a failed dice roll.
    expect(chooseRide(ctx({ intensity: 0 }), seq(0.5))).toBeNull();
  });

  it('waits out its own cadence before riding again', () => {
    const persona = AUTO_DUB_PERSONAS.jammy;    // minBarsBetweenFires: 3 → cadence 6
    expect(chooseRide(ctx({ persona, bar: 100, lastRideBar: 97 }), willRide())).toBeNull();
    expect(chooseRide(ctx({ persona, bar: 100, lastRideBar: 90 }), willRide())).not.toBeNull();
  });
});

describe('a ride never fights the performer', () => {
  it('will not take a parameter the hand is already on', () => {
    const held = new Set(['dub.returnGain', 'dub.echoIntensity']);
    // Scientist reaches for exactly those two, so every option is held.
    expect(chooseRide(ctx({ heldParams: held }), willRide())).toBeNull();
  });

  it('will not ride a value it cannot read', () => {
    // No reading means no idea where to ride FROM, so any target is a guess.
    expect(chooseRide(ctx({ currentValue: () => null }), willRide())).toBeNull();
  });
});

/**
 * The test that matters most.
 *
 * The likeliest way to get riding wrong is to build one behaviour with a
 * multiplier per persona. Then Tubby and Perry differ only in how OFTEN they
 * move, which is not what distinguishes them — Tubby is decisive and stepped,
 * Perry lurches. The master plan's DSP-08 matrix already draws that line.
 */
describe('personas ride differently in KIND, not just degree', () => {
  const ride = (id: keyof typeof AUTO_DUB_PERSONAS) =>
    chooseRide(ctx({ persona: AUTO_DUB_PERSONAS[id] }), willRide());

  it('Tubby steps where the others glide', () => {
    expect(ride('tubby')?.curve).toBe('step');
    expect(ride('scientist')?.curve).toBe('ease');
    expect(ride('perry')?.curve).toBe('ease');
  });

  it('they reach for different controls', () => {
    // Tubby goes for the Big Knob; Scientist for the return.
    expect(ride('tubby')?.param).toBe('dub.hpfCutoff');
    expect(ride('scientist')?.param).toBe('dub.returnGain');
    expect(ride('madProfessor')?.param).toBe('dub.returnGain');
  });

  it('a settled hand travels longer than a jittery one', () => {
    // From `variance`, which the personas already carry: Perry 0.35, Tubby 0.
    const perry = ride('perry')!.bars;
    const tubby = ride('tubby')!.bars;
    expect(perry, 'Perry does not commit').toBeLessThan(tubby);
  });

  it('every persona can ride — none is silently excluded', () => {
    for (const id of Object.keys(AUTO_DUB_PERSONAS) as Array<keyof typeof AUTO_DUB_PERSONAS>) {
      expect(ride(id), id).not.toBeNull();
    }
  });
});

describe('where a ride goes', () => {
  it('lands somewhere other than where it started', () => {
    // A hand that moves and changes nothing has not performed.
    const r = chooseRide(ctx(), willRide())!;
    expect(r.target).not.toBe(0.5);
  });

  it('stays inside 0..1 from either extreme', () => {
    for (const current of [0, 0.02, 0.98, 1]) {
      const r = chooseRide(ctx({ currentValue: () => current }), willRide());
      expect(r!.target, `from ${current}`).toBeGreaterThanOrEqual(0);
      expect(r!.target, `from ${current}`).toBeLessThanOrEqual(1);
    }
  });

  it('rides back off a rail rather than pressing against it', () => {
    // At 1.0 there is no room up, so it must travel down.
    const r = chooseRide(ctx({ currentValue: () => 1 }), willRide())!;
    expect(r.target).toBeLessThan(1);
  });

  it('always takes a whole number of bars, at least one', () => {
    for (const id of Object.keys(AUTO_DUB_PERSONAS) as Array<keyof typeof AUTO_DUB_PERSONAS>) {
      const r = chooseRide(ctx({ persona: AUTO_DUB_PERSONAS[id] }), willRide())!;
      expect(Number.isInteger(r.bars), id).toBe(true);
      expect(r.bars, id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the machine is more cautious than the hand', () => {
  it('clamps the wet return below what a performer may reach', () => {
    // Removing the return governor was right — it held the wet 18 dB down and
    // made every move inaudible — but nothing downstream now catches a return
    // ridden to 1.0 against an already-saturating bus.
    const clamped = clampRide({ param: 'dub.returnGain', target: 1, bars: 4, curve: 'ease', returns: true });
    expect(clamped.target).toBe(MACHINE_RIDE_CEILING['dub.returnGain']);
    expect(clamped.target).toBeLessThan(1);
  });

  it('leaves a target already under the ceiling alone', () => {
    const ride = { param: 'dub.returnGain', target: 0.4, bars: 4, curve: 'ease' as const, returns: true };
    expect(clampRide(ride)).toEqual(ride);
  });

  it('does not clamp what it has no ceiling for', () => {
    const ride = { param: 'dub.channelSend.ch0', target: 1, bars: 2, curve: 'ease' as const, returns: false };
    expect(clampRide(ride).target).toBe(1);
  });
});

/**
 * What comes home and what does not.
 */
describe('which rides return', () => {
  const rideFor = (persona: keyof typeof AUTO_DUB_PERSONAS) =>
    chooseRide(ctx({ persona: AUTO_DUB_PERSONAS[persona] }), willRide())!;

  it('a bus parameter is borrowed, not taken', () => {
    // The bus tone belongs to the mix. A hand that moves it gives it back.
    expect(rideFor('tubby').returns, 'hpfCutoff').toBe(true);
    expect(rideFor('scientist').returns, 'returnGain').toBe(true);
  });

  it('a channel send may be left open', () => {
    // Opening a channel into the echo and leaving it there is a real dub
    // decision, and the performer's own fader is what undoes it.
    expect(rideFor('jammy').param).toMatch(/^dub\.channelSend\./);
    expect(rideFor('jammy').returns).toBe(false);
  });
});

/**
 * A send that is already closed has nothing to give.
 */
describe('a dub send is not a symmetric control', () => {
  it('rides a nearly-closed send UP, never further down', () => {
    // Riding a send down starves the bus of the signal the effects work on,
    // and a one-way send ride leaves it there. Measured 2026-09-23: three of
    // four sends walked down to near zero and the desk went quiet.
    for (const current of [0, 0.1, 0.3]) {
      const r = chooseRide(ctx({
        persona: AUTO_DUB_PERSONAS.jammy,      // reaches for channelSend
        currentValue: () => current,
      }), willRide())!;
      expect(r.param).toMatch(/^dub\.channelSend\./);
      expect(r.target, `from ${current}`).toBeGreaterThan(current);
    }
  });
});
