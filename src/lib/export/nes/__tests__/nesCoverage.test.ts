/**
 * Phase 9 coverage test (thoughts/shared/plans/2026-11-17-nes-native-player.md): every register of the plan's per-chip table
 * must appear at least once in the capture of the coverage song. A missing register is a test failure.
 *
 * The capture is a fixture because captures only come from the browser worklet. Produce it from the open coverage song
 * (public/data/songs/furnace/nes/nes-coverage.fur) with the dev tab's evaluate_script:
 *   const m = await import('/src/lib/export/nes/nesRecord.ts'); const c = await m.recordRegion('ntsc', false);
 *   copy JSON.stringify(c) to src/lib/export/nes/__tests__/fixtures/nesCoverage.capture.json
 * (pass `true` for sunsoft once the 5B rows are authored).
 *
 * Address space of the capture (nesCapture.ts): bus addresses for 2A03, VRC6, MMC5, FDS; chip register numbers for VRC7, N163, 5B.
 * Excluded from the 2A03 row: $4009/$400D (unused on hardware), $4014 (OAM DMA, PPU side), $4016 (controller): Furnace never writes them.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { NesCapture, NesChip } from '../nesCapture';

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

interface Row { chip: NesChip; feature: string; regs: number[]; /** Authored in the coverage song yet (this slice: 2A03 and VRC6). */ authored: boolean }

export const COVERAGE_ROWS: Row[] = [
  { chip: 'nes', feature: 'pulse 1/2 duty+volume, sweep ($4001/$4005), timer, length', regs: [0x4000, 0x4001, 0x4002, 0x4003, 0x4004, 0x4005, 0x4006, 0x4007], authored: true },
  { chip: 'nes', feature: 'triangle linear counter ($4008)', regs: [0x4008, 0x400a, 0x400b], authored: true },
  { chip: 'nes', feature: 'noise mode, envelope', regs: [0x400c, 0x400e, 0x400f], authored: true },
  { chip: 'nes', feature: 'DMC loop, delta counter ($4011), address/length', regs: [0x4010, 0x4011, 0x4012, 0x4013], authored: true },
  { chip: 'nes', feature: 'channel enable, frame counter mode', regs: [0x4015, 0x4017], authored: true },
  { chip: 'vrc6', feature: 'pulse 1, pulse 2, saw', regs: [0x9000, 0x9001, 0x9002, 0xa000, 0xa001, 0xa002, 0xb000, 0xb001, 0xb002], authored: true },
  { chip: 'vrc6', feature: 'control ($9003 frequency scaling)', regs: [0x9003], authored: true },
  { chip: 'mmc5', feature: 'two pulses', regs: range(0x5000, 0x5007), authored: false },
  { chip: 'mmc5', feature: 'PCM, channel enable', regs: [0x5010, 0x5011, 0x5015], authored: false },
  { chip: 'fds', feature: 'wave table', regs: range(0x4040, 0x407f), authored: false },
  { chip: 'fds', feature: 'volume, frequency, modulation, master', regs: [0x4080, 0x4082, 0x4083, 0x4084, 0x4085, 0x4086, 0x4087, 0x4088, 0x4089], authored: false },
  { chip: 'n163', feature: 'wave RAM and channel regs 0..0x7f, channel count reg $7F', regs: range(0x00, 0x7f), authored: false },
  { chip: 'vrc7', feature: 'custom patch regs', regs: range(0x00, 0x07), authored: false },
  { chip: 'vrc7', feature: 'channel regs', regs: [...range(0x10, 0x18), ...range(0x20, 0x28), ...range(0x30, 0x38)], authored: false },
  { chip: 's5b', feature: 'tone, noise, mixer, envelope, R13 shape', regs: range(0, 13), authored: false },
];

/** Rows' registers that the capture never wrote (writes and pcm events both count: $4011 and VRC6 digital mode are pcm). */
export function missingRegisters(cap: NesCapture, rows: readonly Row[]): Array<{ chip: NesChip; feature: string; addr: number }> {
  const seen = new Set<string>();
  for (const e of cap.events) if (e.kind !== 'control') seen.add(`${e.chip}:${e.addr}`);
  return rows.flatMap((r) => r.regs.filter((a) => !seen.has(`${r.chip}:${a}`)).map((addr) => ({ chip: r.chip, feature: r.feature, addr })));
}

const FIXTURE = new URL('./fixtures/nesCoverage.capture.json', import.meta.url);

describe('missingRegisters (the checker itself)', () => {
  it('reports an absent register and ignores control events', () => {
    const cap: NesCapture = { sampleRate: 48000, tickRateHz: 60, events: [
      { kind: 'write', chip: 'nes', sample: 0, addr: 0x4000, value: 1 },
      { kind: 'control', chip: 'nes', sample: 0, control: 1, channel: 0, value: 4 },
    ] };
    const row: Row = { chip: 'nes', feature: 't', regs: [0x4000, 0x4001], authored: true };
    expect(missingRegisters(cap, [row]).map((m) => m.addr)).toEqual([0x4001]);
  });
});

describe.skipIf(!existsSync(FIXTURE))('coverage song capture covers the plan table', () => {
  const cap: NesCapture = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : { events: [], sampleRate: 1, tickRateHz: 1 };
  for (const row of COVERAGE_ROWS.filter((r) => r.authored)) {
    it(`${row.chip}: ${row.feature}`, () => {
      expect(missingRegisters(cap, [row]).map((m) => `0x${m.addr.toString(16)}`)).toEqual([]);
    });
  }
  // Later slices: flip `authored` once the song has the chip; until then the rows are listed, not run.
  for (const row of COVERAGE_ROWS.filter((r) => !r.authored)) it.todo(`${row.chip}: ${row.feature}`);
});
