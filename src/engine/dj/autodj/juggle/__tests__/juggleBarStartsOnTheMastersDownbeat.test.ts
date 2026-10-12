/**
 * A juggle that starts on a bar starts on the master's downbeat, not on a
 * multiple of four beats: when the track's first detected beat is not beat 1
 * (the downbeat grid's phaseOffset), beat 0 is not a downbeat (the scratch
 * audit's SA-M1, the same assumption; fixed through the one bar -> beat
 * mapping, barStartBeat). Used by the short stand-alone patterns
 * (nextBarStartBeat) and the juggle transition's ladder start.
 */
import { describe, it, expect } from 'vitest';
import { downbeatAtOrAfter, nextBarStartBeat } from '../jugglePlanner';
import type { DJJugglePerformanceContext } from '../juggleTypes';

/** A 4/4 grid whose bars start on beats 1, 5, 9, ... (the first detected beat is the bar's last beat). */
function ctxAt(masterBeat: number): DJJugglePerformanceContext {
  const bars = Array.from({ length: 16 }, (_, i) => ({ index: i, start: (1 + 4 * i) * 0.5, beats: [1 + 4 * i, 2 + 4 * i, 3 + 4 * i, 4 + 4 * i] }));
  const analysis = { downbeats: { bars, meter: { beatsPerBar: 4 }, phaseOffset: 1 } };
  const deck = { analysis };
  return { masterDeck: 'A', deckA: deck, deckB: deck, masterBar: Math.max(0, Math.floor((masterBeat - 1) / 4)), beatsPerBar: 4, masterBeat } as unknown as DJJugglePerformanceContext;
}

describe('juggle bar starts sit on the master\'s downbeats', () => {
  it('the next bar two beats ahead of beat 3.5 is beat 9, not beat 8', () => {
    expect(nextBarStartBeat(ctxAt(3.5), 2)).toBe(9);
  });
  it('a ladder start within a quarter beat of a downbeat is that downbeat', () => {
    expect(downbeatAtOrAfter(ctxAt(13.1), 13.1 - 0.25)).toBe(13);
    expect(downbeatAtOrAfter(ctxAt(13.4), 13.4 - 0.25)).toBe(17);
  });
});
