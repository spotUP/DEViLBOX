// Negative check for tools/nes-rom-check.ts: a capture with one changed value must be reported, an identical one must not.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NesCapture } from '../nes/nesCapture';
import { buildNesRom } from '../nes/nesExport';
import { CHIP_ORDER, nesCaptureToTicks } from '../nes/nesStream';
import { busWrites, diffWrites, mesen } from './nesMesenHarness';

const dir = join(import.meta.dirname, '../../../../public/nes');
const player = { ...JSON.parse(readFileSync(join(dir, 'player.json'), 'utf8')), bytes: Uint8Array.from(readFileSync(join(dir, 'player.bin'))) };
const capture: NesCapture = {
  sampleRate: 48000, tickRateHz: 60,
  events: Array.from({ length: 6 }, (_, t) => ({ kind: 'write' as const, chip: 'nes' as const, sample: t * 800, addr: 0x4002, value: 0x10 + t })),
};
const want = (c: NesCapture) => nesCaptureToTicks(c).map((t) => CHIP_ORDER.flatMap((ch) => (t.writes[ch] ?? []).flatMap(([a, v]) => busWrites(ch, a, v))));

describe('nes-rom-check harness negative', () => {
  it('reports a single wrong value and passes the right one', () => {
    const rom = buildNesRom([{ ntsc: capture }], player, { title: 'neg', chips: ['nes'] });
    const got = mesen(rom.rom, 8, 60, [[0x4000, 0x4013]]).writes;
    expect(diffWrites(want(capture), got).diffs).toBe(0);
    const wrong: NesCapture = { ...capture, events: capture.events.map((e, i) => (i === 3 && e.kind === 'write' ? { ...e, value: e.value ^ 0x01 } : e)) };
    const d = diffWrites(want(wrong), got);
    expect(d.diffs).toBe(1);
    expect(d.first).toContain('tick 3');
  }, 120000);
});
