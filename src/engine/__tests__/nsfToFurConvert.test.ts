/**
 * NSF import: the wasm converter (furnace-fileops-wasm/src/nsfToFur.cpp)
 * turns one real NSF per sound chip into .fur bytes, and the normal Furnace
 * parser reads notes back on that chip's channels. Channel order is 2A03 (5),
 * then the expansion named in the NSF header, so the expansion starts at 5.
 *
 * Phase 3 (compaction): the converter picks a row length (song speed) from the
 * note onsets, folds per-frame volume/duty/arpeggio/fine pitch into instrument
 * macros and shares identical patterns per channel. Parity is the converter's
 * own replay of the written rows and macros against the GME trace, per frame
 * (nsfLastStatsWasm); it is a model of Furnace's macro and row timing, not a
 * Furnace render.
 */
import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';

const FRAMES = 1200; // 20 s at 60 Hz

// Owner report 2026-11-19 (Metroid Brinstar: "patterns roll very fast and notes are spread out"); outside the repo, run only when present
const METROID = '/Users/spot/Downloads/Metroid (EMU).zophar/Metroid (1986-08)(Nintendo R&D1)(Nintendo).nsf';

// Owner report 2026-11-19 ("too high speed with spread out notes"): noise-channel triplets and flams dragged the row to 1 or 3 frames
const BIONIC = '/Users/spot/Downloads/NSFE/bioniccommando.nsfe';

type Case = { file: string; track: number; chip: string; chans: number[]; frames?: number; path?: string; speed?: number };

const CASES: Case[] = [
  { file: 'dr mario.nsf', track: 0, chip: '2A03', chans: [0, 1, 2] },
  { file: 'akumajou densetsu.nsf', track: 0, chip: 'VRC6', chans: [5, 6, 7] },
  { file: 'lagrange point.nsf', track: 2, chip: 'VRC7', chans: [5, 6, 7, 8, 9, 10] },
  { file: 'metroid (famicom disk system).nsf', track: 3, chip: 'FDS', chans: [5] },
  { file: 'just breed.nsf', track: 0, chip: 'MMC5', chans: [5, 6] },
  { file: 'king of kings (n106).nsf', track: 0, chip: 'N163', chans: [5, 6, 7, 8, 9, 10, 11, 12] },
  { file: 'gimmick!.nsf', track: 0, chip: 'S5B', chans: [5, 6, 7] },
];
if (fs.existsSync(METROID)) CASES.push({ file: 'metroid.nsf', path: METROID, track: 2, chip: '2A03 Brinstar', chans: [0, 1, 2], frames: 5760 });
if (fs.existsSync(BIONIC)) {
  CASES.push({ file: 'bioniccommando.nsfe', path: BIONIC, track: 0, chip: '2A03 Bionic Commando', chans: [0, 1, 2], frames: 1800, speed: 7 });
  CASES.push({ file: 'bioniccommando.nsfe', path: BIONIC, track: 1, chip: '2A03 Bionic Commando', chans: [0, 1, 2], frames: 1800, speed: 6 });
}

beforeAll(async () => {
  installFurnaceFileOpsWasm();
  // first import of the parser and dispatch engine is slow; keep it out of the per-song timeout
  await import('../../lib/import/parsers/FurnaceToSong');
  await import('../../engine/furnace-dispatch/FurnaceDispatchEngine');
}, 300000);

describe('NSF to editable Furnace song', { timeout: 120000 }, () => {
  for (const c of CASES) {
    it(`${c.file} track ${c.track}: ${c.chip} compacts and follows the trace`, async () => {
      const { nsfToFurWasm, nsfLastStatsWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
      const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
      const bytes = c.path ? fs.readFileSync(c.path) : new Uint8Array(readSong(`nsf/${c.file}`));
      const fur = await nsfToFurWasm(new Uint8Array(bytes), c.track, c.frames ?? FRAMES);
      const st = await nsfLastStatsWasm();
      const song = await parseFurnaceFile(fur, c.file.replace(/\.nsf$/, '.fur'));
      const notesOn = (ch: number): number => song.patterns.reduce((n, p) =>
        n + (p.channels[ch]?.rows.filter((r) => r.note > 0 && r.note < 97).length ?? 0), 0);
      const perChan = c.chans.map(notesOn);
      // non-empty cells (all channels) per 64 rows, over the played order
      let cells = 0, rows = 0;
      for (const pi of song.songPositions) {
        const p = song.patterns[pi];
        rows += p.length;
        for (const ch of p.channels) cells += ch.rows.filter((r) => r.note || r.instrument || r.volume || r.effTyp || r.eff).length;
      }
      const per64 = (cells * 64) / rows;
      console.log(`${c.chip} ${c.file}: speed ${song.initialSpeed}, orders ${song.songPositions.length}, patterns ${song.patterns.length}, channel patterns ${st.channelPatterns}, instruments ${song.instruments.length}, cells/64 rows ${per64.toFixed(1)}, grid fit ${(st.gridFit / 10).toFixed(1)}%, parity ${(st.parity / 10).toFixed(1)}% (${st.matchFrames}/${st.activeFrames}), DPCM ${st.dpcmHits}/${st.dpcmTrigs}, notes ${perChan.join('/')}`);
      expect(perChan.filter((n) => n > 0).length, `${c.chip} channels with notes`).toBeGreaterThanOrEqual(c.chip === 'N163' ? 2 : Math.min(2, c.chans.length));
      expect(song.initialSpeed).toBe(st.speed);
      if (c.speed) expect(st.speed, `${c.chip} frames per row`).toBe(c.speed);
      expect(st.parity, `${c.chip} per-frame parity (permille)`).toBeGreaterThanOrEqual(950);
      // shortcut: a second DPCM trigger inside one row is dropped (one note per row); measured, 2 of 123 on VRC6
      expect(st.dpcmHits * 100, 'DPCM triggers kept').toBeGreaterThanOrEqual(st.dpcmTrigs * 98);
      // compacted rows are sparse: at most one non-empty cell per two rows per channel
      if (st.speed > 1) expect(per64, `${c.chip} cells per 64 rows`).toBeLessThan(32 * song.patterns[0].channels.length);
    });
  }
});

/** NSFe built from an NSF: INFO, BANK, auth, a non-identity plst (index 0 -> last song), DATA, NEND. */
function nsfToNsfe(nsf: Uint8Array): Uint8Array {
  const dv = new DataView(nsf.buffer, nsf.byteOffset, nsf.byteLength);
  const songs = nsf[6];
  const cstr = (off: number): Uint8Array => { const s = nsf.subarray(off, off + 32); const z = s.indexOf(0); return s.subarray(0, z < 0 ? 32 : z); };
  const info = new Uint8Array(9);
  const iv = new DataView(info.buffer);
  iv.setUint16(0, dv.getUint16(8, true), true); iv.setUint16(2, dv.getUint16(10, true), true); iv.setUint16(4, dv.getUint16(12, true), true);
  info[6] = nsf[0x7a]; info[7] = nsf[0x7b]; info[8] = songs;
  const auth = [cstr(0x0e), cstr(0x2e), cstr(0x4e)].flatMap((s) => [...s, 0]);
  const chunks: [string, Uint8Array][] = [['INFO', info], ['BANK', nsf.subarray(0x70, 0x78)], ['auth', new Uint8Array(auth)],
    ['plst', new Uint8Array([songs - 1, 0])], ['DATA', nsf.subarray(0x80)], ['NEND', new Uint8Array(0)]];
  const parts: number[] = [...new TextEncoder().encode('NSFE')];
  for (const [id, d] of chunks) {
    parts.push(d.length & 255, (d.length >> 8) & 255, (d.length >> 16) & 255, d.length >>> 24, ...new TextEncoder().encode(id), ...d);
  }
  return new Uint8Array(parts);
}

// Owner report 2026-11-19 ("audio in channel 1 3 4 only, or it varies"): the NSFe time chunk ends
// track 2 at 2301 frames (row 329 of 384), and the empty tail of the last pattern played for 6 s
// before the restart, holding or dropping voices. The song must break at its last traced row.
if (fs.existsSync(BIONIC)) describe('NSF song end', { timeout: 120000 }, () => {
  it('bioniccommando.nsfe track 2 ends at the traced length, not at the pattern end', async () => {
    const { nsfToFurWasm, NSF_DEFAULT_FRAMES } = await import('../../lib/import/wasm/FurnaceFileOps');
    const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
    const fur = await nsfToFurWasm(new Uint8Array(fs.readFileSync(BIONIC)), 2, NSF_DEFAULT_FRAMES);
    const song = await parseFurnaceFile(fur, 'bioniccommando.fur');
    let rows = 0;
    for (const pi of song.songPositions) {
      const p = song.patterns[pi];
      const brk = Array.from({ length: p.length }, (_, r) => r)
        .find((r) => p.channels.some((ch) => ch.rows[r]?.effTyp === 0x0d || ch.rows[r]?.effTyp2 === 0x0d));
      rows += brk === undefined ? p.length : brk + 1;
      if (brk !== undefined) break;
    }
    const traced = Math.round((38283 * 60.0988) / 1000); // NSFe time chunk, track 2
    const frames = rows * song.initialSpeed;
    expect(frames, 'played frames per loop').toBeGreaterThanOrEqual(traced);
    expect(frames, 'played frames per loop').toBeLessThan(traced + 2 * song.initialSpeed + 8);
  });
});

describe('NSFe input', { timeout: 120000 }, () => {
  it('converts the raw song index to the same .fur as the NSF', async () => {
    const { nsfToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
    const nsf = new Uint8Array(readSong('nsf/dr mario.nsf'));
    expect(nsf[6], 'test song needs 2+ songs so the plst remap shows').toBeGreaterThan(1);
    const fromNsf = await nsfToFurWasm(nsf, 0, FRAMES);
    const other = await nsfToFurWasm(nsf, nsf[6] - 1, FRAMES);
    const fromNsfe = await nsfToFurWasm(nsfToNsfe(nsf), 0, FRAMES);
    expect(Buffer.from(other).equals(Buffer.from(fromNsf)), 'songs 0 and last differ').toBe(false);
    expect(Buffer.from(fromNsfe).equals(Buffer.from(fromNsf)), 'NSFe song 0 == NSF song 0').toBe(true);
  });
});

// Phase 4: a dropped NSF goes through the chip-dump dispatcher, converts every track to a
// Furnace subsong and opens on the normal .fur path (owner report: "drag n dropping metroid nsf gives me no pattern data").
// Owner report 2026-11-19: "drag n dropping metroid nsf gives me no pattern data" (the drop opened the
// read-only game-music-emu view). Every track is a subsong; the switch reopens the file at the track.
describe('NSF drop opens an editable song', { timeout: 120000 }, () => {
  const notes = (pats: { channels: { rows: { note: number }[] }[] }[]): number =>
    pats.reduce((n, p) => n + p.channels.reduce((m, ch) => m + ch.rows.filter((r) => r.note > 0 && r.note < 97).length, 0), 0);
  for (const file of ['dr mario.nsf', 'gimmick!.nsf']) {
    it(`${file}: note cells, one subsong per track, another track on a switch`, async () => {
      const { tryChipDumpParse } = await import('../../lib/import/parsers/ChipDumpParsers');
      const bytes = readSong(`nsf/${file}`);
      const tracks = new Uint8Array(bytes)[6];
      let t0 = performance.now();
      const song = await tryChipDumpParse(bytes, file, file, 0);
      const ms0 = performance.now() - t0;
      expect(song?.gmeFileData, 'not the read-only game-music-emu view').toBeUndefined();
      expect(song?.fileSubsongs).toEqual({ count: tracks, current: 0, fileName: file });
      expect(song?.nsfFileData?.byteLength).toBe(bytes.byteLength);
      expect(notes(song!.patterns), 'note cells in track 1').toBeGreaterThan(0);
      t0 = performance.now();
      const next = await tryChipDumpParse(bytes, file, file, 1);
      console.log(`${file}: ${tracks} tracks; track 1 in ${ms0.toFixed(0)} ms (${song!.instruments.length} instruments), track 2 in ${(performance.now() - t0).toFixed(0)} ms`);
      expect(next?.fileSubsongs?.current).toBe(1);
      expect(notes(next!.patterns), 'track 2 holds other pattern data').not.toBe(notes(song!.patterns));
    });
  }
});
