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
  /**
   * ONE 3x3 grid, not two.
   *
   * These asserted `2` — the master card and every channel card — until the
   * channel section was redesigned on 2026-09-23. A desk has one set of effect
   * controls and N strips; stamping the rack onto every channel drew 72
   * buttons on an eight-channel song. The ops live once now and act on the
   * channel your hand is on, so a SECOND grid is the defect these now guard
   * against.
   */
  it('lays the nine ops out as a 3x3 grid, once, on the shared op panel', () => {
    const grids = DECK.match(/<div className="grid grid-cols-3 gap-1 w-full">\s*\{CHANNEL_OPS\.map/g) ?? [];
    expect(grids.length, 'a second grid is a per-channel rack').toBe(1);
  });

  it('keeps the ops at full size — the deck grew instead ("let the dub deck be taller")', () => {
    const cards = DECK.match(/colorClasses\(op\.color, active\) \+ ' w-full text-center'/g) ?? [];
    expect(cards.length, 'the shared op panel').toBe(1);
    expect(DECK).toContain('max-h-[calc(var(--app-vh)*0.75)]');
  });

  /**
   * The two cards are no longer the same width, and that is the point.
   *
   * They were both `w-56` because three full-size op buttons across set the
   * width, and every channel carried those buttons. Since 2026-09-23 the ops
   * live once, on the shared panel, so only IT needs the room; a channel strip
   * is sized by what a desk channel actually has.
   *
   * 144 px is not a taste: it is what a channel gets in the controller layout's
   * fader zone — two of the descriptor's twenty-two grid units across an
   * eighteen-unit bank — so the strip fits the shape of the hardware it mirrors.
   */
  it('keeps the op panel wide enough for three buttons across', () => {
    const wide = DECK.match(/rounded border w-56 shrink-0/g) ?? [];
    expect(wide.length, 'the shared op panel, and nothing else').toBe(1);
  });

  it('narrows the channel strip to the width the hardware gives a channel', () => {
    // The width is the CALLER's now: the deck's own layout flows strips in a
    // row at a fixed 144 px, and the controller layout puts each strip in its
    // fader's grid column, where it fills that column exactly. A channel is
    // one column on the device — button above, fader, mute below — so the
    // strip cannot carry a width of its own and still line up.
    expect(DECK).toMatch(/renderChannelCard = \(i: number, widthClass = 'w-36 shrink-0'\)/);
    expect(DECK).toMatch(/rounded border \$\{widthClass\} transition-colors/);
    expect(DECK, 'a strip as wide as the op panel is the old rack').not.toMatch(
      /rounded border w-56 shrink-0 transition-colors/,
    );
  });

  it('gives the master its own strip for the ninth column', () => {
    // The master fader is at x 16 on the device, right of the eight channels,
    // with its own button under it: a ninth column the same width as the rest.
    expect(DECK).toMatch(/renderMasterStrip = \(widthClass = 'w-36 shrink-0'\)/);
  });

  it('stacks the role select and the filter select, which do not fit side by side at 144 px', () => {
    // 144 px minus padding, gap and the readout column leaves 90 px; two
    // selects in that is 43 px each, and "Filter off" does not fit in 43 px.
    expect(DECK).toContain('{/* Role and filter STACK.');
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
  it('gives every send readout a fixed width', () => {
    // Fixed, or "100%" is wider than "15%" and the fader column grows at full
    // send, squeezing what is beside it. Three now: the channel strip, the
    // master strip for the ninth column, and the deck's own master card.
    const readouts = DECK.match(/className="w-7 text-center tabular-nums text-\[9px\] font-mono/g) ?? [];
    expect(readouts.length, 'channel + master strip + master card').toBe(3);
  });
});
