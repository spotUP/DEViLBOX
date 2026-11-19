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
  it('encodes an E1 slide on a row with no note as PT3 glissando, not a lossy effect', () => {
    const plain = furnaceToPt3(tinyModule());
    const mod = tinyModule();
    const rows = (mod.patterns.get('0_0_0') as unknown as { rows: { effects: { type: number; value: number }[] }[] }).rows;
    rows[1].effects = [{ type: 0xe1, value: 0x13 }];
    const r = furnaceToPt3(mod);
    expect(r.lossy.some((x) => x.startsWith('effect E1'))).toBe(false);
    expect(r.module.length).toBeGreaterThan(plain.module.length);
    // linearPitch 1 before format 237 is partial linearity: Furnace slides the AY period, a different glissando.
    Object.assign(mod as unknown as Record<string, unknown>, { version: 228, compatFlags: { linearPitch: 1 } });
    const partial = furnaceToPt3(mod);
    expect(partial.lossy.some((x) => x.startsWith('effect E1'))).toBe(false);
    expect(Buffer.from(partial.module).equals(Buffer.from(r.module))).toBe(false);
  });
  it('plays macros up to their release point and holds there, as Furnace does until note release', () => {
    // "Drifting in Colour" ELd Saw: tone+envelope wave, +19 arp, auto-envelope 1/6, all with release 0 then a plain-tone tail.
    const mac = (code: number, data: number[], release: number) => ({ code, length: data.length, loop: 255, release, delay: 0, speed: 1, data });
    const withMacros = (macros: unknown[]): FurnaceModule => Object.assign(tinyModule(), { instruments: [{ macros }] });
    const released = (arp: number, rel: number) => withMacros([mac(3, [5, 1], rel), mac(1, [arp, 0], rel), mac(6, [8], 255), mac(7, [1], 255), mac(8, [6], 255)]);
    const held = (arp: number) => withMacros([mac(3, [5], 255), mac(1, [arp], 255), mac(6, [8], 255), mac(7, [1], 255), mac(8, [6], 255)]);
    const bytes = (r: { module: Uint8Array }) => Buffer.from(r.module);
    for (const clock of [1773400, 1500000]) {
      const r = furnaceToPt3(released(19, 0), 0, '', '', clock);
      expect(bytes(r).equals(bytes(furnaceToPt3(held(19), 0, '', '', clock)))).toBe(true);
      expect(bytes(r).equals(bytes(furnaceToPt3(released(19, 255), 0, '', '', clock)))).toBe(false);
      expect(r.lossy.some((x) => x.startsWith('auto-envelope with arpeggio'))).toBe(false);
      // The auto-envelope period follows the held +19 step: a third of the period without the arp.
      const envPeriod = (m: Uint8Array) => { const i = m.indexOf(0x18, 201); return (m[i + 1] << 8) | m[i + 2]; };
      expect(envPeriod(furnaceToPt3(held(0), 0, '', '', clock).module) / envPeriod(r.module)).toBeCloseTo(2 ** (19 / 12), 0); // integer periods: 159 / 52
    }
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
