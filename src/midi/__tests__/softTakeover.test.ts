import { describe, it, expect } from 'vitest';
import {
  takeover,
  initialTakeover,
  releaseTakeover,
  TakeoverBook,
  TAKEOVER_EPSILON,
} from '../softTakeover';

/**
 * "when i pull the knobs on the behringer compact they reset and start from 0"
 * (2026-09-23).
 *
 * An absolute MIDI control sends its OWN position, which has no reason to
 * match the value it points at. The knob sits at 0, Return Gain sits at 0.75,
 * and the first tick slammed the return to nothing — mid-take, that is the
 * echo collapsing because a hand brushed a knob.
 */
describe('takeover', () => {
  it('ignores a knob that is nowhere near the value', () => {
    // The whole bug: knob at 0, value at 0.75, and the knob wins.
    const { accept, next } = takeover(initialTakeover(), 0, 0.75);
    expect(accept, 'a knob at 0 must not drag 0.75 down to it').toBe(false);
    expect(next.engaged).toBe(false);
  });

  it('hands over once the knob reaches the value', () => {
    let state = initialTakeover();
    for (const pos of [0, 0.2, 0.5, 0.7]) {
      state = takeover(state, pos, 0.75).next;
    }
    const caught = takeover(state, 0.75, 0.75);
    expect(caught.accept).toBe(true);
    expect(caught.next.engaged).toBe(true);
  });

  it('hands over when the knob sweeps PAST the value', () => {
    // A fast turn can step straight over the target. Making the performer
    // come back for it would be worse than the bug.
    const state = takeover(initialTakeover(), 0.6, 0.75).next;
    expect(takeover(state, 0.9, 0.75).accept).toBe(true);
  });

  it('keeps control once it has it', () => {
    const engaged = takeover(initialTakeover(), 0.75, 0.75).next;
    expect(takeover(engaged, 0.1, 0.75).accept).toBe(true);
    expect(takeover(engaged, 1.0, 0.2).accept).toBe(true);
  });

  it('counts within one MIDI step as caught up', () => {
    expect(takeover(initialTakeover(), 0.5 + TAKEOVER_EPSILON, 0.5).accept).toBe(true);
    expect(takeover(initialTakeover(), 0.5 + TAKEOVER_EPSILON * 3, 0.5).accept).toBe(false);
  });

  it('catches on the first tick when the value is already where the knob is', () => {
    // Which is also what a RELATIVE encoder looks like, so takeover is
    // harmless on a device configured that way.
    expect(takeover(initialTakeover(), 0, 0).accept).toBe(true);
  });
});

describe('releaseTakeover', () => {
  it('makes a knob catch up again after the value moved elsewhere', () => {
    // Otherwise a knob that took a parameter at boot keeps it for ever, and
    // the next touch after an AutoDub ride yanks the value back.
    const engaged = takeover(initialTakeover(), 0.5, 0.5).next;
    const released = releaseTakeover(engaged);
    expect(released.engaged).toBe(false);
    expect(takeover(released, 0.9, 0.2).accept, 'must catch up again').toBe(false);
  });
});

describe('TakeoverBook', () => {
  it('tracks each control separately', () => {
    const book = new TakeoverBook();
    expect(book.accept('cc10', 0.5, 0.5)).toBe(true);   // catches
    expect(book.accept('cc11', 0.0, 0.8)).toBe(false);  // does not
    expect(book.engaged('cc10')).toBe(true);
    expect(book.engaged('cc11')).toBe(false);
  });

  it('releases one control without disturbing the others', () => {
    const book = new TakeoverBook();
    book.accept('cc10', 0.5, 0.5);
    book.accept('cc11', 0.5, 0.5);
    book.release('cc10');
    expect(book.engaged('cc10')).toBe(false);
    expect(book.engaged('cc11')).toBe(true);
  });

  it('releases everything on a preset or layer change', () => {
    const book = new TakeoverBook();
    book.accept('cc10', 0.5, 0.5);
    book.accept('cc11', 0.5, 0.5);
    book.releaseAll();
    expect(book.engaged('cc10')).toBe(false);
    expect(book.engaged('cc11')).toBe(false);
  });

  it('is unknown-control safe', () => {
    expect(new TakeoverBook().engaged('never-seen')).toBe(false);
  });
});
