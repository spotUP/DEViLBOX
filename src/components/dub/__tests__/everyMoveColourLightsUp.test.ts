import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "ui button does not light up the midi controller does" — Riddim, 2026-09-23.
 *
 * The move buttons' active state comes from `colorClasses`, a switch over
 * literal Tailwind classes keyed by the move's colour token. Five tokens in
 * use had no case and fell to the idle default, so Riddim, Float, Build,
 * Emph and Liquid never showed they were held or firing. The controller's
 * LED was right; the screen was wrong.
 *
 * The token is a union type now and the switch ends in `never`, so a token
 * without a case fails type-check. This pins the same thing from the source
 * in case the default ever grows lenient again.
 */
const DECK = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');

describe('every move colour has an active state', () => {
  const used = new Set((DECK.match(/color: '([a-z-]+(?:\/\d+)?)'/g) ?? []).map((m) => m.slice(8, -1)));
  const cases = new Set((DECK.match(/case '([a-z-]+(?:\/\d+)?)':/g) ?? []).map((m) => m.slice(6, -2)));

  it('finds the tokens the moves use', () => {
    expect(used.size).toBeGreaterThan(10);
  });

  it('has a colorClasses case for each of them', () => {
    for (const token of used) {
      expect(cases.has(token), `no active-state classes for '${token}'`).toBe(true);
    }
  });

  it('the ones that were dark: Riddim, Float, Build, Emph, Liquid', () => {
    for (const token of ['accent-error/60', 'accent-highlight/40', 'accent-primary/50', 'accent-primary/40', 'accent-secondary/80']) {
      expect(cases.has(token), token).toBe(true);
    }
  });

  it('a missing case is a type error, not a silent idle button', () => {
    expect(DECK).toContain('const missing: never = token;');
  });
});
