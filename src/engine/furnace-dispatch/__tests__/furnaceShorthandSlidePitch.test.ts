/**
 * Furnace E1xy / E2xy (shorthand slide: x = speed, y = semitones) and E5xx (fine pitch, 0x80 =
 * centre) on a tracker-made song's chip channel, as FurnaceSequencer.cpp case 0xe1/0xe2/0xe5.
 * Before: the cell path sent nothing for them (the router has no E-range case), and the unused
 * routeExtendedEffect sent E1/E2 as one fixed PITCH and E5 as y - 8.
 */
import { describe, it, expect } from 'vitest';
import { FurnaceTickEffects, TICK_STEPPED_EFFECTS } from '../FurnaceTickEffects';
import { DivCmd } from '../FurnaceDispatchEngine';

const NOTE = 48;

describe('Furnace E1xy/E2xy shorthand slide and E5xx fine pitch', () => {
  it('are stepped per tick, not routed as one-shot cell effects', () => {
    for (const e of [0xE1, 0xE2, 0xE5]) expect(TICK_STEPPED_EFFECTS.has(e)).toBe(true);
  });

  it('E1xy slides up y semitones at speed x*4 across rows, then lands on the target note', () => {
    const fx = new FurnaceTickEffects();
    // E112: speed 1 -> portaSpeed 4 -> 16 units a tick; 2 semitones = 256 units = 16 ticks
    expect(fx.beginRow(0, NOTE, null, [{ effect: 0xE1, param: 0x12 }])).toEqual([{ cmd: DivCmd.PRE_PORTA, val1: 1, val2: 0 }]);
    const ticks: ReturnType<FurnaceTickEffects['tick']>[] = [];
    for (let t = 0; t < 6; t++) ticks.push(fx.tick(0));
    // the next row has no effect: the slide runs on
    expect(fx.beginRow(0, null, null, [])).toEqual([]);
    for (let t = 6; t < 20; t++) ticks.push(fx.tick(0));
    const portas = ticks.flat().filter((c) => c.cmd === DivCmd.NOTE_PORTA);
    expect(portas).toHaveLength(16);
    expect(portas.every((c) => c.val1 === 16 && c.val2 === NOTE + 2)).toBe(true);
    expect(ticks[15]).toContainEqual({ cmd: DivCmd.LEGATO, val1: NOTE + 2, val2: 0 });
    expect(ticks.slice(16).flat()).toEqual([]);
  });

  it('E2xy slides down to note - y', () => {
    const fx = new FurnaceTickEffects();
    fx.beginRow(0, NOTE, null, [{ effect: 0xE2, param: 0x83 }]);
    const first = fx.tick(0);
    expect(first).toEqual([{ cmd: DivCmd.NOTE_PORTA, val1: 32 * 4, val2: NOTE - 3 }]);
  });

  it('E5xx sends xx - 0x80 as PITCH; E580 is centre', () => {
    const fx = new FurnaceTickEffects();
    fx.beginRow(0, NOTE, null, []);
    expect(fx.beginRow(0, null, null, [{ effect: 0xE5, param: 0x90 }])).toEqual([{ cmd: DivCmd.PITCH, val1: 0x10, val2: 0 }]);
    expect(fx.beginRow(0, null, null, [{ effect: 0xE5, param: 0x70 }])).toEqual([{ cmd: DivCmd.PITCH, val1: -0x10, val2: 0 }]);
    expect(fx.beginRow(0, null, null, [{ effect: 0xE5, param: 0x80 }])).toEqual([{ cmd: DivCmd.PITCH, val1: 0, val2: 0 }]);
  });

  it('E5xx pitch stays under a vibrato', () => {
    const fx = new FurnaceTickEffects();
    fx.beginRow(0, NOTE, null, [{ effect: 0xE5, param: 0xA0 }]);
    const out = fx.beginRow(0, null, null, [{ effect: 0x04, param: 0x00 }, { effect: 0xE5, param: 0xA0 }]);
    expect(out.filter((c) => c.cmd === DivCmd.PITCH).every((c) => c.val1 === 0x20)).toBe(true);
  });
});
