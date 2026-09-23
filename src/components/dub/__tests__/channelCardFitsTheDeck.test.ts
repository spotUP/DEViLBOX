import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "the sliders dont fit not even in fullscreen" — 2026-09-23, asked several
 * times, with a screenshot.
 *
 * Each channel card stacked its role select, filter select, two knobs, NINE
 * full-size op buttons and then the fader, one column, ~600 px tall, inside a
 * deck capped at 60 % of the viewport. Every card was clipped at the top and
 * the fader was a stub.
 *
 * Owner chose: ops as a compact 3x3 grid beside the fader, role and filter
 * on one row. Three button rows instead of nine set the card height.
 */
const DECK = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');

describe('the channel card fits the deck', () => {
  it('lays the nine ops out as a 3x3 grid, on the master card and on every channel card', () => {
    const grids = DECK.match(/<div className="grid grid-cols-3 gap-1 w-full">\s*\{CHANNEL_OPS\.map/g) ?? [];
    expect(grids.length, 'master + channel').toBe(2);
  });

  it('uses the compact button size for the ops, so three fit across a card', () => {
    const compact = DECK.match(/colorClasses\(op\.color, active, 'sm'\)/g) ?? [];
    expect(compact.length, 'master + channel').toBe(2);
    expect(DECK).toContain("size === 'sm'");
  });

  it('keeps the two cards the same width, wide enough for three buttons and the fader', () => {
    const cards = DECK.match(/rounded border w-48 shrink-0/g) ?? [];
    expect(cards.length, 'master + channel').toBe(2);
    expect(DECK, 'the old single-column width is back').not.toMatch(/rounded border w-32 shrink-0/);
  });

  it('puts the role select and the filter select on one row', () => {
    expect(DECK).toContain('{/* Role and filter share a row — one row fewer in the card. */}');
  });
});
