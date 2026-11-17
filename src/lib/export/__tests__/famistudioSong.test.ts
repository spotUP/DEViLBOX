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

  const A4 = { note: 9, octave: 4 };
  const fx = (type: number, value: number) => ({ effects: [{ type, value }] });
  const music = (cells: Record<number, Record<number, Partial<Cell>>>) => furnaceToFamistudio(nesModule(cells));

  it('maps 04 vibrato to a pitch envelope override and stops it with 0x4a', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x04, 0x44) }, 8: fx(0x04, 0) } });
    expect(song.music.includes(0x49)).toBe(true);
    expect(song.music.includes(0x4a)).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('effect 04'))).toBe(false);
  });
  it('maps 00 arpeggio to an arp envelope override and stops it with 0x4c', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x00, 0x37) }, 8: fx(0x00, 0) } });
    expect(song.music.includes(0x4b)).toBe(true);
    expect(song.music.includes(0x4c)).toBe(true);
  });
  it('maps 03 portamento to a slide that replaces the note byte (0x43 then 0x50 step from to)', () => {
    const song = music({ 0: { 0: A4, 4: { note: 9, octave: 5, ...fx(0x03, 0x20) } } });
    expect(song.music.includes(0x50)).toBe(true);
    expect(song.music.includes(0x43)).toBe(true);
  });
  it('maps 01 slide up to a 0x50 slide toward the note it reaches', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x01, 0x20) }, 8: { note: 9, octave: 5 } } });
    expect(song.music.includes(0x50)).toBe(true);
  });
  it('maps E1 note slide up to a 0x50 slide', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xe1, 0x47) } } });
    expect(song.music.includes(0x50)).toBe(true);
  });
  it('maps 0A volume slide to 0x51 step target', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x0a, 0x10) } } });
    const at = [...song.music].indexOf(0x51);
    expect(at).toBeGreaterThan(-1);
    expect(song.music[at + 1]).toBeGreaterThan(0);
    expect(song.music[at + 2]).toBe(240);
  });
  it('maps ED note delay to 0x47 with ticks*frames-1', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xed, 0x03) } } });
    const at = [...song.music].indexOf(0x47);
    expect(at).toBeGreaterThan(-1);
    expect(song.music[at + 1]).toBe(2); // 3 ticks of 1 frame - 1 (hz 60, speed 6 -> 1 frame per tick)
  });
  it('maps EC note cut to 0x48', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xec, 0x03) } } });
    expect(has(song.music, [0x48, 3])).toBe(true);
  });
  it('maps E5 fine pitch to 0x4e', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xe5, 0xa0) } } });
    expect(song.music.includes(0x4e)).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('effect E5'))).toBe(false);
  });
  it('keeps unsupported effects lossy with the channel kind', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x11, 0x01) } } });
    expect(song.lossy.some((l) => l.startsWith('effect 11'))).toBe(true);
  });
});
