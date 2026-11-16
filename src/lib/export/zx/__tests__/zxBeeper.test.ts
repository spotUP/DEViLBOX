/**
 * ZX Spectrum 48K beeper .tap. Caveat: the song is synthetic (no real beeper .fur exists in
 * public/data/songs); the player bytes are checked structurally, the audio by MAME (see
 * thoughts/spot/2026-11-16-zx-native-tap-research.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { songToBeeperRows, encodeBeeperMusic, beeperFreqWord, beeperDutyByte, BEEPER_UNIT_MS } from '../zxBeeperData';
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
  set(p, 4, 0, { note: 50, instrument: 1 }); // Furnace channel 5: takes the free third voice
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

  it('turns pattern rows into timed tone rows and folds channel 5 into a free voice', () => {
    const d = songToBeeperRows(song() as never, player.maxBytes);
    expect(d.rows[0].freq[0]).toBe(1845);
    expect(d.rows[0].freq[1]).toBeGreaterThan(0);
    // 4 rows at speed 6, 50 Hz = 0.48 s
    expect(d.rows[0].units * BEEPER_UNIT_MS).toBeCloseTo(480, -1);
    expect(d.rows[0].freq[2]).toBe(beeperFreqWord(49));
    // Furnace duty = pin pulse of 64 samples at 894886 Hz; 12x40 = the same 64, so the byte follows the pitch.
    expect(d.rows[0].duty[0]).toBe(beeperDutyByte(64, 440));
    expect(d.rows[1].duty[0]).toBe(beeperDutyByte(0x40, 440 * Math.pow(2, 4 / 12)));
    expect(d.rows[1].duty[0]).toBe(10);
  });

  it('keeps real-time length at 60 Hz and warns it was resampled', () => {
    const s = { ...song(), hz: 60 };
    const d = songToBeeperRows(s as never, player.maxBytes);
    expect(d.rows[0].units * BEEPER_UNIT_MS).toBeLessThan(420); // 4 rows x 6 ticks / 60 Hz = 400 ms, not 480
    expect(d.warnings.join(' ')).toMatch(/60\.00 Hz.*resampled/);
  });

  it('expands a 00xy arpeggio and an arp macro into one row per tick', () => {
    const s = song();
    set(s.patterns[0], 2, 0, { note: 58, instrument: 1, effTyp: 0, eff: 0x47 });
    const d = songToBeeperRows(s as never, player.maxBytes);
    const w = (n: number) => beeperFreqWord(n);
    expect(d.rows.slice(0, 3).map((r) => r.freq[2])).toEqual([w(57), w(61), w(64)]);
    const m = song();
    (m.instruments[0].furnace as FurnaceConfig).macros = [{ code: 1, type: 0, data: [0, 12], loop: 0, release: -1, mode: 0 }];
    const e = songToBeeperRows(m as never, player.maxBytes);
    expect(e.rows.slice(0, 2).map((r) => r.freq[0])).toEqual([w(57), w(69)]);
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
