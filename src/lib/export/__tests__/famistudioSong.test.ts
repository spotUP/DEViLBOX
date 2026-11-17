// FamiStudio route: envelope encoder (port of FamitoneMusicFile.cs ProcessEnvelope), ROM patching, player staleness.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import { buildFamistudioRom, encodeEnvelope, furnaceToFamistudio, type FamistudioMeta } from '../nes/famistudioSong';

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'public/nes/famistudio');
const META: FamistudioMeta = JSON.parse(readFileSync(path.join(DIR, 'player.json'), 'utf8'));

describe('famistudio envelope encoder', () => {
  it('writes the single-value default forms', () => {
    expect(encodeEnvelope([15], -1, -1, 'vol')).toEqual([0x00, 192 + 15, 0x7f, 0x00, 0x02]);
    expect(encodeEnvelope([0], -1, -1, 'arp')).toEqual([192, 0x7f, 0x00, 0x00]);
  });
  it('run-length encodes repeats and ends on the loop pointer', () => {
    const d = encodeEnvelope([15, 15, 15, 15, 8], -1, -1, 'vol');
    expect(d[0]).toBe(0x00);
    expect(d).toContain(192 + 15);
    expect(d).toContain(192 + 8);
    expect(d[d.length - 2]).toBe(0x00);
    expect(d.length).toBeLessThan(1 + 5 + 2);
  });
});

describe('famistudio ROM', () => {
  it('patches music and DPCM at the player addresses and refuses oversize data', () => {
    const player = readFileSync(path.join(DIR, 'player.nes'));
    const song = { music: new Uint8Array([1, 2, 3]), dpcm: new Uint8Array([9]), lossy: [], channelsWithNotes: [], firstNotes: [], firstNoteFrames: [] };
    const rom = buildFamistudioRom(player, META, song);
    expect(rom.length).toBe(player.length);
    expect([...rom.subarray(META.prgOffset + META.musicAddr - 0x8000, META.prgOffset + META.musicAddr - 0x8000 + 3)]).toEqual([1, 2, 3]);
    expect(rom[META.prgOffset + META.dpcmAddr - 0x8000]).toBe(9);
    expect(() => buildFamistudioRom(player, META, { ...song, music: new Uint8Array(META.musicCap + 1) })).toThrow();
  });
  it('player.nes is built from the current sources (run tools/build-nes-famistudio-player.sh)', () => {
    const h = createHash('sha1');
    for (const f of [path.join(DIR, 'player.s'), path.join(DIR, 'fs.cfg'), path.join(ROOT, 'third-party/famistudio/famistudio_ca65.s')]) h.update(readFileSync(f));
    expect(h.digest('hex')).toBe(META.sourceHash);
  });
});

type Cell = { note: number; octave: number; instrument: number; volume: number; effects: Array<{ type: number; value: number }> };
const empty = (): Cell => ({ note: 0, octave: 0, instrument: -1, volume: -1, effects: [] });

/** One-order NES module, 16 rows; `cells[ch][row]` overrides empty cells. */
function nesModule(cells: Record<number, Record<number, Partial<Cell>>>): FurnaceModule {
  const patterns = new Map<string, { rows: Cell[] }>();
  for (let ch = 0; ch < 5; ch++) patterns.set(`0_${ch}_0`, { rows: Array.from({ length: 16 }, (_, r) => ({ ...empty(), ...cells[ch]?.[r] })) });
  return {
    systems: [6],
    subsongs: [{ speed1: 6, speed2: 6, hz: 60, patLen: 16, ordersLen: 1, orders: [[0], [0], [0], [0], [0]] }],
    patterns,
    instruments: [],
    samples: [],
  } as unknown as FurnaceModule;
}

const has = (bytes: Uint8Array, seq: number[]): boolean => {
  for (let i = 0; i + seq.length <= bytes.length; i++) if (seq.every((b, j) => bytes[i + j] === b)) return true;
  return false;
};

describe('furnaceToFamistudio', () => {
  it('raises a pulse note below A-1 to A-1 instead of wrapping its 11-bit period', () => {
    // G-1: Furnace nv 19, FamiStudio note 8 (period 2282 wraps to 234 on the 2A03; Furnace saturates at 2047).
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 7, octave: 1 } } }));
    expect(has(song.music, [0x40, 10])).toBe(true);
    expect(has(song.music, [0x40, 8])).toBe(false);
    expect(song.lossy.some((l) => l.startsWith('note below A-1'))).toBe(true);
  });

  it('keeps A-1 and higher notes unchanged', () => {
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 9, octave: 1 } } }));
    expect(has(song.music, [0x40, 10])).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('note below A-1'))).toBe(false);
  });

  it('reports the frame of each channel first note, after a speed change', () => {
    // Row 0 sets speed 3 (from 6): row 4 starts at frame 12 on any channel.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4, effects: [{ type: 0x0f, value: 3 }] } }, 1: { 4: { note: 0, octave: 4 } } }));
    expect(song.firstNoteFrames.slice(0, 3)).toEqual([0, 12, -1]);
  });
});
