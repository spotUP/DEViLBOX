import { describe, it, expect } from 'vitest';
import { deriveLiveNoteFlags, LIVE_ACCENT_VELOCITY_THRESHOLD } from '../../midi/liveNoteFlags';

/**
 * Live MIDI 303 conventions (TB-3PO / schwung-303): velocity >= 100 = accent,
 * legato overlap = slide (monophonic only). Regression for the live-input
 * path that previously dropped both flags.
 */
describe('deriveLiveNoteFlags', () => {
  it('velocity at or above 100 is an accent', () => {
    expect(deriveLiveNoteFlags(100, 0, false).accent).toBe(true);
    expect(deriveLiveNoteFlags(127, 0, false).accent).toBe(true);
    expect(LIVE_ACCENT_VELOCITY_THRESHOLD).toBe(100);
  });

  it('velocity below 100 is not an accent', () => {
    expect(deriveLiveNoteFlags(99, 0, false).accent).toBe(false);
    expect(deriveLiveNoteFlags(72, 0, false).accent).toBe(false);
  });

  it('legato overlap slides in monophonic mode', () => {
    expect(deriveLiveNoteFlags(80, 1, false).slide).toBe(true);
    expect(deriveLiveNoteFlags(80, 3, false).slide).toBe(true);
  });

  it('no overlap means no slide', () => {
    expect(deriveLiveNoteFlags(80, 0, false).slide).toBe(false);
  });

  it('polyphonic mode never slides', () => {
    expect(deriveLiveNoteFlags(80, 2, true).slide).toBe(false);
  });
});
