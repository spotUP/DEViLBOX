/**
 * ZX Spectrum 48K beeper .tap. Caveat: the song is synthetic (no real beeper .fur exists in
 * public/data/songs); the player bytes are checked structurally, the audio by MAME (see
 * thoughts/spot/2026-11-16-zx-native-tap-research.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { songToBeeperRows, encodeBeeperMusic, beeperFreqWord, BEEPER_UNIT_MS } from '../zxBeeperData';
import { buildZx48Tap, type ZxBeeperPlayer } from '../zxTap';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import { EMPTY_CELL } from '@/types/tracker';
import type { Pattern, TrackerCell, ChannelData } from '@/types/tracker';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';

const ROWS = 16;
const channel = (i: number): ChannelData => ({
  id: `c${i}`, name: `Ch ${i + 1}`, rows: Array.from({ length: ROWS }, () => ({ ...EMPTY_CELL })),
  muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
});
const set = (p: Pattern, ch: number, row: number, cell: Partial<TrackerCell>) => {
  p.channels[ch].rows[row] = { ...EMPTY_CELL, ...cell };
};

function song() {
  const p: Pattern = { id: 'p0', name: 'p0', length: ROWS, channels: [0, 1, 2, 3, 4].map(channel) };
  set(p, 0, 0, { note: 58, instrument: 1 }); // A-4 (tracker note 58 = 440 Hz)
  set(p, 0, 4, { note: 62, instrument: 1, effTyp: 0x12, eff: 0x40 });
  set(p, 1, 0, { note: 46, instrument: 1 });
  set(p, 4, 0, { note: 50, instrument: 1 }); // sample channel: dropped
  const furnace = { ...DEFAULT_FURNACE, chipType: 0xca } as FurnaceConfig;
  const inst = { id: 1, name: 'Beep', type: 'synth', synthType: 'FurnaceZXBEEPER', furnace } as unknown as InstrumentConfig;
  return { name: 'beeper', patterns: [p], instruments: [inst], songPositions: [0], initialSpeed: 6, initialBPM: 125, hz: 50 };
}

function parseTap(tap: Uint8Array) {
  const blocks: Array<{ flag: number; data: Uint8Array; ok: boolean }> = [];
  for (let p = 0; p < tap.length;) {
    const n = tap[p] | (tap[p + 1] << 8);
    const body = tap.subarray(p + 2, p + 2 + n);
    blocks.push({ flag: body[0], data: body.subarray(1, n - 1), ok: body.reduce((c, b) => c ^ b, 0) === 0 });
    p += 2 + n;
  }
  return blocks;
}

const player: ZxBeeperPlayer = {
  ...JSON.parse(readFileSync('public/zx/beeper.json', 'utf8')),
  bytes: new Uint8Array(readFileSync('public/zx/beeper.bin')),
};

describe('ZX beeper tap', () => {
  it('A-4 is 440 Hz in the engine frequency word', () => {
    expect(beeperFreqWord(57)).toBe(1845);
  });

  it('turns pattern rows into timed tone rows and drops the sample channel', () => {
    const d = songToBeeperRows(song() as never, player.maxBytes);
    expect(d.rows[0].freq[0]).toBe(1845);
    expect(d.rows[0].freq[1]).toBeGreaterThan(0);
    // 4 rows at speed 6, 50 Hz = 0.48 s
    expect(d.rows[0].units * BEEPER_UNIT_MS).toBeCloseTo(480, -1);
    expect(d.rows[1].duty[0]).toBe(0x40);
    expect(d.warnings.join(' ')).toMatch(/Dropped/);
  });

  it('builds a tape with valid checksums, a loader and the player code', () => {
    const d = songToBeeperRows(song() as never, player.maxBytes);
    const tap = buildZx48Tap(player, (base) => encodeBeeperMusic(d.rows, base), 'beeper');
    const blocks = parseTap(tap);
    expect(blocks.every((b) => b.ok)).toBe(true);
    expect(blocks.length).toBe(4);
    expect(blocks[0].flag).toBe(0x00);
    expect(blocks[1].data[blocks[1].data.length - 1]).toBe(0x0D);
    expect(Array.from(blocks[3].data.subarray(0, player.dataOffset))).toEqual(Array.from(player.bytes.subarray(0, player.dataOffset)));
    expect(blocks[3].data.length).toBe(player.dataOffset + 4 + d.rows.length * 16 + 2);
  });
});
