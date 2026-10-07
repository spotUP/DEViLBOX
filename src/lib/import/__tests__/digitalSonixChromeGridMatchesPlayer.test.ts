/**
 * Digital Sonix & Chrome: the grid is the song the player plays, and a grid
 * edit is what UADE then plays.
 *
 * Regression for the parser drawing the track block as rows of four packed
 * "sequence" bytes (0 notes in every corpus file, so the app fell back to the
 * UADE scan grid; gridVsPaula 0.00 on every channel). The track block is four
 * parallel byte tracks of `trackLen` rows; each byte names an 18-byte record
 * (sample + fixed period), 0xFF is no note (DigitalSonixChrome_v1.asm,
 * lbC005400 / lbC005936). Research: thoughts/shared/research/2026-10-06_digitalsonixchrome-format.md
 *
 * The Paula side is UADE's own render of the module. UADE runs the first tick
 * inside _uade_wasm_load, so the log is enabled before the load and the
 * load-time init write (AUDxPER 150 after an AUDxLC write) is its first event.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { openUade, PaulaSession, PaulaNoteOns, PAULA_CHUNK, chipRamEngine, type PaulaLogModule, type PaulaWrite } from '@/engine/__tests__/gridOracle';
import { parseDscFile } from '../formats/DigitalSonixChromeParser';
import { decodeDscModule } from '../formats/DigitalSonixChromeModule';
import { periodToPitch, periodToNote } from '@/lib/amiga/periodNotes';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseModuleToSong } from '../parseModuleToSong';

// The edit test drives the real UADEChipEditor; only the engine singleton is
// replaced by the UADE module this test renders with.
vi.mock('@/engine/uade/UADEEngine', () => ({ UADEEngine: { hasInstance: () => true, getInstance: () => ({}) } }));
// The import route must keep the decoded grid; the UADE scan grid is a sentinel here.
const scanGrid = vi.hoisted(() => ({ name: 'uade-scan-grid', patterns: [], instruments: [] }));
vi.mock('@lib/import/formats/UADEParser', () => ({ parseUADEFile: vi.fn(async () => scanGrid) }));
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';

const NAME = "dragon'sbreath ingame 1.dsc";
const FILE = join(process.cwd(), 'public/data/songs/digital-sonix-and-chrome/David Hanlon', NAME);
const INIT_PITCH = periodToPitch(150);

function load(): Uint8Array {
  return new Uint8Array(readFileSync(FILE));
}

function parse(bytes: Uint8Array): TrackerSong {
  return parseDscFile(bytes.slice().buffer as ArrayBuffer, NAME);
}

/** The pitch of every note-on per channel, in song order (subsong 0, one pass). */
function gridPitches(song: TrackerSong): number[][] {
  const out: number[][] = [[], [], [], []];
  for (const p of song.songPositions) {
    song.patterns[p].channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0) out[ch].push(periodToPitch(r.period!)); }));
  }
  return out;
}

/** Load into UADE (subsong 0, log on from before the load), render `seconds`, calling `at` once at `atSeconds`. Paula note-ons per voice, as pitches. */
async function renderPaula(
  mod: PaulaLogModule, bytes: Uint8Array, seconds: number,
  at?: { seconds: number; run: () => Promise<void> },
): Promise<number[][]> {
  const session = new PaulaSession(mod, bytes, NAME);
  const rule = new PaulaNoteOns('armed');
  const notes: number[][] = [[], [], [], []];
  const feed = (writes: PaulaWrite[]): void => {
    for (const w of writes) {
      const period = rule.push(w);
      if (period !== null) notes[w.voice].push(periodToPitch(period));
    }
  };
  let ran = false;
  for (let f = 0; f < 44100 * seconds; f += PAULA_CHUNK) {
    if (at && !ran && f >= 44100 * at.seconds) { ran = true; feed(session.drain()); await at.run(); }
    const writes = session.step();
    if (!writes) break;
    feed(writes);
  }
  session.close();
  // Drop the load-time init write.
  return notes.map((n) => (n[0] === INIT_PITCH ? n.slice(1) : n));
}

describe('Digital Sonix & Chrome grid matches the player', () => {
  const bytes = load();
  const song = parse(bytes);

  it('decodes the tracks: per-channel note-ons and speed as the replayer plays them', () => {
    expect(song.initialSpeed).toBe(5); // tempo word 286: (143 + 1500) / 286
    expect(gridPitches(song).map((c) => c.length)).toEqual([98, 130, 141, 200]);
    // Order list = entries 0..15, each once (entry 16 is the all-zero terminator).
    expect(song.songPositions.length).toBe(16);
    // A cell's note is the period of the record it triggers.
    const first = song.patterns[song.songPositions[0]].channels[0].rows[0];
    const rec = decodeDscModule(bytes).records[first.instrument - 1];
    expect(first.note).toBe(periodToNote(rec.period));
  });

  it("UADE's Paula note-ons over the whole song are the grid's notes, in order, on every voice", async () => {
    const mod = await openUade();
    try {
      // 16 entries x 64 rows x 5 ticks / 50 Hz = 102.4 s; stop just before the loop.
      const paula = await renderPaula(mod, bytes, 102.3);
      expect(paula).toEqual(gridPitches(song));
    } finally {
      try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
    }
  }, 120_000);

  it('a grid edit written through UADEChipEditor is the note UADE plays', async () => {
    const layout = song.uadePatternLayout!;
    const records = decodeDscModule(bytes).records;
    // The first channel-0 note of the second order position (pattern rows 64..127, from 12.8 s).
    const p = song.songPositions[1];
    const rows = song.patterns[p].channels[0].rows;
    const row = rows.findIndex((c) => c.note > 0);
    const cell = rows[row];
    const newIdx = records.findIndex((r) => periodToPitch(r.period) !== periodToPitch(records[cell.instrument - 1].period));
    const edited = { ...cell, instrument: newIdx + 1, note: periodToNote(records[newIdx].period), period: records[newIdx].period };
    // Index of that note in channel 0's note-on order.
    const before = song.patterns[song.songPositions[0]].channels[0].rows.filter((c) => c.note > 0).length
      + rows.slice(0, row).filter((c) => c.note > 0).length;

    const mod = await openUade();
    try {
      const seconds = ((64 + row) * 5) / 50 + 2;
      const plain = await renderPaula(mod, bytes, seconds);
      const editor = new UADEChipEditor(chipRamEngine(mod));
      const live = await renderPaula(mod, bytes, seconds, {
        seconds: 1, // mid-playback, before the edited row is reached
        run: () => editor.patchPatternCell(layout, p, row, 0, edited),
      });
      expect(plain[0][before]).toBe(periodToPitch(records[cell.instrument - 1].period));
      expect(live[0][before]).toBe(periodToPitch(records[newIdx].period));
      const expected = plain[0].slice();
      expected[before] = periodToPitch(records[newIdx].period);
      expect(live[0]).toEqual(expected);
    } finally {
      try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
    }
  }, 120_000);

  it('importing a .dsc file (the app entry point) gives the decoded grid of the chosen subsong, UADE attached for audio', async () => {
    const fanfares = new Uint8Array(readFileSync(join(process.cwd(), "public/data/songs/formats/dragon'sbreath_fanfares.dsc")));
    const viaApp = await parseModuleToSong(new File([load().slice().buffer as ArrayBuffer], NAME));
    expect(viaApp.name).toContain('[Digital Sonix & Chrome]');
    expect(gridPitches(viaApp).map((c) => c.length)).toEqual([98, 130, 141, 200]);
    expect(viaApp.uadeEditableFileData?.byteLength).toBe(bytes.length);
    expect(viaApp.uadePatternLayout?.formatId).toBe('digitalSonixChrome');
    expect(viaApp.uadePlayerTickGrid).toBe(true);
    const sub1 = await parseModuleToSong(new File([fanfares.slice().buffer as ArrayBuffer], "dragon'sbreath_fanfares.dsc"), 1);
    expect(sub1.songPositions.length).toBe(42); // entries (64,2,64) + (192,40,64)
    // The subsong switch and UADE's pinned load read the same subsongs.
    expect(sub1.uadeEditableSubsongs?.start).toBe(1);
    expect(sub1.uadeEditableSubsongs?.count).toBe(4);
    expect(sub1.uadeEditableSubsongs?.orders?.[1]).toEqual(sub1.songPositions);
    expect(sub1.uadeEditableSubsongs?.orders?.[3]).toEqual([]);
  });
});
