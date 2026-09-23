import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "when i click a button connected to a hold button on the midi controller it
 * doesnt get held in the ui" (2026-09-23).
 *
 * The audio hold was real: the router fires on note-on and disposes on
 * note-off. The deck lights a button from its own pointer presses or from the
 * router's fire events, and the fire subscription put a 400 ms expiry on
 * every fire — hold or not — although the event carries `isHold`. A hold from
 * MIDI, AutoDub or a lane lit for 400 ms and went dark while still held.
 *
 * Holds now stay lit until their release event, and only until then.
 */
const DECK = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');

describe('a hold fired from outside the deck stays lit until it releases', () => {
  const sub = DECK.slice(DECK.indexOf('const unsubFire = subscribeDubRouter((ev) => {'), DECK.indexOf('const unsubRelease = subscribeDubRelease('));

  it('sets no expiry timer for a hold', () => {
    expect(sub).toContain('if (ev.isHold) return;');
    // The guard sits before the timer, not after it.
    expect(sub.indexOf('if (ev.isHold) return;')).toBeLessThan(sub.indexOf('setTimeout('));
  });

  it('still flashes a one-shot for 400 ms', () => {
    expect(sub).toContain('}, 400);');
  });

  it('clears the lit state on the release event', () => {
    const rel = DECK.slice(DECK.indexOf('const unsubRelease = subscribeDubRelease('), DECK.indexOf('return () => { unsubFire(); unsubRelease(); };'));
    expect(rel).toContain('n.delete(key)');
  });
});
