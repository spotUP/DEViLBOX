/**
 * NerdTracker II import: the wasm converter (furnace-fileops-wasm/src/nedToFur.cpp)
 * turns a real .ned song into .fur bytes, and the normal Furnace parser reads
 * it back as a 5-channel NES song. Expected counts come from the .ned header
 * read here, independent of the converter (wrapper at 0x2a/0x2c, temp.dat at
 * 0x34 + n*229 + sample bytes: speed t[3], instruments t[5], song length t[7]).
 *
 * The songs live outside the repo (~/Downloads/NerdTracker 2) and are never
 * committed; the suite skips when the folder is missing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';

const DIR = path.join(os.homedir(), 'Downloads', 'NerdTracker 2');
const HAVE = fs.existsSync(DIR);

function header(b: Uint8Array): { nDpcm: number; speed: number; nIns: number; songLen: number } {
  const nDpcm = b[0x2a] | (b[0x2b] << 8);
  const smp = (b[0x2c] | (b[0x2d] << 8) | (b[0x2e] << 16) | (b[0x2f] << 24)) >>> 0;
  const t = 0x34 + nDpcm * 229 + smp;
  return { nDpcm, speed: b[t + 3] || 6, nIns: b[t + 5], songLen: b[t + 7] };
}

function listNed(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listNed(p);
    return /\.ned$/i.test(e.name) ? [p] : [];
  });
}

// dpcmNotes: the reference dump (nt2dump.c) shows notes in the DMC column
type Case = { file: string; dpcmNotes: boolean };
const ICE = 'Memblers/beyond the ice palace.ned';
const CASES: Case[] = [
  { file: 'Memblers/kungfu.ned', dpcmNotes: false },
  { file: 'Memblers/gradius.ned', dpcmNotes: true },
  // one 2-byte DPCM instrument, never played
  { file: "Memblers/super fighter (lan's theme).ned", dpcmNotes: false },
  { file: ICE, dpcmNotes: true },
];

beforeAll(async () => {
  if (!HAVE) return;
  installFurnaceFileOpsWasm();
  await import('../../lib/import/parsers/FurnaceToSong');
  await import('../../engine/furnace-dispatch/FurnaceDispatchEngine');
}, 300000);

describe.skipIf(!HAVE)('NerdTracker II to editable Furnace song', { timeout: 120000 }, () => {
  for (const c of CASES) {
    it(`${c.file}: orders, speed, instruments and cells`, async () => {
      const { nedToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
      const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
      const bytes = new Uint8Array(fs.readFileSync(path.join(DIR, c.file)));
      const h = header(bytes);
      const song = await parseFurnaceFile(await nedToFurWasm(bytes), c.file.replace(/\.ned$/, '.fur'));
      const notes = (ch: number): number => song.songPositions.reduce((n, pi) =>
        n + (song.patterns[pi].channels[ch]?.rows.filter((r) => r.note > 0 && r.note < 97).length ?? 0), 0);
      const perChan = [0, 1, 2, 3, 4].map(notes);
      console.log(`${c.file}: speed ${song.initialSpeed}, orders ${song.songPositions.length}, patterns ${song.patterns.length}, instruments ${song.instruments.length}, DPCM ${h.nDpcm}, notes ${perChan.join('/')}`);
      expect(song.patterns[0].channels.length).toBe(5);
      expect(song.songPositions.length).toBe(h.songLen);
      expect(song.initialSpeed).toBe(h.speed);
      expect(song.patterns[0].length).toBe(64);
      // pulse 1, pulse 2 and triangle carry notes in all three songs
      expect(perChan.slice(0, 3).every((n) => n > 0), 'notes on pulse 1/2 and triangle').toBe(true);
      if (c.dpcmNotes) expect(perChan[4], 'DPCM notes').toBeGreaterThan(0);
      else expect(perChan[4], 'DPCM notes').toBe(0);
      // at least one instrument per used NT2 instrument kind, plus one per DPCM instrument
      expect(song.instruments.length).toBeGreaterThanOrEqual(Math.min(1, h.nIns) + h.nDpcm);
      // every note cell names an instrument that exists
      const ids = new Set(song.instruments.map((i) => i.id));
      for (const pi of song.songPositions) for (const ch of song.patterns[pi].channels) for (const r of ch.rows) {
        if (r.note > 0 && r.note < 97 && r.instrument) expect(ids.has(r.instrument), `instrument ${r.instrument}`).toBe(true);
      }
    });
  }

  // NT2 effects last one row and an instrument cell reloads the volume; Furnace 0A and the
  // volume column persist, so an unstopped A02 or C04 left pulse 1/2 and noise silent here.
  it.skipIf(!fs.existsSync(path.join(DIR, ICE)))(`${ICE}: volume slides stop and instrument cells reset the volume`, async () => {
    const { nedToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
    const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
    const song = await parseFurnaceFile(await nedToFurWasm(new Uint8Array(fs.readFileSync(path.join(DIR, ICE)))), 'ice.fur');
    for (const ch of [0, 1, 3]) {
      // walk play order: a sliding or volume-changed channel must reach a stop and a reset
      let sliding = false, dirty = false, stops = 0, resets = 0;
      for (const pi of song.songPositions) for (const r of song.patterns[pi].channels[ch].rows) {
        if (r.instrument && dirty) { expect(r.volume, `channel ${ch} volume reset on instrument cell`).toBeGreaterThan(0); resets++; }
        if (r.instrument) dirty = false;
        if (r.volume) dirty = true;
        if (r.effTyp === 10 && r.eff) sliding = dirty = true;
        else if (r.effTyp === 10 && sliding) { sliding = false; stops++; }
      }
      expect(stops, `channel ${ch} slide stops`).toBeGreaterThan(0);
      expect(resets, `channel ${ch} volume resets`).toBeGreaterThan(0);
    }
  });

  // NES period Furnace plays for a note in non-linear (period) pitch with E5xx fine pitch:
  // pitchTable.cpp getBase at 1789773 Hz / 16, minus pitch, minus 1 (platform/nes.cpp).
  function furPeriod(note: number, e5: number): number {
    const fb = (nb: number) => 440 * 0.0625 * Math.pow(2, (nb + 3) / 12);
    let shift = 0;
    while (shift < 14 && Math.round(1789773 / fb((shift - 4) * 12) / 16) > 0x800) shift++;
    let root = Math.round(1789773 / fb((note % 12) + (shift - 5) * 12) / 16);
    const oct = Math.floor(note / 12) - shift;
    if (oct > 0) { const carry = root & (1 << (oct - 1)); root >>= oct; if (carry) root++; }
    return root - (e5 - 0x80) - 1;
  }
  const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

  // Periods measured from the NSF rip (Mesen, first row): triangle 0x327 with vibrato 0x323..0x32a.
  // NT2 writes the pulse period to the triangle too, and its table is not equal-tempered, so the
  // note must use the pulse divider and E5xx must land on the NT2 period exactly.
  it.skipIf(!fs.existsSync(path.join(DIR, ICE)))(`${ICE}: triangle period, fine pitch and auto vibrato match NT2`, async () => {
    const { nedToFurWasm, saveFurTextWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
    await nedToFurWasm(new Uint8Array(fs.readFileSync(path.join(DIR, ICE))));
    const text = await saveFurTextWasm();
    const lines = text.split('\n');
    const row0 = lines[lines.findIndex((l) => l.startsWith('----- ORDER 00')) + 1].split('|');
    const tri = row0[3].trim().split(/\s+/); // note, instrument, volume, effects
    const note = 60 + 12 * Number(tri[0][2]) + NOTE_NAMES.indexOf(tri[0].slice(0, 2));
    const e5 = tri.slice(3).find((f) => f.startsWith('E5'));
    expect(e5, 'triangle fine pitch E5xx').toBeDefined();
    const per = furPeriod(note, e5 ? parseInt(e5.slice(2), 16) : 0x80);
    expect(Math.abs(per - 0x327) / 0x327, `triangle period ${per.toString(16)}`).toBeLessThan(0.03);
    expect(per, 'triangle period equals the NT2 period').toBe(0x327);
    // instrument 04 auto vibrato b2 = $B2 (speed 11, depth 2): pitch macro = -period delta
    const at = lines.findIndex((l) => /^## [0-9A-F]+: NT2 04 triangle/.test(l));
    const pitchLine = lines.slice(at, at + 8).find((l) => l.trim().startsWith('- pitch:'));
    expect(pitchLine, 'triangle vibrato pitch macro').toBeDefined();
    const vals = (pitchLine ?? '').replace(/.*pitch:/, '').trim().split(/\s+/).filter((v) => /^-?\d+$/.test(v)).map(Number);
    expect(Math.min(...vals)).toBe(-3); // period 0x32a
    expect(Math.max(...vals)).toBe(4); // period 0x323
    expect(vals.slice(0, 6)).toEqual([0, 0, -3, -3, 1, 4]); // NSF: 327 327 32a 32a 326 323
  });

  it('every .ned in the folder converts', async () => {
    const { nedToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
    const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
    const failed: string[] = [];
    const files = listNed(DIR);
    for (const f of files) {
      const bytes = new Uint8Array(fs.readFileSync(f));
      try {
        const song = await parseFurnaceFile(await nedToFurWasm(bytes), 'x.fur');
        if (song.songPositions.length !== header(bytes).songLen) failed.push(`${f}: order count`);
      } catch (e) { failed.push(`${f}: ${(e as Error).message}`); }
    }
    console.log(`NED sweep: ${files.length - failed.length}/${files.length} converted\n${failed.join('\n')}`);
    expect(failed).toEqual([]);
  }, 600000);
  // The converter builds into the engine's shared song; a "Noname" .ned must not keep the
  // previous song's name (DivSong::unload leaves header text), so the parser falls back to the filename.
  it('a .ned opened after a named .fur takes the filename, not the old name', async () => {
    const { loadFurFileWasm, nedToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
    const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
    const fur = fs.readFileSync(path.join(process.cwd(), 'public/data/songs/furnace/nes/Byte-Sized Bop.fur'));
    const prev = await loadFurFileWasm(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.byteLength));
    expect(prev.name).not.toBe('');
    const bytes = new Uint8Array(fs.readFileSync(path.join(DIR, 'Memblers/kungfu.ned')));
    const song = await parseFurnaceFile(await nedToFurWasm(bytes), 'kungfu.fur');
    expect(song.name).toBe('kungfu');
  });
});
