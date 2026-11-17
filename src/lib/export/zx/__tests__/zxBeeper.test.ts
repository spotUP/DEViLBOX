/**
 * ZX Spectrum 128K beeper .tap (public/zx/beeper.asm). The player bytes are checked structurally here, the audio
 * by MAME (see thoughts/spot/2026-11-16-zx-native-tap-research.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { songToBeeperRows, encodeBeeperMusic, beeperFreqWord, beeperDutyUnits, BEEPER_CLOCK, BEEPER_ITER_T, BEEPER_DRUM_BYTE_T } from '../zxBeeperData';
import { buildZxBeeperTap, type ZxBeeperPlayer } from '../zxTap';
import { parseFurnaceFile } from '@/lib/import/parsers/FurnaceToSong';
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
  set(p, 4, 0, { note: 50, instrument: 1 }); // Furnace channel 5: plays on voice 5
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

const rowsT = (rows: ReturnType<typeof songToBeeperRows>['rows']) =>
  rows.reduce((t, r) => t + r.iters * BEEPER_ITER_T + (r.drum?.bytes ?? 0) * BEEPER_DRUM_BYTE_T, 0);

describe('ZX beeper tap', () => {
  it('player timing constants match the assembled player', () => {
    expect(player.iterT).toBe(BEEPER_ITER_T);
    expect(player.drumByteT).toBe(BEEPER_DRUM_BYTE_T);
    expect(player.clock).toBe(BEEPER_CLOCK);
    expect(player.bytes.length).toBe(player.dataOffset);
  });

  it('A-4 is 440 Hz in the player frequency word', () => {
    expect(beeperFreqWord(57)).toBe(Math.round(440 * 65536 * BEEPER_ITER_T / BEEPER_CLOCK));
  });

  it('turns pattern rows into timed records, channel k on voice k', () => {
    const d = songToBeeperRows(song() as never);
    expect(d.seconds).toBeCloseTo(16 * 6 / 50, 5);
    expect(rowsT(d.rows) / BEEPER_CLOCK).toBeGreaterThan(d.seconds * 0.95);
    expect(rowsT(d.rows) / BEEPER_CLOCK).toBeLessThanOrEqual(d.seconds);
    // Freq words are raised by the record-gap share (screen slice), a few percent at most.
    expect(d.rows[0].freq[0]).toBeGreaterThanOrEqual(beeperFreqWord(57));
    expect(d.rows[0].freq[0]).toBeLessThan(beeperFreqWord(57) * 1.06);
    expect(d.rows[0].freq[4]).toBeGreaterThan(0);
    expect(d.rows[0].duty[4]).toBe(beeperDutyUnits(64));
    expect(d.rows[0].duty[2]).toBe(0);
    const later = d.rows.find((r) => r.freq[0] > d.rows[0].freq[0])!;
    expect(later.duty[0]).toBe(beeperDutyUnits(0x40));
    expect(d.drumHits).toBe(0);
  });

  it('a volume macro value above 1 keeps the voice sounding (outVol = MIN(1, val)), 0 silences it', () => {
    for (const [val, sounds] of [[2, true], [127, true], [0, false]] as const) {
      const s = song();
      (s.instruments[0] as unknown as { furnace: FurnaceConfig }).furnace.macros = [
        { code: 0, type: 0, data: [val], loop: -1, release: -1, mode: 0 } as never,
      ];
      expect(songToBeeperRows(s as never).rows[0].duty[0] > 0).toBe(sounds);
    }
  });

  it('builds a 128K tap: loader, player + drums, one block per bank', () => {
    const d = songToBeeperRows(song() as never);
    const m = encodeBeeperMusic(d.rows, player.loadAddress + player.dataOffset, player.usableBanks.length);
    expect(m.banks.length).toBe(1);
    expect(m.banks[0][0]).toBe(0x3F); // first record sets all 6 voices
    expect(m.banks[0][m.banks[0].length - 1]).toBe(0x81);
    const blocks = parseTap(buildZxBeeperTap(player, d.drums, m.banks, 'beeper'));
    expect(blocks.every((b) => b.ok)).toBe(true);
    expect(blocks.map((b) => b.flag)).toEqual([0, 0xFF, 0, 0xFF, 0, 0xFF]);
    // Everything but the 32 character title and author blocks is the player unchanged.
    const expected = player.bytes.slice();
    const shown = (o: number, t: string) => expected.set(Buffer.from(t.toUpperCase().padEnd(player.textLength, ' ')), o);
    shown(player.titleOffset, 'beeper');
    shown(player.authorOffset, '');
    expect(blocks[3].data.subarray(0, player.dataOffset)).toEqual(expected);
    expect(blocks[5].data).toEqual(m.banks[0]);
  });

  it('ZX Extinction Sequence: whole song in the 128K banks, 17xx drums encoded', async () => {
    const buf = readFileSync('public/data/songs/furnace/misc/ZX Extinction Sequence.fur');
    const s = await parseFurnaceFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), 'x.fur');
    const d = songToBeeperRows(s as never);
    expect(d.seconds).toBeGreaterThan(110);
    expect(d.drumHits).toBeGreaterThan(100);
    expect(d.drums.length).toBeGreaterThan(0);
    expect(d.drums.length).toBeLessThanOrEqual(player.maxDrumBytes);
    expect(d.rows.some((r) => r.drum)).toBe(true);
    // The record gaps carry the live screen slice, so the tone loop holds about 95% of the time.
    expect(rowsT(d.rows) / BEEPER_CLOCK).toBeGreaterThan(d.seconds * 0.94);
    const m = encodeBeeperMusic(d.rows, player.loadAddress + player.dataOffset, player.usableBanks.length);
    expect(m.truncated).toBe(false);
    expect(m.seconds).toBeCloseTo(d.seconds, 3);
    expect(m.banks.length).toBeLessThanOrEqual(player.usableBanks.length);
  }, 30000);
});
