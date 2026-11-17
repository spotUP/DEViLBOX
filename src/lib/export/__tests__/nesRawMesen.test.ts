/**
 * NES player Phase 7 in Mesen2 headless: the RAW block loop writes $4011 / $9000 / $5011 at the encoded cycle period.
 * Tolerance rule (written in the plan before the first run): values equal the block in order with nothing else written between the
 * first and last sample; mean gap within 0.1 percent of the encoded period, 99 percent of gaps within +-1 cycle and all within +-8
 * (page carry is +4 once per 256); period within 0.5 percent of the captured rate; ticks resume at the frame period within 1 percent.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NesCapture, NesChip, NesEvent } from '../nes/nesCapture';
import { buildNesCartridge, type NesPlayer } from '../nes/nesCartridge';
import { NES_RAW_FIXED, NES_RAW_REG, NES_REGION_TIMING, decodeNesStream, encodeNesStreams } from '../nes/nesStream';
import { MESEN, mesen } from './nesMesenHarness';

const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const ready = existsSync(MESEN) && existsSync(ROM) && existsSync(META);
const SR = 48000, TR = 60.0988;
const player = (): NesPlayer => ({ ...JSON.parse(readFileSync(META, 'utf8')), bytes: Uint8Array.from(readFileSync(ROM)) });

/** Marker write at tick 0, `n` samples every `gap` worklet samples from tick 1 (a 4011-style run), marker writes on later ticks. */
function capture(chip: NesChip, n: number, gap: number): { cap: NesCapture; data: number[] } {
  const data = Array.from({ length: n }, (_, i) => (i * 37 + 11) & (chip === 'vrc6' ? 0x8f : 0x7f) | (chip === 'vrc6' ? 0x80 : 0));
  const tick = (t: number) => Math.round(t * SR / TR);
  const events: NesEvent[] = [{ kind: 'write', chip: 'nes', sample: tick(0), addr: 0x4000, value: 0xa0 }];
  data.forEach((v, i) => events.push({ kind: 'pcm', chip, sample: tick(1) + i * gap, addr: NES_RAW_REG[chip]!, value: v }));
  for (let t = 2; t < 8; t++) events.push({ kind: 'write', chip: 'nes', sample: tick(t), addr: 0x4000, value: 0xb0 + t });
  return { cap: { events, sampleRate: SR, tickRateHz: TR }, data };
}

describe('NES raw block stream', () => {
  it('round trips a raw block through the encoder and keeps other pcm events timed', () => {
    const { cap, data } = capture('nes', 300, 6);
    const d = decodeNesStream(encodeNesStreams([{ ntsc: cap }], 4096).ntsc, 0, 4096);
    const blocks = d.ticks.flatMap((t) => t.raws ?? []);
    expect(blocks.flatMap((b) => b.data)).toEqual(data);
    const want = Math.round(NES_REGION_TIMING.ntsc.cpuHz * 6 / SR);
    expect(Math.abs(blocks[0].period - want)).toBeLessThanOrEqual(1);
    expect(d.ticks.every((t) => !t.events.some((e) => e.kind === 'pcm'))).toBe(true);
  });
});

describe.skipIf(!ready)('NES raw samples in Mesen2', () => {
  const cases: Array<[NesChip, number, number, number]> = [['nes', 0x4011, 6, 400], ['nes', 0x4011, 4, 300], ['mmc5', 0x5011, 6, 300], ['vrc6', 0x9000, 5, 300]];
  for (const [chip, port, gap, n] of cases) {
    it(`${chip} ${gap}-sample gap: writes ${port.toString(16)} at the encoded period, freezes and resumes`, () => {
      const { cap, data } = capture(chip, n, gap);
      const rom = buildNesCartridge([{ ntsc: cap }], player(), 'raw test').rom;
      const r = mesen(rom, 8, 30, port === 0x4011 ? [[0x4000, 0x4017]] : [[0x4000, 0x4017], [port, port]], { region: 'Ntsc', stamps: true });
      const all = r.writes.flatMap((w, t) => w.map(([a, v], i) => ({ a, v, c: r.writeCycles[t][i], t })));
      const s = all.filter((x) => x.a === port);
      expect(s.map((x) => x.v)).toEqual(data);
      const first = all.indexOf(s[0]), last = all.indexOf(s[s.length - 1]);
      expect(all.slice(first, last + 1).every((x) => x.a === port)).toBe(true);
      const gaps = s.slice(1).map((x, i) => x.c - s[i].c);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const block = decodeNesStream(encodeNesStreams([{ ntsc: cap }], 4096).ntsc, 0, 4096).ticks.flatMap((t) => t.raws ?? [])[0];
      const wanted = NES_REGION_TIMING.ntsc.cpuHz * gap / SR;
      const near1 = gaps.filter((g) => Math.abs(g - block.period) <= 1).length / gaps.length;
      console.log(`[nes7] ${chip} n=${n} encoded period ${block.period} (fixed ${NES_RAW_FIXED}) measured mean ${mean.toFixed(3)} within1 ${(near1 * 100).toFixed(1)}% max dev ${Math.max(...gaps.map((g) => Math.abs(g - block.period)))} captured ${wanted.toFixed(2)}`);
      expect(Math.abs(mean - block.period) / block.period).toBeLessThan(0.001);
      expect(near1).toBeGreaterThanOrEqual(0.99);
      expect(Math.max(...gaps.map((g) => Math.abs(g - block.period)))).toBeLessThanOrEqual(8);
      expect(Math.abs(block.period - wanted) / wanted).toBeLessThan(0.005);
      // freeze and resume: the tick-0 marker precedes the block, later ticks still write their markers afterwards
      expect(r.writes[0].some(([a, v]) => a === 0x4000 && v === 0xa0)).toBe(true);
      const after = r.writes.slice(2).filter((w) => w.some(([a]) => a === 0x4000)).length;
      expect(after).toBeGreaterThanOrEqual(4);
      const d = r.cycles.slice(4).map((c, i, a) => (i ? c - a[i - 1] : 0)).slice(1);
      const frame = NES_REGION_TIMING.ntsc.cpuHz / NES_REGION_TIMING.ntsc.frameHz;
      expect(Math.abs(d.reduce((a, b) => a + b, 0) / d.length - frame) / frame).toBeLessThan(0.01);
    }, 120000);
  }
});
