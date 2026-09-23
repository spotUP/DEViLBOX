import { describe, it, expect } from 'vitest';
import {
  rideProgress,
  rideValueAt,
  tickRide,
  RideBook,
  RIDE_CEILING_MS,
  type ActiveRide,
} from '../rideRunner';
import type { AutoDubRide } from '../chooseRide';

const ride = (over: Partial<AutoDubRide> = {}): AutoDubRide => ({
  param: 'dub.returnGain',
  target: 1,
  bars: 4,
  curve: 'linear',
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
