/**
 * NES player Phase 5 done-check: per-chip writers (VRC6, VRC7, FDS, MMC5, N163, 5B) in Mesen2 headless.
 * Compares (order, address, value) of the CPU bus writes per NMI tick with the capture mapped to the chip's canonical ports.
 * CYCLE POSITION IS NOT COMPARED: the VRC7 6/42 cycle gaps make intra-frame timing differ from Furnace's.
 * The ROM is the custom mapper-31 cart (R1: Mesen2 has no multi-expansion mapper, so this is bus-write verification only;
 * chip audio, the combined decode and per-chip original-mapper ROMs (Phase 10) are not checked here). Chip order within a
 * tick is CHIP_ORDER (tick mask bit order), writes within a chip keep capture order.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NesCapture, NesChip, NesEvent } from '../nes/nesCapture';
import { CHIP_ORDER, encodeNesStreams, nesCaptureToTicks } from '../nes/nesStream';
import { MESEN, mesen } from './nesMesenHarness';

const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const ready = existsSync(MESEN) && existsSync(ROM) && existsSync(META);
const SR = 48000, TR = 60;
const RANGES: Array<[number, number]> = [[0x4000, 0x4013], [0x4015, 0x4015], [0x4017, 0x4017], [0x4040, 0x408a], [0x4800, 0x4800], [0x5000, 0x5015], [0x8000, 0xffff]];

const w = (tick: number, chip: NesChip, addr: number, value: number): NesEvent => ({ kind: 'write', chip, sample: Math.round(tick * SR / TR), addr, value });

/** Capture address -> the bus writes the player must make. */
function bus(chip: NesChip, a: number, v: number): Array<[number, number]> {
  switch (chip) {
    case 'vrc7': return [[0x9010, a], [0x9030, v]];
    case 'n163': return [[0xf800, a | 0x80], [0x4800, v]];
    case 's5b': return [[0xc000, a], [0xe000, v]];
    default: return [[a, v]];
  }
}

const run = (chip: NesChip, events: NesEvent[]): { got: Array<Array<[number, number]>>; want: Array<Array<[number, number]>> } => {
  const cap: NesCapture = { events, sampleRate: SR, tickRateHz: TR };
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const rom = Uint8Array.from(readFileSync(ROM));
  rom.set(encodeNesStreams([{ ntsc: cap }], meta.bankSize).ntsc, meta.dataOffset);
  const ticks = nesCaptureToTicks(cap);
  const want = ticks.map((t) => CHIP_ORDER.flatMap((c) => (t.writes[c] ?? []).flatMap(([a, v]) => bus(c, a, v))));
  expect(chip).toBeTruthy();
  return { got: mesen(rom, ticks.length + 3, 30, RANGES).writes, want };
};

/*
 * MMC5 caveat: Mesen2's mapper 31 decodes all of $5000-$5FFF (A2-A0 = bank window), so an MMC5 write to $5000+n also remaps
 * window n&7. Windows 0, 1 and 7 hold the stream start, current stream and player code, so $5000, $5001, $5007, $5008-$5009,
 * $500F, $5010-$5011 cannot be replayed under Mesen and stay UNVERIFIED here; the cart decode (nesCartridge.ts) takes bank
 * registers at $5FF8-$5FFF only. The addresses below alias harmless windows 2-6.
 */
/** Writes over several ticks; repeated ticks hit the dictionary, runs hit the ascending/constant run encodings. */
const ramp = (chip: NesChip, addrs: number[], base = 0): NesEvent[] => {
  const ev: NesEvent[] = [];
  addrs.forEach((a, i) => ev.push(w(base + (i % 4), chip, a, (0x11 * (i + 1) + 5) & 0xff)));
  for (const t of [6, 7, 9]) addrs.slice(0, 3).forEach((a) => ev.push(w(base + t, chip, a, 0x42)));
  return ev;
};

const CHIP_CASES: Array<[NesChip, number[]]> = [
  ['vrc6', [0x9003, 0x9000, 0x9001, 0x9002, 0xa000, 0xa001, 0xa002, 0xb000, 0xb001, 0xb002]],
  ['vrc7', [0, 1, 2, 3, 4, 5, 6, 7, 0x10, 0x11, 0x20, 0x21, 0x30, 0x35]],
  ['fds', [0x4089, ...Array.from({ length: 64 }, (_, i) => 0x4040 + i), 0x4089, 0x4080, 0x4082, 0x4083, 0x4084, 0x4085, 0x4086, 0x4087]],
  ['mmc5', [0x5002, 0x5003, 0x5004, 0x5006, 0x5015]],
  ['n163', [...Array.from({ length: 32 }, (_, i) => i), 0x78, 0x7a, 0x7c, 0x7e, 0x7f]],
  ['s5b', Array.from({ length: 16 }, (_, i) => i)],
];

describe.skipIf(!ready)('NES chip writers in Mesen2 (bus writes per tick vs capture, no cycle compare)', () => {
  for (const [chip, addrs] of CHIP_CASES) {
    it(`${chip}: canonical ports, order, address, value`, () => {
      const { got, want } = run(chip, ramp(chip, addrs));
      expect(want.flat().length).toBeGreaterThan(0);
      expect(got.slice(0, want.length)).toEqual(want);
      expect(got.slice(want.length).flat()).toEqual([]);
    }, 90000);
  }

  it('FDS $4088 modulation table (32 constant-register writes) is replayed as a constant run', () => {
    const ev = [w(0, 'fds', 0x4087, 0x80), ...Array.from({ length: 32 }, (_, i) => w(1, 'fds', 0x4088, i & 7)), w(2, 'fds', 0x4087, 0)];
    const { got, want } = run('fds', ev);
    expect(got.slice(0, want.length)).toEqual(want);
  }, 90000);

  it('all chips in the same ticks keep chip order and per-chip write order', () => {
    const ev = CHIP_CASES.flatMap(([c, a]) => ramp(c, a.slice(0, 6)));
    const { got, want } = run('vrc6', ev);
    expect(got.slice(0, want.length)).toEqual(want);
  }, 90000);
});
