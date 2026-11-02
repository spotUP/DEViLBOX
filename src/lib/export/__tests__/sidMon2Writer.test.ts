/**
 * SidMon2Writer: a module built from scratch parses back through SidMon2Parser to the same song
 * (notes, instruments, order, pattern lengths, effects).
 */
import { describe, it, expect } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { parseSidMon2File } from '@/lib/import/formats/SidMon2Parser';
import { buildSidMon2File } from '../SidMon2Writer';

const cell = (o: Partial<TrackerCell> = {}): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, ...o });

function pattern(id: string, length: number, set: Array<[number, number, Partial<TrackerCell>]>): Pattern {
  const channels = Array.from({ length: 4 }, (_, ch) => ({
    id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
    instrumentId: null, color: null, rows: Array.from({ length }, () => cell()),
  }));
  for (const [ch, row, c] of set) channels[ch].rows[row] = cell(c);
  return { id, name: id, length, channels } as Pattern;
}

const inst = (id: number, waveform: 0 | 1 | 2 | 3, attack: number): InstrumentConfig => ({
  id, name: `Inst ${id}`, type: 'synth', synthType: 'SidMonSynth', effects: [], volume: -6, pan: 0,
  sidMon: { type: 'synth', waveform, pulseWidth: 128, attack, decay: 4, sustain: 10, release: 3, arpTable: [0, 4, 7, 0, 0, 0, 0, 0], arpSpeed: 2, vibDelay: 5, vibSpeed: 6, vibDepth: 7, filterCutoff: 255, filterResonance: 0, filterMode: 0 },
} as InstrumentConfig);

describe('buildSidMon2File', () => {
  it('parses back to the same notes, instruments, order and lengths', async () => {
    const p0 = pattern('a', 64, [[0, 0, { note: 40, instrument: 1 }], [0, 8, { note: 45, instrument: 2, effTyp: 0x0C, eff: 32 }], [1, 3, { note: 50, instrument: 2 }], [3, 63, { note: 60, instrument: 1 }]]);
    const p1 = pattern('b', 32, [[2, 0, { note: 30, instrument: 1 }], [2, 5, { effTyp: 0x01, eff: 4 }]]);
    const song = { name: 'x', patterns: [p0, p1], instruments: [inst(1, 1, 0), inst(2, 2, 3)], songPositions: [0, 1, 0], songLength: 3, initialSpeed: 5 } as unknown as TrackerSong;
    const { data, warnings } = buildSidMon2File(song);
    expect(warnings).toEqual([]);
    const back = await parseSidMon2File(data, 'x.sd2');
    expect(back.songLength).toBe(3);
    expect(back.initialSpeed).toBe(5);
    expect(back.instruments.map((i) => i.sidMon?.attack)).toEqual([0, 3]);
    expect(back.instruments.map((i) => i.name)).toEqual(['Inst 1', 'Inst 2']);
    expect(back.instruments[1].sidMon?.arpTable).toEqual([0, 4, 7, 0, 0, 0, 0, 0]);
    expect(back.patterns.map((p) => p.length)).toEqual([64, 32, 64]);
    const grid = (ps: Pattern[], order: number[]) => order.map((o) => ps[o].channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.effTyp, r.eff])));
    const expected = grid([p0, p1], [0, 1, 0]);
    const got = grid(back.patterns, [0, 1, 2]);
    // The parser puts the song's speed on row 0 of voice 0 when that row has no effect.
    got[0][0][0][2] = 0; got[0][0][0][3] = 0;
    expect(got).toEqual(expected);
  });
});
