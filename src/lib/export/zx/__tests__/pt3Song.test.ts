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
  it('bakes a 0A volume slide and a later volume re-hit into the note sample', () => {
    // Drifting in Colour ch A: vol 15 + 0A0F on the note, vol 15 + 0A0F again two rows later without a note.
    const mod = Object.assign(tinyModule(), { instruments: [{ macros: [{ code: 0, length: 1, loop: -1, delay: 0, speed: 1, data: [15] }] }] });
    const rows = (mod.patterns.get('0_0_0') as unknown as { rows: { volume: number; effects: { type: number; value: number }[] }[] }).rows;
    for (const r of [0, 2]) { rows[r].volume = 15; rows[r].effects = [{ type: 0x0a, value: 0x0f }]; }
    (mod.subsongs[0] as unknown as { speed1: number; speed2: number }).speed1 = 3;
    (mod.subsongs[0] as unknown as { speed1: number; speed2: number }).speed2 = 3;
    const r = furnaceToPt3(mod);
    expect(r.lossy.filter((x) => /0A/.test(x))).toEqual([]);
    const m = r.module, ptr = m[105 + 2] | (m[106 + 2] << 8);
    const vols = Array.from({ length: m[ptr + 1] }, (_, f) => m[ptr + 2 + 4 * f + 1] & 15);
    // playback.cpp: vol 15 << 8 drops 0x3c0 per tick from the row's first tick; the cell volume on row 2 (tick 6) restarts it.
    expect(vols.slice(0, 10)).toEqual([11, 7, 3, 0, 0, 0, 11, 7, 3, 0]);
  });
  it('loops a periodic 0A re-hit fade on one period instead of storing every frame', () => {
    // Drifting in Colour ch A pattern: one note, then vol 15 + 0A0F re-hit every 2 rows to the pattern end.
    const mod = Object.assign(tinyModule(), { instruments: [{ macros: [{ code: 0, length: 1, loop: -1, delay: 0, speed: 1, data: [15] }] }] });
    const rows = Array.from({ length: 32 }, (_, r) => ({ note: r === 0 ? 48 : -1, instrument: r === 0 ? 0 : -1, volume: r % 2 ? -1 : 15, effects: r % 2 ? [] : [{ type: 0x0a, value: 0x0f }] }));
    mod.patterns.set('0_0_0', { rows } as never);
    Object.assign(mod.subsongs[0], { speed1: 3, speed2: 3, patLen: 32 });
    const m = furnaceToPt3(mod).module, ptr = m[105 + 2] | (m[106 + 2] << 8);
    const loop = m[ptr], len = m[ptr + 1];
    const vols = Array.from({ length: len }, (_, f) => m[ptr + 2 + 4 * f + 1] & 15);
    expect(len - loop).toBe(6); // one re-hit period: 2 rows of 3 ticks at 50 Hz
    expect(len).toBeLessThan(32 * 3);
    expect(vols.slice(loop)).toEqual([11, 7, 3, 0, 0, 0]);
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
  it('plays the volume macro release tail after a note release instead of cutting the note', () => {
    // Furnace std.release(): the macro leaves its release step and runs the tail; 253 is the hard note off.
    // Raw cell notes: 100 note off, 101 note release, 102 macro release.
    const withRelease = (nv: number): FurnaceModule => {
      const mod = Object.assign(tinyModule(), { instruments: [{ macros: [{ code: 0, length: 4, loop: -1, release: 1, delay: 0, speed: 1, data: [15, 15, 8, 4] }] }] });
      (mod.patterns.get('0_0_0') as unknown as { rows: { note: number }[] }).rows[2].note = nv;
      return mod;
    };
    const released = furnaceToPt3(withRelease(102));
    expect(released.lossy.filter((x) => x.includes('note cut'))).toEqual([]);
    expect(Buffer.from(released.module).equals(Buffer.from(furnaceToPt3(withRelease(100)).module))).toBe(false);
    expect(Buffer.from(furnaceToPt3(withRelease(101)).module).equals(Buffer.from(released.module))).toBe(true);
  });
  it('starts the release tail sample on the held step, which Furnace replays on the first released tick', () => {
    // macroInt.cpp doMacro: val = val[pos++] re-reads the release step before moving on, so the tail is 15, 8, 4, not 8, 4.
    const mod = Object.assign(tinyModule(), { instruments: [{ macros: [{ code: 0, length: 4, loop: -1, release: 1, delay: 0, speed: 1, data: [15, 15, 8, 4] }] }] });
    (mod.patterns.get('0_0_0') as unknown as { rows: { note: number }[] }).rows[2].note = 102;
    const m = furnaceToPt3(mod).module;
    const samples = Array.from({ length: 32 }, (_, i) => m[105 + 2 * i] | (m[106 + 2 * i] << 8)).filter((p) => p > 0)
      .map((p) => Array.from({ length: m[p + 1] }, (_, f) => m[p + 2 + 4 * f + 1] & 15).join(','));
    expect(samples).toContain('15,8,4');
  });
  it('falls back to the unbent sample once bent notes fill the 31 PT3 samples', () => {
    const mod = Object.assign(tinyModule(), { instruments: [{ macros: [{ code: 0, length: 1, loop: -1, delay: 0, speed: 1, data: [15] }, { code: 4, length: 3, loop: -1, delay: 0, speed: 1, data: [0, 40, 80] }] }] });
    const rows = Array.from({ length: 64 }, (_, r) => ({ note: 24 + r, instrument: 0, volume: -1, effects: [] }));
    mod.patterns.set('0_0_0', { rows } as never);
    Object.assign(mod.subsongs[0], { patLen: 64 });
    const r = furnaceToPt3(mod);
    expect(r.lossy.join(' | ')).toContain('pitch macro on some notes (dropped so the module fits)');
    expect(r.module.length).toBeGreaterThan(0);
  });
  it('switches the sample with a 1-byte 0xD1..0xEF op on note rows and restates it at each pattern start', () => {
    // pt3player.asm PD_LP2: 0xD1..0xEF sets the sample alone; 0xF0..0xFF sets ornament + sample in 2 bytes.
    const mod = Object.assign(tinyModule(), { instruments: [{ macros: [{ code: 0, length: 4, loop: -1, release: 1, delay: 0, speed: 1, data: [15, 15, 8, 4] }] }] });
    const rows = (mod.patterns.get('0_0_0') as unknown as { rows: { note: number; instrument: number }[] }).rows;
    rows[1].note = 102; rows[2].note = 50; rows[2].instrument = 0;
    Object.assign(mod.subsongs[0], { ordersLen: 2, orders: [[0, 0], [0, 0], [0, 0]] });
    const m = furnaceToPt3(mod).module;
    // Both orders play one shared pattern: the sample state does not leak in from the previous order or the loop jump.
    expect(m[201]).toBe(m[202]);
    const patTab = m[103] | (m[104] << 8), a = m[patTab] | (m[patTab + 1] << 8);
    const chA = Array.from(m.subarray(a, m.indexOf(0, a)));
    // First note: ornament + sample (2 bytes). Release tail: sample 2 alone. Next note: sample 1 alone.
    expect(chA.filter((b) => b >= 0xf0)).toHaveLength(1);
    expect(chA).toContain(0xd2);
    expect(chA.indexOf(0xd1)).toBeGreaterThan(chA.indexOf(0xd2));
  });
});
