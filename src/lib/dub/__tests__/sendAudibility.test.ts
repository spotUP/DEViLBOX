/**
 * The BLEED floor is not a send.
 *
 * With BLEED on, every closed channel sits at 0.015. The deck's `anySend`
 * counted that as open, so the return processors were never dimmed and the
 * "raise a CH send to hear" hint never showed — the moves ran on near-silence
 * (busInput 0.0077, 2026-09-23) and were reported dead.
 */
import { describe, it, expect } from 'vitest';
import { sendIsAudible, anySendAudible, GHOST_SEND_FLOOR } from '../sendAudibility';

describe('sendIsAudible', () => {
  it('does not count the BLEED floor as a send', () => {
    expect(sendIsAudible(GHOST_SEND_FLOOR)).toBe(false);
    expect(sendIsAudible(0.015)).toBe(false);
  });

  it('does not count a closed send', () => {
    expect(sendIsAudible(0)).toBe(false);
    expect(sendIsAudible(undefined)).toBe(false);
    expect(sendIsAudible(null)).toBe(false);
  });

  it('counts a performer send', () => {
    expect(sendIsAudible(0.1)).toBe(true);
    expect(sendIsAudible(0.6)).toBe(true);
    expect(sendIsAudible(0.96)).toBe(true);
  });
});

describe('anySendAudible', () => {
  it('is false for the state that was reported dead: four channels at the floor', () => {
    // The owner's deck on 2026-09-23 with BLEED on and nothing raised.
    expect(anySendAudible([0, 0.015, 0.015, 0.015])).toBe(false);
  });

  it('is true once any one channel is raised', () => {
    expect(anySendAudible([0, 0.015, 0.6, 0.015])).toBe(true);
  });

  it('is false with no channels', () => {
    expect(anySendAudible([])).toBe(false);
  });
});

/**
 * And the wiring: the deck has to ask THIS question for the hint, and keep
 * asking the raw one for the ALL / NONE button and the echo drain.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('the dub deck asks the right question in each place', () => {
  const DECK = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');

  it('dims and hints from audibility, not from any non-zero send', () => {
    const hintSites = DECK.match(/const noSend = !!m\.needsSend && !(\w+);/g) ?? [];
    expect(hintSites.length, 'the three move rows').toBe(3);
    for (const site of hintSites) {
      expect(site, 'a hint site still counts the BLEED floor as a send').toContain('!anyAudibleSend');
    }
  });

  it('keeps the raw send for ALL / NONE and the drain', () => {
    // These are about whether any value is non-zero, floor included.
    expect(DECK).toContain("{anySend ? 'NONE' : 'ALL'}");
    expect(DECK).toContain('if (wasActive && !anySend && busEnabled)');
  });

  it('leaves the BLEED floor to the engine, not the deck\'s faders', () => {
    // The floor is applied at the tap (effectiveDubSend); the deck writing it
    // into the store is what moved every closed fader to 1.5 % and made BLEED
    // depend on the deck being on screen.
    expect(DECK).not.toContain('GHOST_SEND_FLOOR');
    expect(DECK, 'a literal 0.015 crept back into the deck').not.toMatch(/[^\d.]0\.015[^\d]/);
  });
});
