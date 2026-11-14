/**
 * Furnace AY-3-8910 (Scramble) target: the written .fur reads back with the contract the
 * BossGame Z80 player expects (thoughts/spot/2026-11-13_ay-scramble-export.md).
 *
 * BOSSGAME_WRITE=<dir> also writes <dir>/test-ay.fur and <dir>/test-ay.txt (the BossGame
 * test song and its row dump) from the same song.
 */
import { describe, expect, it } from 'vitest';
import pako from 'pako';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exportFurnaceAyScramble, furnaceAyScrambleExportAvailable, ayScrambleTempoWarning,
  FUR_AY_SCRAMBLE_VERSION, FUR_AY_SCRAMBLE_CHIP_FLAGS,
} from '../FurnaceExporter';
import { parseFurnaceSong } from '@/lib/import/formats/FurnaceSongParser';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import { EMPTY_CELL } from '@/types/tracker';
import type { Pattern, TrackerCell, ChannelData } from '@/types/tracker';
import type { InstrumentConfig, FurnaceConfig, FurnaceMacro } from '@/types/instrument';

const ROWS = 16;

function channel(i: number): ChannelData {
  return {
    id: `c${i}`, name: `Ch ${i + 1}`, rows: Array.from({ length: ROWS }, () => ({ ...EMPTY_CELL })),
    muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
  };
}

function pattern(id: string, channels = 3): Pattern {
  return { id, name: id, length: ROWS, channels: Array.from({ length: channels }, (_, i) => channel(i)) };
}

function set(p: Pattern, ch: number, row: number, cell: Partial<TrackerCell>): void {
  p.channels[ch].rows[row] = { ...EMPTY_CELL, ...cell };
}

function macro(code: number, data: number[], loop = -1): FurnaceMacro {
  return { code, type: 0, data, loop, release: -1, mode: 0, delay: 0, speed: 1 } as FurnaceMacro;
}

function ay(id: number, name: string, macros: FurnaceMacro[]): InstrumentConfig {
  const furnace = { ...DEFAULT_FURNACE, chipType: 6, macros } as FurnaceConfig;
  return { id, name, type: 'synth', synthType: 'FurnaceAY', furnace } as unknown as InstrumentConfig;
}

// Tracker notes: 1 = C-0, 49 = C-4, 97 = note off. Volume column 0x10-0x50.
function song(channels = 3) {
  const p0 = pattern('p0', channels);
  const p1 = pattern('p1', channels);
  // Lead (instrument 1): volume decay macro, arpeggio macro 0 4 7 looping.
  set(p0, 0, 0, { note: 49, instrument: 1, volume: 0x50 });
  set(p0, 0, 4, { note: 52, instrument: 1 });
  set(p0, 0, 8, { note: 56, instrument: 1, effTyp: 4, eff: 0x46 }); // vibrato 046
  set(p0, 0, 12, { note: 97 });
  set(p1, 0, 0, { note: 54, instrument: 1, volume: 0x40, effTyp: 0x0a, eff: 0x02 }); // volume slide 0A02
  set(p1, 0, 8, { note: 52, instrument: 1 });
  // Bass (instrument 2) on channel 2.
  for (const [p, notes] of [[p0, [25, 25, 32, 30]], [p1, [27, 27, 30, 32]]] as const) {
    notes.forEach((n, k) => set(p, 1, k * 4, { note: n, instrument: 2 }));
  }
  // Noise drum (instrument 3) on channel 3, every 4 rows; loop to order 0 on the last row.
  for (const p of [p0, p1]) for (let r = 0; r < ROWS; r += 4) set(p, 2, r, { note: 49, instrument: 3 });
  set(p1, 2, 15, { effTyp: 0x0b, eff: 0x00 });
  return {
    name: channels > 3 ? 'BossGame AY 6 channel test' : 'BossGame AY test',
    patterns: [p0, p1],
    instruments: [
      ay(1, 'Lead', [macro(0, [15, 14, 13, 12, 11, 10, 10, 9], 7), macro(1, [0, 4, 7], 0)]),
      ay(2, 'Bass', [macro(0, [15, 13, 11, 9, 8], 4)]),
      ay(3, 'Noise drum', [macro(0, [15, 12, 8, 4, 0]), macro(2, [2, 6, 12, 20, 31]), macro(3, [2])]),
    ],
    songPositions: [0, 1],
    initialSpeed: 6,
    initialBPM: 125,
  };
}

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

/** Row dump of the song as written: note, instrument (file index), AY volume 0-15, effects. */
function dump(s: ReturnType<typeof song>): string {
  const lines = [`${s.name}: ${s.patterns[0].channels.length} channels, ${ROWS} rows, orders ${s.songPositions.join(' ')}, speed ${s.initialSpeed}, tick 58.3 Hz`,
    ...s.instruments.map((inst, i) => `instrument ${hex2(i)} ${inst.name}: ${inst.furnace?.macros.map((m) => `macro ${m.code} [${m.data.join(' ')}] loop ${m.loop}`).join('; ')}`)];
  s.patterns.forEach((p, pi) => {
    lines.push('', `pattern ${pi}`);
    for (let r = 0; r < ROWS; r++) {
      const cols = p.channels.map((c) => {
        const x = c.rows[r];
        const note = x.note === 97 ? 'OFF' : x.note > 0 ? `${NOTE_NAMES[(x.note - 1) % 12]}${Math.floor((x.note - 1) / 12)}` : '...';
        const ins = x.instrument > 0 ? hex2(x.instrument - 1) : '..';
        const vol = x.volume >= 0x10 ? hex2(Math.round((x.volume - 0x10) * 127 / 64 * 15 / 127)) : '..';
        const fx = x.effTyp > 0 || x.eff > 0 ? `${hex2(x.effTyp)}${hex2(x.eff)}` : '....';
        return `${note} ${ins} ${vol} ${fx}`;
      });
      lines.push(`${hex2(r)} | ${cols.join(' | ')}`);
    }
  });
  return lines.join('\n') + '\n';
}

describe('exportFurnaceAyScramble', () => {
  it('writes a version-228 AY-3-8910 module with the Scramble contract', async () => {
    const s = song();
    expect(furnaceAyScrambleExportAvailable(s.instruments)).toBe(true);
    const { bytes, warnings } = exportFurnaceAyScramble(s);
    expect(warnings).toEqual([]);

    const raw = pako.inflate(bytes); // zlib stream
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    expect(new TextDecoder().decode(raw.subarray(0, 16))).toBe('-Furnace module-');
    expect(view.getUint16(16, true)).toBe(FUR_AY_SCRAMBLE_VERSION);
    expect(new TextDecoder().decode(raw)).toContain(`FLAG`);
    expect(new TextDecoder().decode(raw)).toContain(FUR_AY_SCRAMBLE_CHIP_FLAGS);

    const mod = await parseFurnaceSong(bytes.slice().buffer);
    expect(mod.version).toBe(FUR_AY_SCRAMBLE_VERSION);
    expect(mod.systems).toEqual([0x80]);
    expect(mod.chans).toBe(3);
    expect(mod.subsongs[0].hz).toBeCloseTo(58.3, 3);
    expect(mod.subsongs[0].ordersLen).toBe(2);
    expect(mod.instruments.map((i) => i.name)).toEqual(['Lead', 'Bass', 'Noise drum']);
    const lead = mod.instruments[0].macros;
    expect(lead.find((m) => m.code === 0)?.data).toEqual([15, 14, 13, 12, 11, 10, 10, 9]);
    expect(lead.find((m) => m.code === 0)?.loop).toBe(7);
    expect(lead.find((m) => m.code === 1)?.data).toEqual([0, 4, 7]);
    expect(mod.instruments[2].macros.find((m) => m.code === 2)?.data).toEqual([2, 6, 12, 20, 31]);
    expect(mod.instruments.every((i) => i.macros.every((m) => m.release < 0 || m.release === 255))).toBe(true);

    const out = process.env.BOSSGAME_WRITE;
    if (out) {
      writeFileSync(join(out, 'test-ay.fur'), bytes);
      writeFileSync(join(out, 'test-ay.txt'), dump(s));
    }
  });

  it('leaves out effects outside the contract and names them', () => {
    const s = song();
    set(s.patterns[0], 1, 2, { effTyp: 0x07, eff: 0x44 }); // tremolo: not run by the player
    const { warnings } = exportFurnaceAyScramble(s);
    expect(warnings.some((w) => w.includes('Effect 07 left out'))).toBe(true);
  });
});

/** Six-channel song: the 3-channel song plus a second AY (envelope bass, EC, ED, 00). */
function song6() {
  const s = song(6);
  const [p0, p1] = s.patterns;
  // Envelope instrument: wave macro bit 2 (4) + noise off (mixer tone), shape macro 8, period macro 16.
  s.instruments.push(
    ay(4, 'Buzz bass', [macro(0, [15]), macro(3, [4 | 1]), macro(6, [8]), macro(16, [0x0100, 0x0100])]),
    ay(5, 'Saw bass', [macro(0, [15]), macro(3, [4 | 1]), macro(6, [12]), macro(16, [0x0200])]),
  );
  set(p0, 3, 0, { note: 25, instrument: 4 });
  set(p0, 3, 4, { note: 25, instrument: 5, effTyp: 0x22, eff: 0x81 }); // envelope shape 8, route to channel
  set(p0, 3, 8, { note: 27, instrument: 4, effTyp: 0x23, eff: 0x40 });
  set(p0, 4, 0, { note: 49, instrument: 1, effTyp: 0x00, eff: 0x47 }); // arpeggio 00
  set(p0, 4, 4, { note: 52, instrument: 1, effTyp: 0xec, eff: 0x02 }); // note cut
  set(p0, 4, 8, { note: 54, instrument: 1, effTyp: 0xe5, eff: 0x88 }); // fine pitch
  set(p0, 5, 0, { note: 56, instrument: 1, effTyp: 0xed, eff: 0x02 }); // note delay
  set(p1, 5, 0, { note: 49, instrument: 3 });
  return s;
}

describe('exportFurnaceAyScramble, two AY systems', () => {
  it('writes two AY systems and six channels for a 6-channel song', async () => {
    const s = song6();
    const { bytes } = exportFurnaceAyScramble(s);
    const mod = await parseFurnaceSong(bytes.slice().buffer);
    expect(mod.systems).toEqual([0x80, 0x80]);
    expect(mod.chans).toBe(6);
    expect(mod.instruments.map((i) => i.name)).toContain('Buzz bass');
    const out = process.env.BOSSGAME_WRITE;
    if (out) {
      writeFileSync(join(out, 'test-ay6.fur'), bytes);
      writeFileSync(join(out, 'test-ay6.txt'), dump(s));
    }
  });

  it('keeps the envelope bit, shape macros 8 and 12 and the period macro', async () => {
    const { bytes, warnings } = exportFurnaceAyScramble(song6());
    const mod = await parseFurnaceSong(bytes.slice().buffer);
    const buzz = mod.instruments.find((i) => i.name === 'Buzz bass')!.macros;
    const saw = mod.instruments.find((i) => i.name === 'Saw bass')!.macros;
    expect(buzz.find((m) => m.code === 3)?.data[0]! & 4).toBe(4);
    expect(buzz.find((m) => m.code === 6)?.data).toEqual([8]);
    expect(saw.find((m) => m.code === 6)?.data).toEqual([12]);
    expect(buzz.find((m) => m.code === 16)?.data).toEqual([0x0100, 0x0100]);
    expect(warnings.some((w) => w.includes('Buzz bass') && w.includes('envelope bit'))).toBe(true);
    expect(warnings.some((w) => w.includes('envelope shape macro kept'))).toBe(true);
  });

  it('keeps envelope effects, EC, ED, E5xx and 00 with a warning', () => {
    const { warnings } = exportFurnaceAyScramble(song6());
    for (const name of ['22xy', '23xx', 'EC', 'ED', 'E5xx', '00']) {
      expect(warnings.some((w) => w.includes(`Effect ${name}`) && w.includes('kept') && w.includes('BossGame compiler must support it'))).toBe(true);
    }
  });

  it('still leaves out a forbidden effect on the second chip', () => {
    const s = song6();
    set(s.patterns[0], 4, 8, { note: 49, instrument: 1, effTyp: 0x07, eff: 0x44 });
    const { warnings } = exportFurnaceAyScramble(s);
    expect(warnings.some((w) => w.includes('Effect 07 left out'))).toBe(true);
  });

  it('keeps a 3-channel song on one system', async () => {
    const mod = await parseFurnaceSong(exportFurnaceAyScramble(song()).bytes.slice().buffer);
    expect(mod.systems).toEqual([0x80]);
  });
});

describe('ayScrambleTempoWarning', () => {
  it('warns with the BPM to use when the song does not tick at 58.3 Hz', () => {
    const w = ayScrambleTempoWarning(125);
    expect(w).toContain('50.00 Hz');
    expect(w).toContain('145.75');
  });
  it('is silent at BPM 145.75', () => {
    expect(ayScrambleTempoWarning(145.75)).toBeNull();
  });
});
