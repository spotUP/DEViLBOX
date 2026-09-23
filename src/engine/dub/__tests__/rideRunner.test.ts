import { describe, it, expect } from 'vitest';
import {
  rideProgress,
  rideValueAt,
  tickRide,
  RideBook,
  RIDE_CEILING_MS,
  type ActiveRide,
} from '../rideRunner';
import { clampRide, type AutoDubRide } from '../chooseRide';

const ride = (over: Partial<AutoDubRide> = {}): AutoDubRide => ({
  param: 'dub.returnGain',
  target: 1,
  bars: 4,
  curve: 'linear',
  // One-way by default in these tests, so the existing assertions read as
  // written. The excursion behaviour has its own describe block below.
  returns: false,
  ...over,
});

const active = (over: Partial<ActiveRide> = {}): ActiveRide => ({
  ride: ride(),
  from: 0,
  startBar: 10,
  startedAtMs: 1000,
  ...over,
});

const at = (bar: number, nowMs = 1000, held: string[] = []) => ({
  bar, nowMs, heldParams: new Set(held),
});

describe('rideProgress — the shape of a hand', () => {
  it('linear travels evenly', () => {
    expect(rideProgress('linear', 0.25)).toBeCloseTo(0.25);
    expect(rideProgress('linear', 0.75)).toBeCloseTo(0.75);
  });

  it('ease leaves slowly and arrives slowly', () => {
    // A hand does not start at full speed.
    expect(rideProgress('ease', 0.25)).toBeLessThan(0.25);
    expect(rideProgress('ease', 0.75)).toBeGreaterThan(0.75);
    expect(rideProgress('ease', 0.5)).toBeCloseTo(0.5);
  });

  it('step is a position, not a slide', () => {
    // Tubby's Big Knob. DSP-08 calls this "stepped".
    expect(rideProgress('step', 0.49)).toBe(0);
    expect(rideProgress('step', 0.51)).toBe(1);
  });

  it('every curve starts at nothing and ends at everything', () => {
    for (const curve of ['linear', 'ease', 'step'] as const) {
      expect(rideProgress(curve, 0), curve).toBe(0);
      expect(rideProgress(curve, 1), curve).toBe(1);
    }
  });

  it('clamps outside its own journey', () => {
    expect(rideProgress('linear', -0.5)).toBe(0);
    expect(rideProgress('ease', 1.5)).toBe(1);
  });
});

describe('rideValueAt', () => {
  it('travels from where the hand landed to where it is going', () => {
    expect(rideValueAt(0.2, ride({ target: 0.8 }), 0)).toBeCloseTo(0.2);
    expect(rideValueAt(0.2, ride({ target: 0.8 }), 1)).toBeCloseTo(0.8);
    expect(rideValueAt(0.2, ride({ target: 0.8 }), 0.5)).toBeCloseTo(0.5);
  });

  it('rides downward as readily as up', () => {
    expect(rideValueAt(0.9, ride({ target: 0.1 }), 0.5)).toBeCloseTo(0.5);
  });
});

describe('tickRide', () => {
  it('moves while it is under way', () => {
    const out = tickRide(active(), at(12));   // 2 of 4 bars
    expect(out.kind).toBe('move');
    expect(out.kind === 'move' && out.value).toBeCloseTo(0.5);
  });

  it('finishes exactly on its target, not near it', () => {
    // Floating point on the last tick must not leave the value a hair short.
    const out = tickRide(active(), at(14));
    expect(out.kind).toBe('done');
    expect(out.kind === 'done' && out.value).toBe(1);
  });

  it('abandons the moment a hand lands on the control', () => {
    // Pausing and resuming under a hand that has moved on is a fight.
    const out = tickRide(active(), at(12, 1000, ['dub.returnGain']));
    expect(out).toEqual({ kind: 'abandoned', param: 'dub.returnGain', why: 'hand' });
  });

  it('ignores a hand on some OTHER control', () => {
    expect(tickRide(active(), at(12, 1000, ['dub.hpfCutoff'])).kind).toBe('move');
  });

  it('gives up when real time runs out, however few bars have passed', () => {
    // Bars stop advancing when the transport stops. A ride measured only in
    // bars would then never end — the failure that left transportTapeStop
    // holding the transport in slow motion indefinitely.
    const out = tickRide(active(), at(10, 1000 + RIDE_CEILING_MS + 1));
    expect(out).toEqual({ kind: 'abandoned', param: 'dub.returnGain', why: 'timeout' });
  });

  it('survives a zero-bar ride instead of dividing by it', () => {
    const out = tickRide(active({ ride: ride({ bars: 0 }) }), at(10));
    expect(out.kind).toBe('done');
  });
});

describe('RideBook', () => {
  it('runs a ride to completion and then forgets it', () => {
    const book = new RideBook();
    expect(book.start(ride(), 0, 10, 1000)).toBe(true);
    expect(book.isRiding('dub.returnGain')).toBe(true);

    expect(book.tick(at(12))[0].kind).toBe('move');
    expect(book.isRiding('dub.returnGain')).toBe(true);

    expect(book.tick(at(14))[0].kind).toBe('done');
    expect(book.isRiding('dub.returnGain'), 'a finished ride must let go').toBe(false);
  });

  it('gives one parameter one hand', () => {
    // Two journeys writing the same value from different starting points reads
    // as a fight, not a performance.
    const book = new RideBook();
    expect(book.start(ride(), 0, 10, 1000)).toBe(true);
    expect(book.start(ride({ target: 0.2 }), 0.9, 10, 1000)).toBe(false);
    expect(book.active).toHaveLength(1);
  });

  it('lets a parameter be ridden again once the first ride ends', () => {
    const book = new RideBook();
    book.start(ride(), 0, 10, 1000);
    book.tick(at(14));
    expect(book.start(ride(), 1, 14, 2000)).toBe(true);
  });

  it('runs several parameters at once', () => {
    const book = new RideBook();
    book.start(ride({ param: 'dub.returnGain' }), 0, 10, 1000);
    book.start(ride({ param: 'dub.channelSend.ch2' }), 0, 10, 1000);
    expect(book.tick(at(12))).toHaveLength(2);
    expect(book.active).toHaveLength(2);
  });

  it('drops an abandoned ride rather than retrying it', () => {
    const book = new RideBook();
    book.start(ride(), 0, 10, 1000);
    expect(book.tick(at(12, 1000, ['dub.returnGain']))[0].kind).toBe('abandoned');
    expect(book.isRiding('dub.returnGain')).toBe(false);
  });

  it('clears everything on a stop', () => {
    const book = new RideBook();
    book.start(ride({ param: 'a' }), 0, 10, 1000);
    book.start(ride({ param: 'b' }), 0, 10, 1000);
    book.clear();
    expect(book.active).toHaveLength(0);
  });
});

/**
 * A ride comes BACK.
 *
 * The first version only travelled, so every ride left its parameter wherever
 * the journey ended. A few minutes of that walks the desk into a corner: the
 * high-pass was measured parked at 410 Hz, which takes the whole low end out
 * of the dub send, and the owner reported "the desk is almost dead"
 * (2026-09-23).
 *
 * The master plan's phrase already said it — `short send gesture -> feedback
 * ride -> RELEASE`. A dub gesture is an excursion.
 */
describe('a returning ride is an excursion', () => {
  const excursion = ride({ returns: true, target: 1, curve: 'linear' });

  it('goes out and comes back', () => {
    expect(rideValueAt(0.2, excursion, 0)).toBeCloseTo(0.2);     // starts home
    expect(rideValueAt(0.2, excursion, 0.5)).toBeCloseTo(1);     // out at the top
    expect(rideValueAt(0.2, excursion, 1)).toBeCloseTo(0.2);     // home again
  });

  it('ends exactly where it started, not near it', () => {
    const out = tickRide(active({ ride: excursion, from: 0.2 }), at(14));
    expect(out.kind).toBe('done');
    expect(out.kind === 'done' && out.value).toBe(0.2);
  });

  it('leaves a one-way ride on its target', () => {
    // A channel send may be LEFT open — that is a real dub decision, and the
    // performer's own fader is what undoes it.
    const out = tickRide(active({ ride: ride({ returns: false }) }), at(14));
    expect(out.kind === 'done' && out.value).toBe(1);
  });

  it('never parks the high-pass where the low end is gone', () => {
    // 20 + 0.25 * 980 = 265 Hz. Above that the dub send has no low end to
    // put into the echo, which is the entire point of the send.
    const clamped = clampRide({
      param: 'dub.hpfCutoff', target: 1, bars: 8, curve: 'step', returns: true,
    });
    expect(clamped.target).toBeLessThanOrEqual(0.25);
  });
});

/**
 * An interrupted ride gives its parameter back.
 *
 * Dropping rides on the floor is not enough. Two failures on 2026-09-23, both
 * from a ride that stopped mid-journey and left its parameter where it lay:
 *
 *  - A one-way high-pass ride persisted 410 Hz into the SAVED settings, so the
 *    next song booted with the whole low end filtered out of the dub send.
 *  - Rides that had opened channel sends left those channels routed into a bus
 *    that was then unwired, and all audio went silent.
 */
describe('releaseAll hands every parameter back', () => {
  it('returns each ride to where the hand found it', () => {
    const book = new RideBook();
    book.start(ride({ param: 'dub.hpfCutoff', target: 1 }), 0.04, 10, 1000);
    book.start(ride({ param: 'dub.channelSend.ch1', target: 0.85 }), 0, 10, 1000);

    expect(book.releaseAll()).toEqual([
      { param: 'dub.hpfCutoff', value: 0.04 },
      { param: 'dub.channelSend.ch1', value: 0 },
    ]);
  });

  it('empties the book, so nothing keeps writing after the stop', () => {
    const book = new RideBook();
    book.start(ride(), 0.3, 10, 1000);
    book.releaseAll();
    expect(book.active).toHaveLength(0);
    expect(book.tick(at(12))).toHaveLength(0);
  });

  it('is safe with nothing in flight', () => {
    expect(new RideBook().releaseAll()).toEqual([]);
  });
});
