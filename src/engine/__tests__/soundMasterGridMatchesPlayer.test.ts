/**
 * Sound Master: the grid is the song the module's own replayer walks, every
 * byte of the module is represented, and a grid edit is what UADE then plays.
 *
 * Regression for the parser scanning the module for words that look like
 * Amiga periods and dealing them out over four channels (SoundMasterParser
 * "heuristic approach", ledger: Sound Master class B, no grid decoded from the
 * file). Reversed from the replayer each module carries (positions -> blocks
 * of four patterns with transposes -> 2-byte rows, the voices in step):
 * thoughts/shared/research/2026-10-06_sound-master-format.md
 *
 * The Paula side is UADE's render of the module. The replayer writes
 * AUDxLC/AUDxLEN for every voice at the start of each play call (the loop or
 * an empty word) and AUDxPER for every voice at its end, so a note-on is a
 * voice whose sample pointer is written twice (loop pointer, then the note's
 * sample) before its period: that period is the note's.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule, refreshHeap, type UADEModule } from '../../../tools/uade-audit/uadeRenderCore';
import { decodeSoundMasterModule, encodeSoundMasterModule } from '@/lib/import/formats/SoundMasterModule';
import { SmSong, soundMasterGrid } from '@/lib/import/formats/soundMasterGrid';
import { parseSoundMasterFile } from '@/lib/import/formats/SoundMasterParser';
import { exportSoundMaster } from '@/lib/export/SoundMasterExporter';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';

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

const SONGS = 'public/data/songs';
const CORPUS = [
  { path: "sound-master/rackney'sisland 4.sm", layout: 'offsets', steps: 320, notes: [2038, 1851, 1503, 2436] },
  { path: 'sound-master-ii-v3/doofus 3.sm3', layout: 'offsets', steps: 416, notes: [3024, 2175, 1861, 0] },
  { path: 'sound-master-ii-v1/futureshock-level 3.smpro', layout: 'fixed', steps: 147, notes: [964, 904, 500, 294] },
] as const;
const CHUNK = 441; // 10 ms
/** UADE's default subsong timeout (uadeconf.c subsong_timeout). */
const UADE_TIMEOUT_S = 512;

function load(path: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), SONGS, path)));
}

function baseName(path: string): string {
  return path.split('/').pop()!;
}

interface NoteOn { t: number; period: number | null }

/**
 * The note-ons the grid says the player makes, per voice, in song order: a
 * row whose note byte starts a sample (not empty, not $FF hold, not legato,
 * not a II v1 speed/break row), at its row's tick. A portamento note starts
 * its sample at the period it glides from, so its period is not compared.
 */
function gridNoteOns(song: SmSong): NoteOn[][] {
  const out: NoteOn[][] = [[], [], [], []];
  let tick = 0;
  song.steps.forEach((s, si) => {
    for (let r = 0; r < s.rows; r++) {
      for (let v = 0; v < 4; v++) {
        const [n] = song.rowBytes(s.voices[v].pattern, r);
        if (n === 0 || n === 0xff || (n & 0x80) || (song.fixed && (n === 0xfd || n === 0xfe))) continue;
        out[v].push({ t: tick * 20, period: n & 0x40 ? null : song.cell(si, r, v)!.period! });
      }
      tick += song.module.speed;
    }
  });
  return out;
}

/** Paula note-ons per voice: a period written after two sample-pointer writes since the last period. */
class PaulaNotes {
  readonly notes: Array<Array<{ t: number; period: number }>> = [[], [], [], []];
  private readonly lc = [0, 0, 0, 0];
  private readonly mod: LogModule;
  private readonly logPtr: number;
  constructor(mod: LogModule, logPtr: number) { this.mod = mod; this.logPtr = logPtr; }
  drain(ms: number): void {
    const n = this.mod._uade_wasm_get_paula_log(this.logPtr, 512);
    refreshHeap(this.mod);
    const u32 = new Uint32Array(this.mod.HEAPU8.buffer, this.logPtr, n * 3);
    for (let i = 0; i < n; i++) {
      const w = u32[i * 3];
      const ch = w >>> 24, reg = (w >>> 16) & 0xff, value = w & 0xffff;
      if (ch > 3) continue;
      if (reg === 1) this.lc[ch]++;
      else if (reg === 3) {
        if (this.lc[ch] >= 2) this.notes[ch].push({ t: ms, period: value });
        this.lc[ch] = 0;
      }
    }
  }
}

/** Load into UADE (log on from before the load), render up to `seconds`, calling `at` once at `at.seconds`. */
async function renderPaula(
  mod: LogModule, bytes: Uint8Array, name: string, seconds: number,
  at?: { seconds: number; run: () => Promise<void> },
): Promise<{ notes: Array<Array<{ t: number; period: number }>>; endedS: number }> {
  const ptr = mod._malloc(bytes.length);
  refreshHeap(mod);
  mod.HEAPU8.set(bytes, ptr);
  const hintPtr = mod._malloc(name.length * 4 + 1);
  mod.stringToUTF8(name, hintPtr, name.length * 4 + 1);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  mod._uade_wasm_enable_paula_log(1);
  const ret = mod._uade_wasm_load(ptr, bytes.length, hintPtr);
  mod._free(ptr); mod._free(hintPtr);
  if (ret !== 0) throw new Error(`UADE refused ${name} (${ret})`);
  const pL = mod._malloc(CHUNK * 4), pR = mod._malloc(CHUNK * 4), logPtr = mod._malloc(512 * 12);
  const paula = new PaulaNotes(mod, logPtr);
  paula.drain(0);
  let ran = false;
  let f = 0;
  for (; f < 44100 * seconds; f += CHUNK) {
    if (at && !ran && f >= 44100 * at.seconds) { ran = true; await at.run(); }
    if (mod._uade_wasm_render(pL, pR, CHUNK) <= 0) break;
    paula.drain((f / 44100) * 1000);
  }
  mod._uade_wasm_enable_paula_log(0);
  mod._free(pL); mod._free(pR); mod._free(logPtr);
  mod._uade_wasm_stop();
  return { notes: paula.notes, endedS: f / 44100 };
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

async function withUade<T>(run: (mod: LogModule) => Promise<T>): Promise<T> {
  const mod = (await loadUADEModule(false)) as LogModule;
  expect(mod._uade_wasm_init(44100)).toBe(0);
  try {
    return await run(mod);
  } finally {
    try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  }
}

async function parse(bytes: Uint8Array, name: string): Promise<TrackerSong> {
  return parseSoundMasterFile(bytes.slice().buffer as ArrayBuffer, name);
}

function noteCount(song: TrackerSong): number[] {
  const out = [0, 0, 0, 0];
  for (const p of song.songPositions) song.patterns[p].channels.forEach((c, ch) => { out[ch] += c.rows.filter((r) => r.note > 0).length; });
  return out;
}

describe('Sound Master module codec', () => {
  it('decode -> encode is byte-exact on every corpus module', () => {
    for (const path of [...CORPUS.map((c) => c.path), "formats/rackney'sisland_4.sm"]) {
      const bytes = load(path);
      const m = decodeSoundMasterModule(bytes);
      expect(encodeSoundMasterModule(m), path).toEqual(bytes);
    }
  });

  it('the tables are where the player reads them, in both layouts', () => {
    for (const c of CORPUS) {
      const m = decodeSoundMasterModule(load(c.path));
      expect(m.layout, c.path).toBe(c.layout);
    }
    const rack = decodeSoundMasterModule(load(CORPUS[0].path));
    // Header (A3 + $D9): speed 3, 32-byte patterns, restart 1, end 19; 19 positions, 137 blocks.
    expect([rack.speed, rack.patternLength, rack.start, rack.end]).toEqual([3, 32, 1, 19]);
    expect([rack.positions.length, rack.blocks.length, rack.instruments.length, rack.patterns.length, rack.samples.length]).toEqual([19, 137, 39, 72, 22]);
    expect(rack.positions[1]).toEqual({ first: 1, last: 40, transpose: 0xfe, fade: 0x40, voices: [0, 0, 0, 0] });
    const fut = decodeSoundMasterModule(load(CORPUS[2].path));
    // II v1: fixed tables from A3 = $810; speed 6, start 0, end 20; 42 patterns ($540 bytes).
    expect([fut.vars, fut.speed, fut.patternLength, fut.start, fut.end, fut.patterns.length]).toEqual([0x810, 6, 32, 0, 20, 42]);
    expect(fut.positions[1]).toEqual({ first: 4, last: 13, transpose: 3, fade: 0x40, voices: [0, 0, 0, 0] });
  });

  it('every grid cell re-encodes to its own two bytes where it sits', () => {
    for (const c of CORPUS) {
      const song = new SmSong(load(c.path));
      const grid = soundMasterGrid(song);
      let cells = 0;
      song.steps.forEach((s, i) => s.voices.forEach((v, ch) => {
        for (let r = 0; r < s.rows; r++) {
          cells++;
          expect(song.encodeRow(grid[i][ch][r], v.ctx[r]), `${c.path} step ${i} row ${r} voice ${ch}`).toEqual(song.rowBytes(v.pattern, r));
        }
      }));
      expect(cells).toBeGreaterThan(9000);
    }
  });

  it('the exporter returns the module for an unedited song and writes a grid edit into its pattern', async () => {
    const bytes = load(CORPUS[0].path);
    const song = await parse(bytes, baseName(CORPUS[0].path));
    expect(exportSoundMaster(song).data).toEqual(bytes);
    const cell = song.patterns[3].channels[0].rows.find((r) => r.note > 0)!;
    const row = song.patterns[3].channels[0].rows.indexOf(cell);
    song.patterns[3].channels[0].rows[row] = { ...cell, note: cell.note + 1 };
    const out = exportSoundMaster(song);
    expect(out.warnings).toEqual([]);
    const again = new SmSong(out.data);
    expect(again.cell(3, row, 0)!.note).toBe(cell.note + 1);
    expect(out.data.length).toBe(bytes.length);
    expect([...out.data].filter((b, i) => b !== bytes[i]).length).toBe(1);
  });
});

describe('Sound Master grid matches the player', () => {
  it('the grid is the song walk: one pattern per block played, notes per voice', async () => {
    for (const c of CORPUS) {
      const song = await parse(load(c.path), baseName(c.path));
      expect(song.patterns.length, c.path).toBe(c.steps);
      expect(noteCount(song), c.path).toEqual(c.notes);
    }
    const rack = await parse(load(CORPUS[0].path), baseName(CORPUS[0].path));
    expect(rack.initialSpeed).toBe(3);
    // Position 1 = blocks 1..40, transpose -2: the first grid pattern is block 1.
    expect(rack.patterns[0].name).toBe('Position 1 block 1');
    expect(rack.patterns[0].length).toBe(16);
  });

  it.each(CORPUS.map((c) => [c.path]))("UADE's Paula note-ons over the whole song are the grid's, period-exact and on their row: %s", async (path) => {
    const bytes = load(path);
    const song = new SmSong(bytes);
    const expected = gridNoteOns(song);
    const songMs = song.steps.reduce((a, s) => a + s.rows, 0) * song.module.speed * 20;
    const { notes, endedS } = await withUade((mod) => renderPaula(mod, bytes, baseName(path), songMs / 1000 + 2));
    // The song ends where the walk says it does (UADE's song-end patch on the
    // position wrap) - or at UADE's own subsong timeout, whichever is first.
    expect(Math.abs(endedS * 1000 - Math.min(songMs, UADE_TIMEOUT_S * 1000))).toBeLessThanOrEqual(60);
    for (let v = 0; v < 4; v++) {
      const exp = expected[v].filter((n) => n.t < endedS * 1000 - 40);
      const got = notes[v];
      expect(got.length, `${path} voice ${v}`).toBe(exp.length);
      for (let i = 0; i < exp.length; i++) {
        if (exp[i].period !== null) expect(got[i].period, `${path} voice ${v} note ${i}`).toBe(exp[i].period);
        // One play call (20 ms) plus the 10 ms render grain.
        expect(Math.abs(got[i].t - exp[i].t), `${path} voice ${v} note ${i} time`).toBeLessThanOrEqual(30);
      }
    }
  }, 120_000);

  it('a grid edit written through UADEChipEditor is the note UADE plays', async () => {
    const path = CORPUS[0].path;
    const bytes = load(path);
    const song = await parse(bytes, baseName(path));
    const walk = new SmSong(bytes);
    // A voice-0 note whose pattern row is first played after 2 s.
    const firstUse = new Map<string, number>();
    let tick = 0;
    let target: { step: number; row: number } | null = null;
    walk.steps.forEach((s, si) => {
      for (let r = 0; r < s.rows; r++) {
        const key = `${s.voices[0].pattern}:${r}`;
        if (!firstUse.has(key)) firstUse.set(key, tick);
        const [n] = walk.rowBytes(s.voices[0].pattern, r);
        if (!target && tick * 20 > 2000 && firstUse.get(key) === tick && n > 0 && n < 0x40) target = { step: si, row: r };
        tick += walk.module.speed;
      }
    });
    expect(target).not.toBeNull();
    const { step, row } = target!;
    const cell = song.patterns[step].channels[0].rows[row];
    const edited: TrackerCell = { ...cell, note: cell.note + 2 };
    const runs = walk.edit(step, row, 0, edited)!;
    expect(runs.length).toBe(1);
    const plainExp = gridNoteOns(new SmSong(bytes));
    const editedExp = gridNoteOns(walk);
    const seconds = 12;
    const periods = (n: Array<{ period: number | null }>) => n.map((x) => x.period);
    const within = (n: NoteOn[]) => n.filter((x) => x.t < seconds * 1000 - 100);
    expect(periods(within(editedExp[0]))).not.toEqual(periods(within(plainExp[0])));

    await withUade(async (mod) => {
      const editor = new UADEChipEditor(chipRamEngine(mod));
      const live = await renderPaula(mod, bytes, baseName(path), seconds, {
        seconds: 1, // mid-playback, before the edited row is first reached
        run: () => editor.patchPatternCell(song.uadePatternLayout!, step, row, 0, edited),
      });
      for (let v = 0; v < 4; v++) {
        const exp = within(editedExp[v]);
        expect(live.notes[v].slice(0, exp.length).map((x) => x.period), `voice ${v}`).toEqual(periods(exp));
      }
    });
  }, 120_000);

  it('importing a Sound Master module (the app entry point) gives the decoded grid, UADE attached for audio, rows in player ticks', async () => {
    for (const c of CORPUS) {
      const bytes = load(c.path);
      const viaApp = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], baseName(c.path)));
      expect(viaApp.name, c.path).toContain('[Sound Master]');
      expect(noteCount(viaApp), c.path).toEqual(c.notes);
      expect(viaApp.uadeEditableFileData?.byteLength).toBe(bytes.length);
      expect(viaApp.uadePatternLayout?.formatId).toBe('soundMaster');
      expect(viaApp.uadePlayerTickGrid).toBe(true);
    }
  });
});
