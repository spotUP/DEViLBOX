// FamiStudio route: envelope encoder (port of FamitoneMusicFile.cs ProcessEnvelope), ROM patching, player staleness.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import { MESEN } from './nesMesenHarness';
import { buildFamistudioRom, famistudioText, encodeEnvelope, furnaceToFamistudio, noiseNote, type FamistudioMeta } from '../nes/famistudioSong';

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
    const song = { music: new Uint8Array([1, 2, 3]), dpcm: new Uint8Array([9]), lossy: [], pitchLossy: [], channelsWithNotes: [], firstNotes: [], firstNoteFrames: [] };
    const rom = buildFamistudioRom(player, META, song);
    expect(rom.length).toBe(player.length);
    expect([...rom.subarray(META.prgOffset + META.musicAddr - 0x8000, META.prgOffset + META.musicAddr - 0x8000 + 3)]).toEqual([1, 2, 3]);
    expect(rom[META.prgOffset + META.dpcmAddr - 0x8000]).toBe(9);
    expect(() => buildFamistudioRom(player, META, { ...song, music: new Uint8Array(META.musicCap + 1) })).toThrow();
  });
  it('writes title and author, uppercased and space padded, at the player.json slots', () => {
    const player = readFileSync(path.join(DIR, 'player.nes'));
    const song = { music: new Uint8Array([1]), dpcm: new Uint8Array([1]), lossy: [], pitchLossy: [], channelsWithNotes: [], firstNotes: [], firstNoteFrames: [] };
    const rom = buildFamistudioRom(player, META, song, { title: 'Sky Sanctuary', author: 'x'.repeat(40) });
    const at = (a: number) => [...rom.subarray(META.prgOffset + a - 0x8000, META.prgOffset + a - 0x8000 + META.textLen)];
    expect(at(META.titleAddr)).toEqual([...famistudioText('SKY SANCTUARY', 32)]);
    expect(String.fromCharCode(...at(META.authorAddr))).toBe('X'.repeat(32));
    expect(rom[META.prgOffset + META.titleAddr - 0x8000 + 13]).toBe(0x20);
  });
  it('player.nes is built from the current sources (run tools/build-nes-famistudio-player.sh)', () => {
    const h = createHash('sha1');
    for (const f of [path.join(DIR, 'player.s'), path.join(DIR, 'fs.cfg'), path.join(ROOT, 'third-party/famistudio/famistudio_ca65.s'), path.join(ROOT, 'public/nes/screen.chr')]) h.update(readFileSync(f));
    expect(h.digest('hex')).toBe(META.sourceHash);
  });
});

type Cell = { note: number; octave: number; instrument: number; volume: number; effects: Array<{ type: number; value: number }> };
const empty = (): Cell => ({ note: 0, octave: 0, instrument: -1, volume: -1, effects: [] });

/** One-order NES module, 16 rows; `cells[ch][row]` overrides empty cells. */
function nesModule(cells: Record<number, Record<number, Partial<Cell>>>, subsong: Record<string, number> = {}): FurnaceModule {
  const patterns = new Map<string, { rows: Cell[] }>();
  for (let ch = 0; ch < 5; ch++) patterns.set(`0_${ch}_0`, { rows: Array.from({ length: 16 }, (_, r) => ({ ...empty(), ...cells[ch]?.[r] })) });
  return {
    systems: [6],
    subsongs: [{ speed1: 6, speed2: 6, hz: 60, patLen: 16, ordersLen: 1, orders: [[0], [0], [0], [0], [0]], ...subsong }],
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
  it('maps noise notes to the period index Furnace writes (nes.cpp noiseTable / properNoiseLayout)', () => {
    // FamiStudio noise period index = 15 - (note & 15).
    const period = (n: number): number => 15 - (n & 15);
    expect(period(noiseNote(9, true))).toBe(15 - 9);
    expect(period(noiseNote(9, false))).toBe(6); // noiseTable[9]
    expect(period(noiseNote(12, false))).toBe(15); // noiseTable[12]
    expect(period(noiseNote(39, false))).toBe(0); // noiseTable[39] (third row: 3, 2, 1, 0, ...)
    expect(period(noiseNote(100, false))).toBe(15); // past the table rows: all 15
  });

  it('keeps a pulse note below A-1; the rewritten ROM note table saturates it at 2047 like Furnace', () => {
    // nv 7 maps to FamiStudio note 8 (G-1); retuneNoteTable writes min(0x7ff, period) for every entry.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 7, octave: 0 } } }));
    expect(has(song.music, [0x40, 8])).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('note below A-1'))).toBe(false);
  });

  it('keeps A-1 and higher notes unchanged', () => {
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 9, octave: 0 } } }));
    expect(has(song.music, [0x40, 10])).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('note below A-1'))).toBe(false);
  });

  it('plays Furnace note value nv as FamiStudio note nv + 1 (nv 45 sounds 440 Hz in furnace -vgmout)', () => {
    // nv 45 = note 9 octave 3 here; FamiStudio note 46 is A-4, 440 Hz, on pulse and (an octave down) on triangle.
    // Notes 13..75 encode as one byte n - 12, so note 46 is byte 34 right after the instrument byte.
    expect(has(furnaceToFamistudio(nesModule({ 0: { 0: { note: 9, octave: 3 } } })).music, [0x80, 34])).toBe(true);
    expect(has(furnaceToFamistudio(nesModule({ 2: { 0: { note: 9, octave: 3 } } })).music, [0x80, 34])).toBe(true);
  });

  it('reports the frame of each channel first note, after a speed change', () => {
    // Row 0 sets speed 3 (from 6): row 4 starts at frame 12 on any channel.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4, effects: [{ type: 0x0f, value: 3 }] } }, 1: { 4: { note: 0, octave: 4 } } }));
    expect(song.firstNoteFrames.slice(0, 3)).toEqual([0, 12, -1]);
  });

  it('virtual tempo scales row timing but not effect ticks', () => {
    // Virtual tempo 150/100: rows advance 1.5 per tick, so speed 6 rows last 4 frames and row 4 starts at frame 16.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4 } }, 1: { 4: { note: 0, octave: 4 } } }, { virtualTempo: 150, virtualTempoD: 100 }));
    expect(song.firstNoteFrames.slice(0, 2)).toEqual([0, 16]);
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

/** Player screen in Mesen2 headless: a Lua script reads the nametable, presses Start / Right, and times the last PPU write of every NMI. */
const DUMPS = [30, 150, 200, 330];
const PRESS: Array<[number, number, string]> = [[160, 165, 'start'], [210, 215, 'start'], [260, 265, 'right']];
describe.skipIf(!existsSync(MESEN))('famistudio player screen in Mesen2', () => {
  const player = readFileSync(path.join(DIR, 'player.nes'));
  const A4 = { note: 9, octave: 4 };
  const song = furnaceToFamistudio(nesModule({ 0: { 0: A4 }, 1: { 0: A4 }, 2: { 0: A4 }, 3: { 0: A4 } }));
  const rom = buildFamistudioRom(player, META, song, { title: 'Test Song', author: 'Some Author', comments: '' });

  it('draws title, author, chip name, status, bars and scroller; Start pauses, Right restarts the clock; PPU writes end inside vblank', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fsscreen-'));
    try {
      writeFileSync(path.join(dir, 'p.nes'), rom);
      // Tile -> text: 0-63 dim glyphs, 73 rule '-', 74 play '>', 75 pause '=', 80-143 white glyphs, 144-191 bar-colour glyphs, 192+ bar cells.
      const lua = `local f,t0,last,mx,seen=0,0,0,0,false
local function ch(t) if t<64 then return string.char(t+0x20) elseif t==73 then return "-" elseif t==74 then return ">" elseif t==75 then return "=" elseif t>=80 and t<144 then return string.char(t-80+0x20) elseif t>=144 and t<192 then return string.char(t-144+0x30) else return "#" end end
local function tile(r,c,b) return emu.read((b or 0x2000)+r*32+c, emu.memType.nesPpuMemory) end
local function row(r,c0,c1,b) local t={} for c=c0,c1 do t[#t+1]=ch(tile(r,c,b)) end return table.concat(t) end
local function bars() local o={} for i=0,4 do local n=0 for r=6,23 do if tile(r,6+4*i)~=192 then n=n+1 end end o[#o+1]=n end return table.concat(o,",") end
local function hex(a,n) local o={} for i=0,n-1 do o[#o+1]=string.format("%02X",emu.read(a+i, emu.memType.nesPpuMemory)) end return table.concat(o) end
emu.addMemoryCallback(function() if last>mx then mx=last end last=0 seen=true t0=emu.getState()["cpu.cycleCount"] end, emu.callbackType.exec, ${META.nmiAddr}, ${META.nmiAddr})
emu.addMemoryCallback(function() local sl=emu.getState()["ppu.scanline"] if seen and (sl<200 or sl>=240) then last=emu.getState()["cpu.cycleCount"]-t0 end end, emu.callbackType.write, 0x2006, 0x2007)
emu.addMemoryCallback(function()
  f=f+1
  for _,x in ipairs({${DUMPS.join(',')}}) do if f==x then print("F"..f.."|"..row(2,11,29).."|"..row(3,2,29).."|"..row(4,2,29).."|"..row(25,2,29).."|"..bars().."|"..row(27,0,31,0x2800)..row(27,0,31,0x2800).."|"..hex(0x3F00,16).."|"..hex(0x23C0,64).."|"..row(5,2,29).."|"..row(24,6,24).."|"..row(26,2,29).."|"..row(2,2,9)) end end
  if f>=${DUMPS[DUMPS.length - 1]} then if last>mx then mx=last end print("PPUEND "..mx) print("DONE") emu.stop(0) end
end, emu.callbackType.exec, ${META.tickAddr}, ${META.tickAddr})
emu.addEventCallback(function()
${PRESS.map(([a, b, k]) => `  if f>=${a} and f<=${b} then emu.setInput({${k}=true},0) end`).join('\n')}
end, emu.eventType.inputPolled)
`;
      writeFileSync(path.join(dir, 's.lua'), lua);
      const set = path.join(homedir(), 'Library/Application Support/Mesen2');
      mkdirSync(set, { recursive: true });
      if (!existsSync(path.join(set, 'Settings.json'))) writeFileSync(path.join(set, 'Settings.json'), '{"FirstRun":false}');
      let out = '';
      try { out = execFileSync(MESEN, ['--testRunner', '--timeout=60', '--nes.region=Ntsc', '--nes.port1.type=NesController', '--doNotSaveSettings', '--enableStdout', path.join(dir, 's.lua'), path.join(dir, 'p.nes')], { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 }); } catch (e) { out = String((e as { stdout?: string }).stdout ?? ''); console.log(out.slice(0, 1500)); }
      expect(out).toContain('DONE');
      console.log(`[fsscreen] ${out.split('\n').filter((l) => l.startsWith('PPUEND') || /^F\d+\|/.test(l)).join('\n[fsscreen] ')}`);
      const d = Object.fromEntries(out.split('\n').filter((l) => /^F\d+\|/.test(l)).map((l) => [l.split('|')[0], l.split('|')]));
      const [, a, b, c] = [d.F30, d.F150, d.F200, d.F330];
      const PAL = '0F102D270F17272C0F1030260F10302C'; // chip/rules, bars, logo/title/author, labels/status/scroller; sprite palettes unused
      const ATTR = ['A0'.repeat(8), '0040505050501000', ...Array(4).fill('0044555555551100'), '0F'.repeat(8), '00'.repeat(8)].join('').toUpperCase();
      for (const f of [a, b, c]) {
        expect(f[7]).toBe(PAL); // $3F00-$3F0F
        expect(f[8]).toBe(ATTR); // $23C0-$23FF
        expect(f[12]).toBe('DEVILBOX'); // logo text at row 2, cols 2-9
        expect(f[9]).toBe('-'.repeat(28)); // rules rows 5 and 26
        expect(f[11]).toBe('-'.repeat(28));
        expect(f[10]).toBe(' 1   2   3   4   5 '); // labels under the bars
      }
      expect(a[1]).toMatch(/^TEST SONG/);
      expect(a[2]).toMatch(/^BY SOME AUTHOR/);
      expect(a[3].startsWith('2A03')).toBe(true);
      expect(a[3].slice(25, 28)).toBe('NES');
      expect(a[4].slice(0, 2)).toBe('> ');
      expect(a[4].slice(20, 28)).toBe('SONG 1/1'); // right-aligned to col 29, unpadded numbers
      expect(a[5].split(',').map(Number).slice(0, 3).every((n) => n > 0)).toBe(true); // pulse 1, pulse 2, triangle sound
      expect(Number(a[5].split(',')[2])).toBe(18); // triangle is on/off: full bar (18 rows)
      expect(a[5].split(',')[4]).toBe('1'); // no DPCM in this song: only the resting cap line
      expect(d.F30[6]).toContain('SONG - SOME AUTHOR'); // scroller falls back to TITLE - AUTHOR (row 27 of nametable $2800 read as a 32-column ring: it scrolls by hardware)
      expect(b[4].slice(0, 2)).toBe('= '); // Start pauses
      expect(b[5]).toBe('1,1,1,1,1'); // pause silences the engine: bars empty but the resting cap line
      expect(c[4].slice(0, 2)).toBe('> '); // Start resumed
      expect(Number(out.match(/PPUEND (\d+)/)![1])).toBeLessThan(2273 - 7); // last VRAM write ($2006/$2007) of any NMI; the scroller split's $2001/$2005/$2006 writes at scanline 212 are meant to be mid-frame and not counted, counted from the NMI vector (7 cycles)
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120000);
});
