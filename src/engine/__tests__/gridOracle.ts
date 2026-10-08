/**
 * Shared oracle kit for "the grid is the player's walk" tests.
 *
 * UADE can log every Paula register write (`_uade_wasm_enable_paula_log` /
 * `_uade_wasm_get_paula_log`). Eight tests used to carry their own copy of the
 * load / render / drain / decode loop and of the "what counts as a note-on"
 * rule; this file is the one copy. The tests keep their format-specific
 * comparison (what a grid cell must equal) and take the Paula side from here.
 *
 * Log word layout (3 x u32 per entry, first word): voice << 24 | register << 16 | value.
 * Registers: 0 AUDxLCH, 1 AUDxLCL, 2 AUDxLEN, 3 AUDxPER, 4 AUDxVOL.
 */
import { loadUADEModule, refreshHeap, type UADEModule } from '../../../tools/uade-audit/uadeRenderCore';
import type { UADEEngine } from '@/engine/uade/UADEEngine';

export const PAULA_REG = { LCH: 0, LCL: 1, LEN: 2, PER: 3, VOL: 4 } as const;
/** One render chunk: 10 ms at 44.1 kHz. */
export const PAULA_CHUNK = 441;
/** Log entries read per drain. */
export const PAULA_LOG_MAX = 512;

export interface PaulaLogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
  _uade_wasm_read_memory(addr: number, dst: number, len: number): number;
  _uade_wasm_write_memory(addr: number, src: number, len: number): number;
  _uade_wasm_set_subsong(n: number): void;
}

/** The slice of a wasm module the log reader needs (also true of the UADE worklet's `_wasm`). */
export interface PaulaLogHost {
  HEAPU8: Uint8Array;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
}

export interface PaulaWrite {
  /** Paula voice 0..3 (the log can carry others; callers filter). */
  voice: number;
  reg: number;
  value: number;
}

/** Sentinel: how many log drains and decoded entries ran. A test that claims to compare against UADE asserts these moved. */
export const oracleStats = { drains: 0, writes: 0 };

/** Decode `n` log entries at `logPtr` (pure over the heap). */
export function decodePaulaLog(heap: Uint8Array, logPtr: number, n: number): PaulaWrite[] {
  const u32 = new Uint32Array(heap.buffer, logPtr, n * 3);
  const out: PaulaWrite[] = [];
  for (let i = 0; i < n; i++) {
    const w = u32[i * 3];
    out.push({ voice: w >>> 24, reg: (w >>> 16) & 0xff, value: w & 0xffff });
  }
  return out;
}

/** Read the writes logged since the last drain. */
export function drainPaulaLog(mod: PaulaLogHost, logPtr: number, max = PAULA_LOG_MAX): PaulaWrite[] {
  const n = mod._uade_wasm_get_paula_log(logPtr, max);
  refreshHeap(mod as unknown as UADEModule);
  oracleStats.drains++;
  oracleStats.writes += n;
  return decodePaulaLog(mod.HEAPU8, logPtr, n);
}

/** Create the UADE wasm module and init it at 44.1 kHz. */
export async function openUade(): Promise<PaulaLogModule> {
  const mod = (await loadUADEModule(false)) as PaulaLogModule;
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('uade init failed');
  return mod;
}

export interface PaulaSessionOptions {
  /** Switch the log on before the load (the init write is then logged too). Default true. */
  logBeforeLoad?: boolean;
  /** Subsong to select after the load (1-based; ignored when <= 1). */
  subsong?: number;
}

/** A module loaded into UADE with the Paula log running, rendered in 10 ms chunks. */
export class PaulaSession {
  readonly mod: PaulaLogModule;
  /** Chunks rendered so far. */
  chunks = 0;
  private readonly pL: number;
  private readonly pR: number;
  private readonly logPtr: number;
  private closed = false;

  constructor(mod: PaulaLogModule, bytes: Uint8Array, name: string, opts: PaulaSessionOptions = {}) {
    const logBeforeLoad = opts.logBeforeLoad ?? true;
    this.mod = mod;
    const ptr = mod._malloc(bytes.length);
    refreshHeap(mod);
    mod.HEAPU8.set(bytes, ptr);
    const hint = mod._malloc(name.length * 4 + 1);
    mod.stringToUTF8(name, hint, name.length * 4 + 1);
    mod._uade_wasm_stop();
    mod._uade_wasm_set_looping(0);
    mod._uade_wasm_set_one_subsong(1);
    if (logBeforeLoad) mod._uade_wasm_enable_paula_log(1);
    const ret = mod._uade_wasm_load(ptr, bytes.length, hint);
    mod._free(ptr); mod._free(hint);
    if (ret !== 0) throw new Error(`UADE refused ${name} (${ret})`);
    if ((opts.subsong ?? 1) > 1) mod._uade_wasm_set_subsong(opts.subsong!);
    if (!logBeforeLoad) mod._uade_wasm_enable_paula_log(1);
    this.pL = mod._malloc(PAULA_CHUNK * 4);
    this.pR = mod._malloc(PAULA_CHUNK * 4);
    this.logPtr = mod._malloc(PAULA_LOG_MAX * 12);
  }

  /** Writes logged but not yet drained (the load's own writes, before the first render). */
  drain(): PaulaWrite[] {
    return drainPaulaLog(this.mod, this.logPtr);
  }

  /** Render one 10 ms chunk. Returns the writes it logged, or null when the song ended. */
  step(): PaulaWrite[] | null {
    if (this.mod._uade_wasm_render(this.pL, this.pR, PAULA_CHUNK) <= 0) return null;
    this.chunks++;
    return this.drain();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.mod._uade_wasm_enable_paula_log(0);
    this.mod._free(this.pL); this.mod._free(this.pR); this.mod._free(this.logPtr);
    this.mod._uade_wasm_stop();
  }
}

/**
 * What the tests call a note-on, as a stateful per-voice rule over the write stream:
 *  - `armed`        a sample-pointer write (LCH or LCL), then a period in 60..7000
 *  - `twoPointers`  two pointer-low writes since the last period, then that period
 *  - `volZeroAfterLen`  a period after (AUDxLEN, AUDxVOL = 0) -- the Fred Editor retrigger
 */
export type NoteOnRule = 'armed' | 'twoPointers' | 'volZeroAfterLen';

export class PaulaNoteOns {
  private readonly armed = [false, false, false, false];
  private readonly pointers = [0, 0, 0, 0];
  private readonly last = [-1, -1, -1, -1];
  private readonly vol0AfterLen = [false, false, false, false];

  private readonly rule: NoteOnRule;

  constructor(rule: NoteOnRule) {
    this.rule = rule;
  }

  /** Feed one write; returns the period when it is a note-on. */
  push(w: PaulaWrite): number | null {
    const ch = w.voice;
    if (ch > 3) return null;
    let on: number | null = null;
    switch (this.rule) {
      case 'armed':
        if (w.reg === PAULA_REG.LCH || w.reg === PAULA_REG.LCL) this.armed[ch] = true;
        else if (w.reg === PAULA_REG.PER && this.armed[ch] && w.value >= 60 && w.value <= 7000) { this.armed[ch] = false; on = w.value; }
        break;
      case 'twoPointers':
        if (w.reg === PAULA_REG.LCL) this.pointers[ch]++;
        else if (w.reg === PAULA_REG.PER) {
          if (this.pointers[ch] >= 2) on = w.value;
          this.pointers[ch] = 0;
        }
        break;
      case 'volZeroAfterLen':
        if (w.reg === PAULA_REG.PER && this.vol0AfterLen[ch]) on = w.value;
        this.vol0AfterLen[ch] = w.reg === PAULA_REG.VOL && w.value === 0 && this.last[ch] === PAULA_REG.LEN;
        this.last[ch] = w.reg;
        break;
    }
    return on;
  }
}

/** Read `len` bytes of 68k memory. */
export function readChipRam(mod: PaulaLogModule, addr: number, len: number): Uint8Array {
  const p = mod._malloc(len);
  mod._uade_wasm_read_memory(addr, p, len);
  refreshHeap(mod);
  const out = mod.HEAPU8.slice(p, p + len);
  mod._free(p);
  return out;
}

/** Write bytes into 68k memory. */
export function writeChipRam(mod: PaulaLogModule, addr: number, data: Uint8Array): void {
  const p = mod._malloc(data.length);
  refreshHeap(mod);
  mod.HEAPU8.set(data, p);
  mod._uade_wasm_write_memory(addr, p, data.length);
  mod._free(p);
}

/** The UADEEngine surface UADEChipEditor uses, backed by the wasm module's chip RAM. */
export function chipRamEngine(mod: PaulaLogModule): UADEEngine {
  return {
    readMemory: async (addr: number, len: number) => readChipRam(mod, addr, len),
    writeMemory: async (addr: number, data: Uint8Array) => writeChipRam(mod, addr, data),
  } as unknown as UADEEngine;
}

// ---------------------------------------------------------------------------
// Grid against the player's walk
// ---------------------------------------------------------------------------

/** What the player showed on one voice for one row. */
export interface WalkCell {
  /** Tracker note (1..96), 97 note off, 0 nothing. */
  note: number;
  /** Instrument number the note started with; 0 when no note started. */
  instrument: number;
  /** Commands the player ran on the row, in order, as [effTyp, param]. */
  fx?: Array<[number, number]>;
}

export interface GridWalkOptions {
  /** Compare the effect columns too (default true when any walk cell carries `fx`). */
  fx?: boolean;
  /** Mismatch lines to return per voice (default 10). */
  limit?: number;
}

/** Sentinel: voices and rows compared by compareGridToWalk. A test claiming the grid is the walk asserts these moved. */
export const walkStats = { voices: 0, rows: 0 };

interface GridCellLike {
  note: number; instrument: number;
  effTyp?: number; eff?: number; effTyp2?: number; eff2?: number; effTyp3?: number; eff3?: number;
  effTyp4?: number; eff4?: number; effTyp5?: number; eff5?: number;
}

function gridFx(c: GridCellLike): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const slots: Array<[number | undefined, number | undefined]> = [
    [c.effTyp, c.eff], [c.effTyp2, c.eff2], [c.effTyp3, c.eff3], [c.effTyp4, c.eff4], [c.effTyp5, c.eff5],
  ];
  for (const [t, p] of slots) if (t) out.push([t, p ?? 0]);
  return out;
}

/** The rows of voice `v` in play order across the song's positions. */
export function gridVoiceRows(song: { songPositions: number[]; patterns: Array<{ channels: Array<{ rows: GridCellLike[] }> }> }, v: number): GridCellLike[] {
  const rows: GridCellLike[] = [];
  for (const p of song.songPositions) rows.push(...song.patterns[p].channels[v].rows);
  return rows;
}

/**
 * The grid is the player's walk when, per voice and row: a note the player started has a
 * cell with the same note and instrument; a note or instrument the grid shows was started by
 * the player on that row (no stray numbers); the commands match in order; and the rows the
 * walk does not cover are empty. Returns the mismatches (empty = the grid is the walk).
 */
export function compareGridToWalk(
  song: { songPositions: number[]; patterns: Array<{ channels: Array<{ rows: GridCellLike[] }> }> },
  walk: WalkCell[][],
  opts: GridWalkOptions = {},
): string[] {
  const limit = opts.limit ?? 10;
  const out: string[] = [];
  for (let v = 0; v < walk.length; v++) {
    walkStats.voices++;
    const grid = gridVoiceRows(song, v);
    const checkFx = opts.fx ?? walk[v].some((w) => w.fx !== undefined);
    let bad = 0;
    const note = (msg: string): void => { if (bad++ < limit) out.push(`voice ${v} ${msg}`); };
    const n = Math.max(grid.length, walk[v].length);
    for (let r = 0; r < n; r++) {
      walkStats.rows++;
      const g = grid[r], w = walk[v][r];
      if (!w) {
        if (g && (g.note !== 0 || g.instrument !== 0 || (checkFx && gridFx(g).length))) note(`row ${r}: the player never reaches it, the grid shows note ${g.note} instrument ${g.instrument}`);
        continue;
      }
      if (!g) { note(`row ${r}: the player decodes it, the grid has no such row`); continue; }
      if (g.note !== w.note || g.instrument !== w.instrument) {
        note(`row ${r}: grid note ${g.note} instrument ${g.instrument}, player note ${w.note} instrument ${w.instrument}`);
      } else if (checkFx) {
        const a = JSON.stringify(gridFx(g)), b = JSON.stringify(w.fx ?? []);
        if (a !== b) note(`row ${r}: grid commands ${a}, player ${b}`);
      }
    }
  }
  return out;
}

/**
 * The Paula writes of `bytes` played from the start, as `chunk:voice:register:value` strings, one entry per write of
 * voices 0..3 (voice-tagged so a test can compare voices apart). A module that does not play yields [].
 */
export async function paulaEventStream(bytes: Uint8Array, name: string, seconds = 8, subsong?: number): Promise<string[]> {
  const uade = await openUade();
  const session = new PaulaSession(uade, bytes, name, subsong ? { subsong } : undefined);
  const out: string[] = [];
  const add = (c: number, w: PaulaWrite[]) => { for (const x of w) if (x.voice < 4) out.push(`${c}:${x.voice}:${x.reg}:${x.value}`); };
  add(0, session.drain());
  for (let c = 1; c <= seconds * 100; c++) { const w = session.step(); if (!w) break; add(c, w); }
  session.close();
  return out;
}

/** Split a paulaEventStream by voice; each entry keeps its `chunk:reg:value`. */
export function eventsOfVoice(events: readonly string[], voice: number): string[] {
  return events.flatMap((e) => { const [chunk, v, reg, value] = e.split(':'); return v === String(voice) ? [`${chunk}:${reg}:${value}`] : []; });
}
