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

  it('keeps the ops at full size — the deck grew instead ("let the dub deck be taller")', () => {
    const cards = DECK.match(/colorClasses\(op\.color, active\) \+ ' w-full text-center'/g) ?? [];
    expect(cards.length, 'master + channel').toBe(2);
    expect(DECK).toContain('max-h-[calc(var(--app-vh)*0.75)]');
  });

  it('keeps the two cards the same width, wide enough for three buttons and the fader', () => {
    const cards = DECK.match(/rounded border w-56 shrink-0/g) ?? [];
    expect(cards.length, 'master + channel').toBe(2);
    expect(DECK, 'the old single-column width is back').not.toMatch(/rounded border w-32 shrink-0/);
  });

  it('puts the role select and the filter select on one row', () => {
    expect(DECK).toContain('{/* Role and filter share a row — one row fewer in the card. */}');
  });

  it('gives the master card the same skeleton: ALL / NONE where a channel has its selects, fader column identical', () => {
    // ALL / NONE sits in the left column above the grid, not in the fader column.
    const master = DECK.slice(DECK.indexOf('>MASTER</span>'), DECK.indexOf('{/* Separator */}'));
    expect(master.indexOf("{anySend ? 'NONE' : 'ALL'}")).toBeLessThan(master.indexOf('grid grid-cols-3'));
    expect(master).toContain('the same column a channel card has');
  });
});

/**
 * "when the channel sliders reach 100% the component shrinks sideways"
 * (2026-09-23). The readout under the fader was content-sized; "100%" is
 * wider than "15%", the fader column (`shrink-0`) grew with it, and the op
 * grid beside it (`flex-1 min-w-0`) gave up the difference. The readout has
 * a fixed width so the fader column never changes width with the value.
 */
describe('the fader readout does not resize the card', () => {
  it('gives both readouts a fixed width', () => {
    const readouts = DECK.match(/className="w-7 text-center tabular-nums text-\[9px\] font-mono/g) ?? [];
    expect(readouts.length, 'master + channel').toBe(2);
  });
});
