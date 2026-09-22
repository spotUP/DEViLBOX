import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUB_MOVE_TABLE } from '@/engine/dub/moveTable';

/**
 * Every move the router can fire needs a way to fire it by hand.
 *
 * "i dont see any way to fire the riddim move" (2026-09-22), followed by "are
 * there any more buttons that are not wired up in the ui? add them all".
 * Three of the 45 moves in `DUB_MOVE_TABLE` had no control anywhere in the
 * deck — `riddimSection`, `echoBuildUp` and `bassEmphasis` — so they were
 * reachable only from AutoDub's own rules or over MCP.
 *
 * That is worse than a missing feature: `riddimSection` is offered by AutoDub
 * at one instant every 16 bars behind a weighted roll, so "I have never heard
 * it" and "it is broken" look identical from the outside, and the owner spent
 * a long time unable to tell which.
 *
 * A move may legitimately have no button — but then it says so here, out loud,
 * with a reason.
 */
const DECK = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');

/** Moves deliberately left without a control, each with its reason. */
const NO_CONTROL_BY_DESIGN: Readonly<Record<string, string>> = {
  // (empty — every move in the table is reachable by hand)
};

const wiredMoveIds = (): Set<string> =>
  new Set(Array.from(DECK.matchAll(/moveId:\s*'([a-zA-Z0-9]+)'/g), (m) => m[1]));

describe('every dub move can be fired by hand', () => {
  it('has a control in the dub deck, or a written exemption', () => {
    const wired = wiredMoveIds();
    const missing = DUB_MOVE_TABLE
      .filter((id) => !wired.has(id))
      .filter((id) => !(id in NO_CONTROL_BY_DESIGN));

    expect(
      missing,
      'These moves exist and fire, but nothing in the UI can reach them — so ' +
        '"never heard it" and "broken" are indistinguishable. Add a control, ' +
        'or add the move to NO_CONTROL_BY_DESIGN with a reason:\n' +
        missing.join('\n')
    ).toEqual([]);
  });

  it('the exemption list has no stale entries', () => {
    const wired = wiredMoveIds();
    const stale = Object.keys(NO_CONTROL_BY_DESIGN).filter((id) => wired.has(id));
    expect(stale, 'these are wired now and should come off the list').toEqual([]);
  });

  it('the three that were missing are wired', () => {
    const wired = wiredMoveIds();
    for (const id of ['riddimSection', 'echoBuildUp', 'bassEmphasis']) {
      expect(wired.has(id), `${id} lost its control again`).toBe(true);
    }
  });

  it('no control names a move the router does not have', () => {
    const table = new Set<string>(DUB_MOVE_TABLE);
    const unknown = [...wiredMoveIds()].filter((id) => !table.has(id));
    expect(unknown, 'a button that fires nothing').toEqual([]);
  });
});
