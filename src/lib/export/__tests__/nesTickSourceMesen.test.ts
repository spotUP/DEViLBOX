/**
 * NES player Phase 6 done-check in Mesen2 headless (region forced with --nes.region): the boot-time region detect picks the
 * NTSC/PAL/Dendy stream, and the tick spacing is measured from cpu.cycleCount at each tick, never assumed.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NesCapture, NesEvent } from '../nes/nesCapture';
import { buildNesCartridge, type NesPlayer } from '../nes/nesCartridge';
import { NES_REGION_TIMING, nesIrqPeriod } from '../nes/nesStream';
import { MESEN, mesen } from './nesMesenHarness';

const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const ready = existsSync(MESEN) && existsSync(ROM) && existsSync(META);
const SR = 48000;

/** Every tick writes `marker` to $4000 so the stream a region booted into is readable from the bus log. */
function capture(rate: number, marker: number, ticks = 40): NesCapture {
  const events: NesEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push({ kind: 'write', chip: 'nes', sample: Math.round(t * SR / rate), addr: 0x4000, value: marker ^ (t & 1) });
  return { events, sampleRate: SR, tickRateHz: rate };
}

function player(): NesPlayer {
  return { ...JSON.parse(readFileSync(META, 'utf8')), bytes: Uint8Array.from(readFileSync(ROM)) };
}

const REGIONS = [['Ntsc', 'ntsc', 60.0988, 0x10], ['Pal', 'pal', 50.007, 0x20], ['Dendy', 'dendy', 50.007, 0x30]] as const;

describe('NES tick source periods', () => {
  it('uses NMI within 0.5 percent of the frame rate and a cycle period otherwise', () => {
    expect(nesIrqPeriod('ntsc', 60.0988)).toBe(0);
    expect(nesIrqPeriod('pal', 50)).toBe(0);
    expect(nesIrqPeriod('ntsc', 75)).toBe(Math.round(NES_REGION_TIMING.ntsc.cpuHz / 75));
    expect(nesIrqPeriod('pal', 60)).toBe(Math.round(NES_REGION_TIMING.pal.cpuHz / 60));
  });
});

describe.skipIf(!ready)('NES player regions in Mesen2', () => {
  const rom = buildNesCartridge([{
    ntsc: capture(60.0988, REGIONS[0][3]), pal: capture(50.007, REGIONS[1][3]), dendy: capture(50.007, REGIONS[2][3]),
  }], player()).rom;

  for (const [mesenRegion, key, hz, marker] of REGIONS) {
    it(`${mesenRegion}: boot detect picks the ${key} stream and ticks at the frame rate`, () => {
      const r = mesen(rom, 24, 30, [[0x4000, 0x4000]], { region: mesenRegion });
      const first = r.writes.find((w) => w.length)![0][1];
      expect(first & 0xfe).toBe(marker);
      const d = r.cycles.slice(6).map((c, i, a) => (i ? c - a[i - 1] : 0)).slice(1);
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      const expected = NES_REGION_TIMING[key].cpuHz / hz;
      console.log(`[nes6] ${mesenRegion} tick spacing ${mean.toFixed(1)} cycles, expected ${expected.toFixed(1)}`);
      expect(Math.abs(mean - expected) / expected).toBeLessThan(0.01);
    }, 90000);
  }

  it('Ntsc: a 75 Hz song ticks on the cycle IRQ at 75 Hz (board counter modelled in Lua)', () => {
    const odd = buildNesCartridge([{ ntsc: capture(75, 0x40) }], player()).rom;
    const r = mesen(odd, 24, 30, [[0x4000, 0x4000]], { region: 'Ntsc', irqBoard: true });
    expect(r.writes.find((w) => w.length)![0][1] & 0xfe).toBe(0x40);
    const d = r.cycles.slice(1).map((c, i) => c - r.cycles[i]);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    console.log(`[nes6] Ntsc 75 Hz IRQ spacing ${mean.toFixed(1)} cycles = ${(NES_REGION_TIMING.ntsc.cpuHz / mean).toFixed(3)} Hz`);
    expect(Math.abs(NES_REGION_TIMING.ntsc.cpuHz / mean - 75)).toBeLessThan(0.1);
  }, 90000);
});
