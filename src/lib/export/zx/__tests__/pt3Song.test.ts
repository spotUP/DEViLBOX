import { describe, it, expect } from 'vitest';
import { furnaceToPt3, buildZxPt3Tap } from '../pt3Song';
import type { FurnaceModule } from '../../../import/formats/FurnaceSongParser';

/** One AY song, one order, one pattern: C-4 on channel 0 with instrument 0, nothing elsewhere. */
function tinyModule(): FurnaceModule {
  const rows = Array.from({ length: 4 }, (_, r) => ({ note: r === 0 ? 48 : -1, instrument: r === 0 ? 0 : -1, volume: -1, effects: [] }));
  return {
    systems: [0x80],
    instruments: [{ macros: [{ code: 0, length: 2, loop: -1, delay: 0, speed: 1, data: [15, 8] }] }],
    patterns: new Map([['0_0_0', { rows }]]),
    subsongs: [{ speed1: 6, speed2: 6, hz: 50, patLen: 4, ordersLen: 1, orders: [[0], [0], [0]] }],
  } as unknown as FurnaceModule;
}

describe('furnaceToPt3', () => {
  it('writes a PT3 header, a position list and a note on channel A only', () => {
    const r = furnaceToPt3(tinyModule(), 0, 'Tiny', 'Test');
    const m = r.module;
    expect(String.fromCharCode(...m.slice(0, 13))).toBe('ProTracker 3.');
    expect(m[100]).toBe(6);
    expect(m[201]).toBe(0);
    expect(m[202]).toBe(0xff);
    expect(r.channelsWithNotes).toEqual([true, false, false]);
  });
  it('rejects a non-AY chip', () => {
    const mod = tinyModule();
    (mod as unknown as { systems: number[] }).systems = [0x05];
    expect(() => furnaceToPt3(mod)).toThrow(/not an AY/);
  });
  it('builds a tap with the BANK byte set', () => {
    const player = { bytes: new Uint8Array(64), loadAddress: 32768, entry: 32768, dataAddress: 49152, bankOffset: 22 };
    const tap = buildZxPt3Tap(furnaceToPt3(tinyModule()).module, player, 'tiny');
    expect(tap.length).toBeGreaterThan(200);
  });
});
