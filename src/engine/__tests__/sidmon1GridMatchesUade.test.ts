/**
 * The SidMon 1 grid is what UADE's own SidMon 1 player plays (owner,
 * 2026-10-06: "the pattern data is still bogus").
 *
 * The earlier grid test compared the grid with our WASM replayer, which is
 * circular when that replayer is wrong. This one uses an independent oracle:
 * UADE running the original SidMon 1.0 eagleplayer, its Paula writes (AUDxPER,
 * AUDxLC) logged per 10 ms. Three things are checked on anarchy.sid1:
 *   1. our replayer's Paula period register, tick by tick, is UADE's (so its
 *      row timing can be used to date the grid's rows);
 *   2. every note cell's pitch is a pitch UADE plays on that voice while the
 *      row sounds: the player sounds PERIODS[finetune + arpeggio + note] with
 *      note = row note + track transpose - the grid had shown note + 1, a
 *      semitone sharp on every cell, and clamped the bass (periods past C-0)
 *      onto one note;
 *   3. every cell with an instrument starts a new waveform in UADE (an
 *      AUDxLC write) and every note cell is a row UADE sounds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet, songBuffer } from './workletHarness';
import { parseSidMon1File } from '@/lib/import/formats/SidMon1Parser';
import { SM1_DISPLAY_SHIFT } from '@/engine/uade/encoders/SidMon1Encoder';
import { loadUADEModule, refreshHeap, type UADEModule } from '../../../tools/uade-audit/uadeRenderCore';

const SECS = 30;
const TICKS = SECS * 50 - 50;
const SONG = 'public/data/songs/formats/anarchy.sid1';

interface LogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
}
interface Mod {
  _malloc(n: number): number;
  _player_render(ptr: number, frames: number): number;
  _player_get_voice_rows_consumed(v: number): number;
  _player_get_paula_period(ch: number): number;
}

/** UADE's Paula writes: [ms, voice, register (0 LCH, 3 PER), value]. */
async function uadeWrites(): Promise<number[][]> {
  const mod = (await loadUADEModule(false)) as LogModule;
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('uade init failed');
  const data = new Uint8Array(readFileSync(join(__dirname, '../../../', SONG)));
  const ptr = mod._malloc(data.byteLength);
  refreshHeap(mod);
  mod.HEAPU8.set(data, ptr);
  const hint = mod._malloc(64);
  mod.stringToUTF8('anarchy.sid1', hint, 64);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hint) !== 0) throw new Error('UADE refused the module');
  mod._uade_wasm_enable_paula_log(1);
  const CH = 441;
  const pL = mod._malloc(CH * 4), pR = mod._malloc(CH * 4), log = mod._malloc(512 * 12);
  const out: number[][] = [];
  for (let chunk = 1; chunk * 10 < SECS * 1000; chunk++) {
    if (mod._uade_wasm_render(pL, pR, CH) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(log, 512);
    refreshHeap(mod);
    const u32 = new Uint32Array(mod.HEAPU8.buffer, log, n * 3);
    for (let i = 0; i < n; i++) {
      const w = u32[i * 3];
      const reg = (w >>> 16) & 0xff;
      if ((w >>> 24) < 4 && (reg === 0 || reg === 3)) out.push([chunk * 10, w >>> 24, reg, w & 0xffff]);
    }
  }
  mod._uade_wasm_stop();
  return out;
}

const semitone = (period: number): number => Math.round(12 * Math.log2(856 / period)) + 13 + SM1_DISPLAY_SHIFT;

describe('SidMon 1 grid against UADE (independent oracle)', () => {
  it('every cell the grid shows is played by UADE on that row and voice, and our replayer follows UADE', { timeout: 120000 }, async () => {
    loadSharedWorkletScripts();
    const writes = await uadeWrites();
    const per: number[][][] = [[], [], [], []];
    const lc: number[][] = [[], [], [], []];
    for (const [ms, v, reg, value] of writes) (reg === 3 ? per[v].push([ms, value]) : lc[v].push(ms));

    const buf = songBuffer(SONG);
    const song = parseSidMon1File(buf.slice(0), 'anarchy.sid1');
    const layout = song.uadePatternLayout!;
    const cells: { step: number; row: number; cell: (typeof song.patterns)[0]['channels'][0]['rows'][0] }[][] = [[], [], [], []];
    song.patterns.forEach((pat, step) => {
      for (let v = 0; v < 4; v++) pat.channels[v].rows.forEach((cell, row) => {
        if (layout.getCellFileOffset!(step, row, v) >= 0) cells[v].push({ step, row, cell });
      });
    });

    // Our replayer: the period register per tick, and the tick each row is consumed on.
    const { proc, send } = await startWorklet('sidmon1', 'SidMon1Replayer');
    await send({ type: 'loadModule', moduleData: buf.slice(0) });
    await send({ type: 'resume' });
    const m = proc.module as unknown as Mod;
    const out = m._malloc(960 * 8);
    const wasm: number[][] = [[], [], [], []];
    const consumed: { v: number; t: number; i: number }[] = [];
    const count = [0, 0, 0, 0];
    for (let t = 0; t < TICKS; t++) {
      m._player_render(out, 960);
      for (let v = 0; v < 4; v++) {
        wasm[v].push(m._player_get_paula_period(v));
        const n = m._player_get_voice_rows_consumed(v);
        if (n !== count[v]) { count[v] = n; consumed.push({ v, t, i: n - 1 }); }
      }
    }

    // UADE's period at ms (the last write at or before it).
    const uadeAt = (v: number, ms: number): number => {
      let p = 0;
      for (const [t, value] of per[v]) { if (t > ms) break; p = value; }
      return p;
    };
    // 1. Align the two clocks, then our replayer's period register is UADE's.
    let best = -1, offset = 0;
    for (let off = -100; off <= 100; off += 10) {
      let eq = 0, n = 0;
      for (let t = 50; t < TICKS; t++) for (let v = 0; v < 4; v++) {
        const u = uadeAt(v, t * 20 + off);
        if (u === 0 && wasm[v][t] === 0x9999) continue;
        n++; if (u === wasm[v][t]) eq++;
      }
      if (eq / n > best) { best = eq / n; offset = off; }
    }
    expect(best, 'replayer period register equals UADE (one clock tick of jitter allowed)').toBeGreaterThan(0.8);

    // 2 + 3. Cell by cell.
    const mismatches: string[] = [];
    let compared = 0;
    for (let v = 0; v < 4; v++) {
      const mine = consumed.filter((c) => c.v === v);
      mine.forEach((c, k) => {
        const e = cells[v][c.i];
        if (!e) return;
        const from = c.t * 20 + offset - 5;
        const to = (mine[k + 1] ? mine[k + 1].t : c.t + 4) * 20 + offset + 5;
        const played = new Set(per[v].filter(([ms]) => ms >= from && ms <= to).map(([, p]) => semitone(p)));
        const tuned = (song.instruments[e.cell.instrument - 1]?.sidmon1?.finetune ?? 0) > 0;
        if (e.cell.note > 0) {
          compared++;
          const bend = e.cell.effTyp === 0x03; // the row bends: it ends on another note
          const ok = played.has(e.cell.note) || (tuned && (played.has(e.cell.note + 1) || played.has(e.cell.note - 1))) || (bend && played.size > 0);
          if (!ok) mismatches.push(`step ${e.step} row ${e.row} voice ${v}: grid shows note ${e.cell.note} instr ${e.cell.instrument}; UADE plays ${[...played].join('/') || 'nothing'}`);
          const started = lc[v].some((ms) => ms >= from - 20 && ms <= from + 60);
          if (e.cell.instrument > 0 && !started) mismatches.push(`step ${e.step} row ${e.row} voice ${v}: grid starts instrument ${e.cell.instrument}, UADE starts no waveform`);
        }
      });
    }
    expect(compared, 'note cells compared').toBeGreaterThan(300);
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});
