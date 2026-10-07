/**
 * Fred Editor: the grid is the song the replayer plays - every note, at its
 * period, on its tick, on every voice.
 *
 * Regression for the grid built one pattern per track-list position with the
 * four voices in step, each pattern cut at 64 rows and holds counted as rows:
 * notes were dropped and shifted on voices whose patterns are shorter or
 * longer than their neighbours' (gridVsPaula fireworks ii.fred
 * 0.89/0.44/0.71/0.88). Research: thoughts/shared/research/2026-10-06_fred-editor-format.md
 *
 * The oracle is UADE running the replay code inside the .fred file. A note-on
 * is the replayer's Lab2_NoteTrack burst on one voice: AUDxLC, AUDxLEN,
 * AUDxVOL = 0, AUDxPER - the period is PeriodTable[note] * InsPer >> 10, the
 * first period written for the note (the ones after it are arpeggio,
 * vibrato and portamento). A grid row is one line = `initialSpeed` ticks of
 * the 50 Hz play call.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { openUade, PaulaSession, PaulaNoteOns, PAULA_CHUNK, type PaulaLogModule } from '@/engine/__tests__/gridOracle';
import { parseFredEditorFile } from '../formats/FredEditorParser';
import { decodeFredModule } from '../formats/FredEditorModule';
import { exportFredEditor } from '@lib/export/FredEditorExporter';
import { applyFredGridEdits, walkFredSong } from '../formats/fredEditorGrid';
import type { TrackerSong } from '@/engine/TrackerReplayer';

// The import route must keep the decoded grid; the UADE scan grid is a sentinel here.
const scanGrid = vi.hoisted(() => ({ name: 'uade-scan-grid', patterns: [], instruments: [] }));
vi.mock('@lib/import/formats/UADEParser', () => ({ parseUADEFile: vi.fn(async () => scanGrid) }));
import { parseModuleToSong } from '../parseModuleToSong';

/** Lab2_PeriodTable. */
const PERIODS = [
  8192, 7728, 7296, 6888, 6504, 6136, 5792, 5464, 5160, 4872, 4600, 4336,
  4096, 3864, 3648, 3444, 3252, 3068, 2896, 2732, 2580, 2436, 2300, 2168,
  2048, 1932, 1824, 1722, 1626, 1534, 1448, 1366, 1290, 1218, 1150, 1084,
  1024, 966, 912, 861, 813, 767, 724, 683, 645, 609, 575, 542,
  512, 483, 456, 430, 406, 383, 362, 341, 322, 304, 287, 271,
  256, 241, 228, 215, 203, 191, 181, 170, 161, 152, 143, 135,
];


const load = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), p)));

/** Every note-on per channel of the grid: its tick (row * speed) and the period the replayer writes. */
function gridNoteOns(song: TrackerSong, bytes: Uint8Array): { tick: number; period: number }[][] {
  const m = decodeFredModule(bytes);
  const insPer = (i: number) => (m.instruments[i][8] << 8) | m.instruments[i][9];
  const out: { tick: number; period: number }[][] = [[], [], [], []];
  const ins = [-1, -1, -1, -1];
  let row = 0;
  for (const p of song.songPositions) {
    const pat = song.patterns[p];
    for (let r = 0; r < pat.length; r++, row++) {
      pat.channels.forEach((c, ch) => {
        const cell = c.rows[r];
        if (cell.instrument > 0) ins[ch] = cell.instrument - 1;
        if (cell.note > 0 && cell.note < 97) {
          out[ch].push({ tick: row * song.initialSpeed, period: Math.floor((PERIODS[cell.note + 11] * insPer(ins[ch])) / 1024) });
        }
      });
    }
  }
  return out;
}

/** UADE's note-on bursts per voice over `seconds`. */
function paulaNoteOns(mod: PaulaLogModule, bytes: Uint8Array, name: string, seconds: number): { ms: number; period: number }[][] {
  const session = new PaulaSession(mod, bytes, name);
  const rule = new PaulaNoteOns('volZeroAfterLen');
  const out: { ms: number; period: number }[][] = [[], [], [], []];
  for (let c = 0; c < (seconds * 44100) / PAULA_CHUNK; c++) {
    const writes = session.step();
    if (!writes) break;
    for (const w of writes) {
      const period = rule.push(w);
      if (period !== null) out[w.voice].push({ ms: c * 10, period });
    }
  }
  session.close();
  return out;
}

const SONGS = [
  { path: 'public/data/songs/fredmon/fireworks ii.fred', notes: [342, 252, 98, 522] },
  { path: 'public/data/songs/formats/rebels.fred', notes: [482, 966, 693, 1302] },
  { path: 'public/data/songs/formats/bomb jack.fred', notes: [190, 258, 336, 0] },
];

describe('Fred Editor grid matches the replayer', () => {
  for (const { path, notes } of SONGS) {
    const name = path.split('/').pop()!;
    it(`${name}: UADE's note-ons over the whole song are the grid's, in order, at the grid's periods, within a tick of its rows`, async () => {
      const bytes = load(path);
      const song = await parseFredEditorFile(bytes.slice().buffer as ArrayBuffer, name);
      const grid = gridNoteOns(song, bytes);
      expect(grid.map((c) => c.length)).toEqual(notes);
      const rows = song.patterns.reduce((n, p) => n + p.length, 0);
      const mod = await openUade();
      try {
        // The whole grid, stopping before the second pass reaches the first notes again.
        const paula = paulaNoteOns(mod, bytes, name, (rows * song.initialSpeed) / 50);
        for (let ch = 0; ch < 4; ch++) {
          const g = grid[ch], p = paula[ch].slice(0, g.length);
          expect(p.map((x) => x.period), `voice ${ch} periods`).toEqual(g.map((x) => x.period));
          if (!g.length) continue;
          const offset = p[0].ms - g[0].tick * 20;
          // One 50 Hz tick plus the 10 ms log grain (and UADE's vblank clock drift over the song).
          const drift = p.map((x, i) => Math.abs(x.ms - (g[i].tick * 20 + offset)));
          expect(Math.max(...drift), `voice ${ch} timing`).toBeLessThanOrEqual(40);
        }
      } finally {
        try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
      }
    }, 120_000);
  }

  it('importing a .fred file (the app entry point) gives the decoded grid, played by FredReplayer2', async () => {
    const path = SONGS[0].path, name = path.split('/').pop()!;
    const bytes = load(path);
    const song = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], name));
    expect(song.name).not.toBe('uade-scan-grid');
    expect(gridNoteOns(song, bytes).map((c) => c.length)).toEqual(SONGS[0].notes);
    expect(song.fredReplayerFileData?.byteLength).toBe(bytes.length);
    expect(song.uadeEditableFileData).toBeUndefined();
  }, 60_000);

  for (const file of ['bomb jack.fred', 'fuzzball-title.fred']) {
    it(`${file}: every Fred Editor note shows the instrument the player uses, and no voice shows a command the player does not execute`, async () => {
      const bytes = load(`public/data/songs/formats/${file}`);
      const m = decodeFredModule(bytes);
      const song = await parseFredEditorFile(bytes.slice().buffer as ArrayBuffer, file);
      // Replay of the player's own state: the instrument is the last $83 any earlier line of the voice read.
      const walk = walkFredSong(m);
      const missing: string[] = [];
      let notes = 0;
      walk.voices.forEach((refs, ch) => {
        let ins: number | undefined;
        let sounding = false;
        refs.forEach((ref, r) => {
          const line = ref ? m.patterns[ref.pattern].lines[ref.line] : undefined;
          if (line?.instrument !== undefined) ins = line.instrument;
          const cell = song.patterns[Math.floor(r / 64)].channels[ch].rows[r % 64];
          if (line?.note !== undefined) {
            sounding = true; notes++;
            if (cell.instrument !== (ins ?? -1) + 1 || cell.instrument === 0) missing.push(`v${ch} row ${r}`);
          } else if (line?.pause) {
            // $84 on a voice with DMA already off executes nothing audible: not shown as a note-off.
            if (!sounding) { if (cell.note !== 0) missing.push(`v${ch} row ${r} idle pause shown`); }
            sounding = false;
          }
        });
      });
      expect(notes).toBeGreaterThan(0);
      expect(missing.slice(0, 5)).toEqual([]);
      // Voice 4 of bomb jack never sounds: only the one row that selects its instrument shows anything.
      if (file === 'bomb jack.fred') {
        const v3 = song.patterns.flatMap((p) => p.channels[3].rows).filter((c) => c.note || c.instrument);
        expect(v3.length).toBeLessThanOrEqual(1);
        expect(v3.every((c) => c.note === 0)).toBe(true);
      }
      // The carried instrument is display only: export of the untouched grid is the file, and re-writing
      // a carried cell as shown adds no $83 byte.
      expect([...(await exportFredEditor(song)).data]).toEqual([...bytes]);
      const first = song.patterns[0].channels[0].rows.findIndex((c, i) => c.note > 0 && c.instrument > 0 && m.patterns[walk.voices[0][i]!.pattern].lines[walk.voices[0][i]!.line].instrument === undefined);
      expect(first).toBeGreaterThanOrEqual(0);
      const edited = applyFredGridEdits(bytes, [{ pattern: 0, row: first, channel: 0, cell: { ...song.patterns[0].channels[0].rows[first], note: song.patterns[0].channels[0].rows[first].note } }]);
      expect([...edited]).toEqual([...bytes]);
    });
  }
});
