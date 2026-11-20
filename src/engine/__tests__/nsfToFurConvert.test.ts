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
  { file: 'dr mario.nsf', track: 2, chip: '2A03 Dr. Mario t2', chans: [0, 1, 2] },
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
// Owner report 2026-11-19: imports played a silent tail before the loop (fixed 64-row patterns, the
// loop never on a pattern boundary). The grid now comes from the music: the trace loop (voice state
// repeat) or the last sound sets the pattern length, the song ends with 0Bxx to the loop-start order,
// or FF00 for a song that stops. Expected loops come from an independent GME register-trace loop
// finder (frames at 60.0988 Hz). Files outside the repo: run only when present.
const GONDAMIN = '/Users/spot/Downloads/Nintendo Sound Format/Gondamin/bionic commando.nsf';
type EndCase = { name: string; path: string; track: number; loopFrames?: number; lastSound?: number; minGridFit?: number };
const END_CASES: EndCase[] = [
  { name: 'bioniccommando.nsfe track 2', path: BIONIC, track: 2, loopFrames: 1120 },
  { name: 'bioniccommando.nsfe track 4', path: BIONIC, track: 4, loopFrames: 3648 },
  { name: 'Gondamin bionic commando.nsf track 2 (no time chunk)', path: GONDAMIN, track: 2, loopFrames: 1120 },
  // Metroid's R&D1 driver stalls one frame per loop pass (2881 = 360 * 8 + 1, 2137 = 178 * 12 + 1): one 0Fxx long row per
  // loop keeps the grid on the onsets for the whole 9000-frame trace (316 / 238 permille before) and the loop exact
  { name: 'metroid.nsf track 2 (Brinstar)', path: METROID, track: 2, loopFrames: 2881, minGridFit: 950 },
  { name: 'metroid.nsf track 3', path: METROID, track: 3, loopFrames: 2137, minGridFit: 950 },
  // tonal voices repeat from frame 2 every 3936 frames (656 rows at 6); only the triangle length/linear counters and the
  // silent noise registers (stale values from pass 1) differ in raw registers, so no exact raw repeat exists
  { name: 'bioniccommando.nsfe track 7', path: BIONIC, track: 7, loopFrames: 3936 },
  { name: 'bioniccommando.nsfe track 0 (stops)', path: BIONIC, track: 0, lastSound: 893 },
  { name: 'metroid.nsf track 1 (jingle)', path: METROID, track: 1, lastSound: 511 },
].filter((c) => fs.existsSync(c.path));

describe('NSF loop and end come from the music', { timeout: 300000 }, () => {
  for (const c of END_CASES) {
    it(`${c.name}: one end effect on the last played row, no silent tail`, async () => {
      const { nsfToFurWasm, nsfLastStatsWasm, loadFurFileWasm, NSF_DEFAULT_FRAMES } = await import('../../lib/import/wasm/FurnaceFileOps');
      const fur = await nsfToFurWasm(new Uint8Array(fs.readFileSync(c.path)), c.track, NSF_DEFAULT_FRAMES);
      const st = await nsfLastStatsWasm();
      const sub = (await loadFurFileWasm(fur)).nativeData.subsongs[0];
      const sp = sub.speedPattern?.length ? sub.speedPattern : [sub.speed1];
      const framesPerRow = sp.reduce((a, b) => a + b, 0) / sp.length;
      const ends: { pos: number; row: number; cmd: number; val: number }[] = [];
      for (let pos = 0; pos < sub.ordersLen; pos++) {
        sub.channels.forEach((ch, ci) => ch.patterns.get(sub.orders[ci][pos])?.rows.forEach((r, row) =>
          r.effects.forEach((e) => { if (e.cmd === 0x0b || e.cmd === 0x0d || e.cmd === 0xff) ends.push({ pos, row, ...e }); })));
      }
      expect(ends.length, 'one end effect').toBe(1);
      const [end] = ends;
      expect(end.pos, 'end effect in the last order').toBe(sub.ordersLen - 1);
      expect(sub.patLen, 'stats patLen').toBe(st.patLen);
      if (c.minGridFit) expect(st.gridFit, 'onsets on row starts (permille)').toBeGreaterThanOrEqual(c.minGridFit);
      if (c.loopFrames) {
        expect(end.cmd).toBe(0x0b);
        expect(end.row, 'loop jump on the last row').toBe(sub.patLen - 1);
        expect(end.val, 'jump target').toBe(st.loopOrder);
        const loopRows = (sub.ordersLen - end.val) * sub.patLen;
        if (sp.length === 1) {
          // one speed: walk the rows with the 0Fxx speed changes (any channel; the converter puts them on the
          // noise channel), the loop is exact in frames
          let speed = sp[0], frames = 0;
          for (let pos = 0; pos < sub.ordersLen; pos++) {
            for (let row = 0; row < sub.patLen; row++) {
              sub.channels.forEach((ch, ci) => ch.patterns.get(sub.orders[ci][pos])?.rows[row]?.effects.forEach((e) => { if (e.cmd === 0x0f) speed = e.val; }));
              if (pos >= end.val) frames += speed;
            }
          }
          expect(frames, 'loop length in frames').toBe(c.loopFrames);
        } else {
          expect(Math.abs(loopRows * framesPerRow - c.loopFrames), 'loop length in frames').toBeLessThanOrEqual(Math.max(...sp));
        }
      } else {
        expect(end.cmd, 'a song that stops ends with FF').toBe(0xff);
        expect(st.loopOrder).toBe(-2);
        const played = (end.pos * sub.patLen + end.row + 1) * framesPerRow;
        expect(played, 'ends at the last sound, no silent tail').toBeLessThanOrEqual(c.lastSound! + Math.max(...sp) + 1);
        expect(played, 'keeps the music').toBeGreaterThan(c.lastSound! / 2);
      }
    });
  }
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
