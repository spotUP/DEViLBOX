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
import { loadUADEModule, refreshHeap, type UADEModule } from '../../../../tools/uade-audit/uadeRenderCore';
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
import type { UADEEngine } from '@/engine/uade/UADEEngine';

interface LogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
  _uade_wasm_read_memory(addr: number, dst: number, len: number): number;
  _uade_wasm_write_memory(addr: number, src: number, len: number): number;
}

const NAME = "dragon'sbreath ingame 1.dsc";
const FILE = join(process.cwd(), 'public/data/songs/digital-sonix-and-chrome/David Hanlon', NAME);
const CHUNK = 441; // 10 ms
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

/** Paula note-ons per voice: an AUDxPER write (60..7000) after an AUDxLC write on that voice. */
class PaulaNotes {
  readonly notes: number[][] = [[], [], [], []];
  private readonly armed = [false, false, false, false];
  private readonly mod: LogModule;
  private readonly logPtr: number;
  constructor(mod: LogModule, logPtr: number) { this.mod = mod; this.logPtr = logPtr; }
  drain(): void {
    const n = this.mod._uade_wasm_get_paula_log(this.logPtr, 512);
    refreshHeap(this.mod);
    const u32 = new Uint32Array(this.mod.HEAPU8.buffer, this.logPtr, n * 3);
    for (let i = 0; i < n; i++) {
      const w = u32[i * 3];
      const ch = w >>> 24, reg = (w >>> 16) & 0xff, value = w & 0xffff;
      if (ch > 3) continue;
      if (reg === 0 || reg === 1) this.armed[ch] = true;
      else if (reg === 3 && this.armed[ch] && value >= 60 && value <= 7000) {
        this.armed[ch] = false;
        this.notes[ch].push(periodToPitch(value));
      }
    }
  }
}

/** Load into UADE (subsong 0, log on from before the load), render `seconds`, calling `at` once at `atSeconds`. */
async function renderPaula(
  mod: LogModule, bytes: Uint8Array, seconds: number,
  at?: { seconds: number; run: () => Promise<void> },
): Promise<number[][]> {
  const ptr = mod._malloc(bytes.length);
  refreshHeap(mod);
  mod.HEAPU8.set(bytes, ptr);
  const hintPtr = mod._malloc(NAME.length * 4 + 1);
  mod.stringToUTF8(NAME, hintPtr, NAME.length * 4 + 1);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  mod._uade_wasm_enable_paula_log(1);
  const ret = mod._uade_wasm_load(ptr, bytes.length, hintPtr);
  mod._free(ptr); mod._free(hintPtr);
  if (ret !== 0) throw new Error(`UADE refused ${NAME} (${ret})`);
  const pL = mod._malloc(CHUNK * 4), pR = mod._malloc(CHUNK * 4), logPtr = mod._malloc(512 * 12);
  const paula = new PaulaNotes(mod, logPtr);
  let ran = false;
  for (let f = 0; f < 44100 * seconds; f += CHUNK) {
    if (at && !ran && f >= 44100 * at.seconds) { ran = true; paula.drain(); await at.run(); }
    if (mod._uade_wasm_render(pL, pR, CHUNK) <= 0) break;
    paula.drain();
  }
  mod._uade_wasm_enable_paula_log(0);
  mod._free(pL); mod._free(pR); mod._free(logPtr);
  mod._uade_wasm_stop();
  // Drop the load-time init write.
  return paula.notes.map((n) => (n[0] === INIT_PITCH ? n.slice(1) : n));
}

/** The UADEEngine surface UADEChipEditor uses, backed by the wasm module's chip RAM. */
function chipRamEngine(mod: LogModule): UADEEngine {
  return {
    readMemory: async (addr: number, len: number) => {
      const p = mod._malloc(len);
      mod._uade_wasm_read_memory(addr, p, len);
      refreshHeap(mod);
      const out = mod.HEAPU8.slice(p, p + len);
      mod._free(p);
      return out;
    },
    writeMemory: async (addr: number, data: Uint8Array) => {
      const p = mod._malloc(data.length);
      refreshHeap(mod);
      mod.HEAPU8.set(data, p);
      mod._uade_wasm_write_memory(addr, p, data.length);
      mod._free(p);
    },
  } as unknown as UADEEngine;
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
    const mod = (await loadUADEModule(false)) as LogModule;
    expect(mod._uade_wasm_init(44100)).toBe(0);
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

    const mod = (await loadUADEModule(false)) as LogModule;
    expect(mod._uade_wasm_init(44100)).toBe(0);
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
    const viaApp = await parseModuleToSong(new File([load()], NAME));
    expect(viaApp.name).toContain('[Digital Sonix & Chrome]');
    expect(gridPitches(viaApp).map((c) => c.length)).toEqual([98, 130, 141, 200]);
    expect(viaApp.uadeEditableFileData?.byteLength).toBe(bytes.length);
    expect(viaApp.uadePatternLayout?.formatId).toBe('digitalSonixChrome');
    const sub1 = await parseModuleToSong(new File([fanfares], "dragon'sbreath_fanfares.dsc"), 1);
    expect(sub1.songPositions.length).toBe(42); // entries (64,2,64) + (192,40,64)
  });
});
