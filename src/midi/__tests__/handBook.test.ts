/**
 * "the auto dub does it, it doesn't let me override" (2026-09-23).
 *
 * A ride is allowed to take any parameter no hand is on. `getHeldDubParams`
 * asked a `TakeoverBook` that nothing had fed since soft takeover was removed
 * earlier the same day, so it always answered "no hands anywhere" — and
 * AutoDub reached straight past the performer for the knob being turned and
 * dragged it back along its own curve.
 *
 * A motorised fader has a touch sensor and says so itself. An encoder has
 * nothing, so its own traffic is the only evidence a hand is there.
 */
import { describe, it, expect } from 'vitest';
import { HandBook, HAND_ON_CONTROL_MS } from '../handBook';

describe('a control that is sending is a control under a hand', () => {
  it('reports a parameter as held the moment its knob moves', () => {
    const book = new HandBook();
    book.note('dub.returnGain', 1000);
    expect(book.holds('dub.returnGain', 1000)).toBe(true);
    expect(book.held(1000)).toEqual(['dub.returnGain']);
  });

  it('keeps holding it through the pause between two turns', () => {
    // A hand resting mid-gesture is still a hand. Letting go the instant the
    // messages stop would hand the knob back to the machine between turns,
    // which is the same fight in smaller pieces.
    const book = new HandBook();
    book.note('dub.returnGain', 1000);
    expect(book.holds('dub.returnGain', 1000 + HAND_ON_CONTROL_MS - 1)).toBe(true);
  });

  it('lets go once the control has gone quiet', () => {
    const book = new HandBook();
    book.note('dub.returnGain', 1000);
    expect(book.holds('dub.returnGain', 1000 + HAND_ON_CONTROL_MS + 1)).toBe(false);
  });

  it('holds only the control being touched, not its neighbours', () => {
    const book = new HandBook();
    book.note('dub.returnGain', 1000);
    expect(book.holds('dub.echoIntensity', 1000)).toBe(false);
  });

  it('follows a hand that moves from one control to the next', () => {
    const book = new HandBook();
    book.note('dub.returnGain', 1000);
    book.note('dub.springWet', 1000 + HAND_ON_CONTROL_MS + 10);
    const held = book.held(1000 + HAND_ON_CONTROL_MS + 10);
    expect(held).toEqual(['dub.springWet']);
  });

  it('forgets what has gone cold instead of growing all session', () => {
    const book = new HandBook();
    for (let i = 0; i < 50; i++) book.note(`dub.p${i}`, 1000);
    expect(book.held(1000)).toHaveLength(50);
    expect(book.held(1000 + HAND_ON_CONTROL_MS + 1)).toHaveLength(0);
    // The second reading proves they were dropped, not merely filtered out.
    expect(book.held(1000)).toHaveLength(0);
  });
});
