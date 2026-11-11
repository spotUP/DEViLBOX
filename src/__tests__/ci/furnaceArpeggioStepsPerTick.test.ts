/**
 * A cell arpeggio (047) on a Furnace chip channel of a tracker-made song was silent: the router
 * turned it into a HINT_ARPEGGIO annotation a chip ignores, and nothing stepped it per tick.
 * Upstream (playback.cpp:2519-2541) sends DIV_CMD_LEGATO with note, note+x, note+y on every tick
 * (arpLen 1), starting on the first tick of the row.
 */
import { describe, it, expect } from 'vitest';
import { FurnaceTickEffects } from '@/engine/furnace-dispatch/FurnaceTickEffects';
import { DivCmd } from '@/engine/furnace-dispatch/FurnaceDispatchEngine';

const SPEED = 6;
const BASE = 48;

/** Play rows at SPEED ticks; returns the LEGATO notes sent per row, in tick order. */
function play(rows: Array<{ note: number | null; arp: number | null }>): number[][] {
  const fx = new FurnaceTickEffects();
  return rows.map((r) => {
    const sent = fx.beginRow(0, r.note, r.arp).filter((c) => c.cmd === DivCmd.LEGATO).map((c) => c.val1);
    for (let t = 0; t < SPEED; t++) {
      for (const c of fx.tick(0)) {
        expect(c.cmd).toBe(DivCmd.LEGATO);
        sent.push(c.val1);
      }
    }
    return sent;
  });
}

describe('Furnace arpeggio on a chip channel', () => {
  it('steps base, +4, +7 on consecutive ticks of a 047 row', () => {
    const [row] = play([{ note: BASE, arp: 0x47 }]);
    expect(row).toEqual([BASE, BASE + 4, BASE + 7, BASE, BASE + 4, BASE + 7]);
  });

  it('keeps stepping on a following 047 row and returns to the base note when the effect ends', () => {
    const rows = play([
      { note: BASE, arp: 0x47 },
      { note: null, arp: 0x47 },
      { note: null, arp: null },
    ]);
    expect(rows[1]).toEqual([BASE, BASE + 4, BASE + 7, BASE, BASE + 4, BASE + 7]);
    // the row without the effect: one LEGATO to the base note, then nothing
    expect(rows[2]).toEqual([BASE]);
  });

  it('sends nothing for a row without arpeggio', () => {
    expect(play([{ note: BASE, arp: null }, { note: null, arp: null }])).toEqual([[], []]);
  });

  it('treats 000 as no arpeggio', () => {
    expect(play([{ note: BASE, arp: 0 }])).toEqual([[]]);
  });

  it('honours the E0xx arpeggio speed', () => {
    const fx = new FurnaceTickEffects();
    fx.setArpSpeed(2);
    fx.beginRow(0, BASE, 0x47);
    const sent: number[] = [];
    for (let t = 0; t < 6; t++) for (const c of fx.tick(0)) sent.push(c.val1);
    // arpTicks starts at 1: the first tick steps, then every 2 ticks
    expect(sent).toEqual([BASE, BASE + 4, BASE + 7]);
  });
});
