/**
 * Jochen Hippel ST: the grid is what UADE's ST player plays, and a grid edit
 * is what it then plays.
 *
 * The ST player emulates the YM2149 on Paula: it rewrites every voice's
 * period every tick and points AUDxLC only when a voice switches between
 * tone and noise, so Paula's write log has no note-ons (gridVsPaula sees 0
 * events on the three YM voices). The oracle is the player itself: its
 * voice records (V1.2 binary: three 0x34-byte records ending 0xFE before
 * the period table $EEE,$E17,...) hold the step, the pattern pointer and the
 * note and info bytes read (Jochen Hippel ST_v4.asm lbC000854: $1E note,
 * $1F info, $20 sound transpose, $21 transpose). Sampled every half tick,
 * each record's changes are the events it read; they must be the decoded
 * song's events, in order, on the rows the grid puts them.
 * Research: thoughts/shared/research/2026-10-05_hippel-st-replayer.md
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule, refreshHeap, type UADEModule } from '../../../tools/uade-audit/uadeRenderCore';
import {
  decodeHstModule, encodeHstModule, compressHstSong, simulateHstSubsong, hstSubsongRange, hstHeader, hstU16, hstU32,
  perRowHstOffsets, type HstModule, type HstPlayback,
} from '@/lib/import/formats/JochenHippelSTModule';
import { HstSongEdit } from '@/lib/import/formats/JochenHippelSTSong';
import { parseJochenHippelSTFile } from '@/lib/import/formats/JochenHippelSTParser';

// The edit test drives the real UADEChipEditor; only the engine singleton is
// replaced by the UADE module this test renders with.
vi.mock('@/engine/uade/UADEEngine', () => ({ UADEEngine: { hasInstance: () => true, getInstance: () => ({}) } }));
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import type { UADEEngine } from '@/engine/uade/UADEEngine';

interface LogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
  _uade_wasm_read_memory(addr: number, dst: number, len: number): number;
  _uade_wasm_write_memory(addr: number, src: number, len: number): number;
  _uade_wasm_set_subsong(n: number): void;
}

const ROOT = join(process.cwd(), 'public/data/songs');
const CORPUS = [
  'hippel-st/crown arabia.hst', 'hippel-st/crown england.hst', 'hippel-st/crown japan.hst',
  'hippel-st/crown russia.hst', 'hippel-st/crown viking.hst', 'hippel-st/demo music10.sog',
  'formats/astaroth.sog', 'hippel-st-coso/ghostbattle titletune.soc',
];
const HALF_TICK = 441; // 44.1 kHz frames; the player ticks at 50 Hz
const SECONDS = 20;
const PERIOD_TABLE = [0x0e, 0xee, 0x0e, 0x17, 0x0d, 0x4d, 0x0c, 0x8e];
const VOICE_SIZE = 0x34;

function load(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(ROOT, rel)));
}

/**
 * The bytes UADE is given for a file: a raw TFMX rip cut short of its table
 * (both corpus .sog are, by 4 and 2 bytes) fails the player's size check,
 * so the original is measured with the table's zeros put back.
 */
function playable(bytes: Uint8Array): Uint8Array {
  const m = decodeHstModule(bytes);
  if (m.song.kind !== 'raw') return bytes;
  const short = (hstU16(hstHeader(m), 18) + 1) * 6 - m.song.table.length;
  const out = new Uint8Array(bytes.length + short);
  out.set(bytes);
  return out;
}

function find(hay: Uint8Array, needle: ArrayLike<number>): number[] {
  const hits: number[] = [];
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    hits.push(i);
  }
  return hits;
}

class Uade {
  readonly mod: LogModule;
  private readonly pL: number;
  private readonly pR: number;
  constructor(mod: LogModule) {
    this.mod = mod;
    this.pL = mod._malloc(HALF_TICK * 4);
    this.pR = mod._malloc(HALF_TICK * 4);
  }
  load(bytes: Uint8Array, subsong: number): void {
    const m = this.mod;
    const ptr = m._malloc(bytes.length);
    refreshHeap(m);
    m.HEAPU8.set(bytes, ptr);
    const hint = 'song.hst';
    const hp = m._malloc(32);
    m.stringToUTF8(hint, hp, 32);
    m._uade_wasm_stop();
    m._uade_wasm_set_looping(0);
    m._uade_wasm_set_one_subsong(1);
    const ret = m._uade_wasm_load(ptr, bytes.length, hp);
    m._free(ptr); m._free(hp);
    if (ret !== 0) throw new Error(`UADE refused the song (${ret})`);
    if (subsong > 1) m._uade_wasm_set_subsong(subsong);
  }
  render(): void { this.mod._uade_wasm_render(this.pL, this.pR, HALF_TICK); }
  read(addr: number, len: number): Uint8Array {
    const p = this.mod._malloc(len);
    this.mod._uade_wasm_read_memory(addr, p, len);
    refreshHeap(this.mod);
    const out = this.mod.HEAPU8.slice(p, p + len);
    this.mod._free(p);
    return out;
  }
  write(addr: number, data: Uint8Array): void {
    const p = this.mod._malloc(data.length);
    refreshHeap(this.mod);
    this.mod.HEAPU8.set(data, p);
    this.mod._uade_wasm_write_memory(addr, p, data.length);
    this.mod._free(p);
  }
  /** The UADEEngine surface UADEChipEditor uses, on this module's chip RAM. */
  engine(): UADEEngine {
    return {
      readMemory: async (addr: number, len: number) => this.read(addr, len),
      writeMemory: async (addr: number, data: Uint8Array) => this.write(addr, data),
    } as unknown as UADEEngine;
  }
}

async function uade(): Promise<Uade> {
  const mod = (await loadUADEModule(false)) as LogModule;
  expect(mod._uade_wasm_init(44100)).toBe(0);
  return new Uade(mod);
}

/** Where the song the player plays sits in chip RAM, and its voice records. */
function locate(u: Uade, song: Uint8Array): { base: number; voices: number } {
  const mem = u.read(0, 0x200000);
  const hits = find(mem, song.subarray(0, 64));
  expect(hits.length).toBeGreaterThan(0);
  const base = hits[hits.length - 1];
  for (const t of find(mem, PERIOD_TABLE)) {
    const v = t - 0xfe;
    const track = ((mem[v] << 24) | (mem[v + 1] << 16) | (mem[v + 2] << 8) | mem[v + 3]) >>> 0;
    if (track >= base && track < base + song.length) return { base, voices: v };
  }
  throw new Error('no voice records point into the song');
}

interface Read { key: string; half: number }

/** Each voice's record, every half tick, as `step:patternOffset:note:info:transpose:soundTranspose` changes. */
async function watch(u: Uade, song: Uint8Array, at: { base: number; voices: number }, halves: number, onHalf?: (h: number) => Promise<void> | void): Promise<Read[][]> {
  const tracks = at.base + hstU32(song, 16);
  const patTable = hstU32(song, 12);
  const longP = hstU16(song, 64) === 0;
  const patStart = (pt: number) => at.base + (longP ? hstU32(song, patTable + pt * 4) : hstU16(song, patTable + pt * 2));
  const out: Read[][] = [[], [], []];
  const last = ['', '', ''];
  for (let h = 0; h < halves; h++) {
    await onHalf?.(h);
    const s = u.read(at.voices, VOICE_SIZE * 3);
    for (let v = 0; v < 3; v++) {
      const o = v * VOICE_SIZE;
      const track = hstU32(s, o);
      const step = (track - tracks - v * 4) / 12 + hstU16(s, o + 0x14) / 12 - 1;
      const pt = song[hstU32(song, 16) + step * 12 + v * 4];
      const key = `${step}:${hstU32(s, o + 12) - patStart(pt)}:${s[o + 0x1e]}:${s[o + 0x1f]}:${(s[o + 0x21] << 24) >> 24}:${(s[o + 0x20] << 24) >> 24}`;
      if (key !== last[v]) { last[v] = key; out[v].push({ key, half: h }); }
    }
    u.render();
  }
  return out;
}

/** The decoded song's reads per voice, as `watch` keys, with their tick. `offsetOf` names where an event's bytes end. */
function expected(p: HstPlayback, endOf: (e: HstPlayback['events'][0][0]) => number, maxTick: number): Array<Array<{ key: string; tick: number }>> {
  return p.events.map((list) => {
    let note = 0;
    let info = 0;
    const out: Array<{ key: string; tick: number }> = [];
    for (const e of list) {
      const tick = p.rowTicks[e.row];
      if (tick > maxTick) break;
      if (e.kind === 'note') { note = e.note; info = e.info; }
      out.push({ key: `${e.step}:${endOf(e)}:${note}:${info}:${e.transpose}:${e.soundTranspose}`, tick });
    }
    return out;
  });
}

/**
 * Every expected read is in the player's, in order (the record is sampled
 * mid-update now and then, so the player's list may hold extra half-written
 * states), at its row's time. Times are compared after removing their
 * median offset (the player's first tick runs inside the load); a read is
 * late when it is off by half a row or more - a read on the wrong row is off
 * by a whole row (`speed` ticks), the half-tick sampling by at most one tick.
 */
function matches(player: Read[], want: Array<{ key: string; tick: number }>, speed: number): { matched: number; late: number } {
  let i = player.findIndex((r) => r.key === want[0]?.key);
  if (i < 0) return { matched: 0, late: 0 };
  const offsets: number[] = [];
  let k = 0;
  while (k < want.length && i < player.length) {
    let j = i;
    while (j < player.length && j < i + 3 && player[j].key !== want[k].key) j++;
    if (j >= player.length || player[j].key !== want[k].key) break;
    offsets.push(player[j].half / 2 - want[k].tick);
    i = j + 1;
    k++;
  }
  const median = [...offsets].sort((a, b) => a - b)[offsets.length >> 1] ?? 0;
  const late = offsets.filter((o) => Math.abs(o - median) >= speed / 2).length;
  return { matched: k, late };
}

/** End of an event's bytes in the original pattern stream. */
function streamEnd(e: HstPlayback['events'][0][0]): number {
  return e.at + (e.kind === 'rest' ? 2 : e.extra === null ? 2 : 3);
}

/** The COSO song the player plays (a raw song as its own Compress packs it). */
function playedSong(m: HstModule): Uint8Array {
  return m.song.kind === 'raw' ? compressHstSong(m.song) : encodeHstModule({ prefix: new Uint8Array(0), song: m.song, trailing: new Uint8Array(0) });
}

describe('Jochen Hippel ST grid matches the player', () => {
  it.each([...CORPUS.map((rel) => [rel, 1] as const), ['formats/astaroth.sog', 2] as const])(
    '%s subsong %i: the player\'s voices read the decoded events, in order, on the grid\'s rows',
    async (rel, subsong) => {
      const bytes = load(rel);
      const m = decodeHstModule(bytes);
      const song = playedSong(m);
      const p = simulateHstSubsong(m, subsong - 1);
      const u = await uade();
      u.load(playable(bytes), subsong);
      const at = locate(u, song);
      const player = await watch(u, song, at, SECONDS * 100);
      const want = expected(p, streamEnd, (SECONDS - 2) * 50);
      const speed = hstSubsongRange(m, subsong - 1).speed;
      for (let v = 0; v < 3; v++) {
        expect(want[v].length).toBeGreaterThan(0);
        expect(matches(player[v], want[v], speed)).toEqual({ matched: want[v].length, late: 0 });
      }
    }, 120_000);

  it.each(['demo music10.sog', 'astaroth.sog'])('%s: Compress (ported) builds the song the player packs for itself', async (name) => {
    const rel = name.startsWith('demo') ? `hippel-st/${name}` : `formats/${name}`;
    const bytes = load(rel);
    const m = decodeHstModule(bytes);
    const u = await uade();
    u.load(playable(bytes), 1);
    u.render();
    const packed = compressHstSong(m.song as Extract<HstModule['song'], { kind: 'raw' }>);
    const mem = u.read(0, 0x200000);
    const hit = find(mem, packed);
    expect(hit.length).toBe(1);
  }, 60_000);

  it.each(['hippel-st/crown arabia.hst', 'hippel-st/demo music10.sog', 'hippel-st-coso/ghostbattle titletune.soc'])(
    '%s: the playback image the app hands UADE plays the song - the same voice reads, the same Paula writes',
    async (rel) => {
      const bytes = load(rel);
      const edit = new HstSongEdit(bytes);
      const image = decodeHstModule(edit.image);
      const song = playedSong(image);
      const p = simulateHstSubsong(edit.module, 0);
      const u = await uade();
      u.load(edit.image, 1);
      const at = locate(u, song);
      const player = await watch(u, song, at, SECONDS * 100);
      // In the image every row is one event: a read on every row the step lasts.
      const want = p.events.map(() => [] as Array<{ key: string; tick: number }>);
      const starts = p.stepStarts.filter((s) => s.voice === 0);
      for (let v = 0; v < 3; v++) {
        let note = 0, info = 0;
        starts.forEach((s, k) => {
          const end = k + 1 < starts.length ? starts[k + 1].row : p.rows;
          const pt = edit.module.song.steps[s.step * 12 + v * 4];
          const tr = (edit.module.song.steps[s.step * 12 + v * 4 + 1] << 24) >> 24;
          const st = (edit.module.song.steps[s.step * 12 + v * 4 + 2] << 24) >> 24;
          const rows = edit.rows[pt]!;
          const offs = perRowHstOffsets(rows);
          for (let r = 0; r < end - s.row; r++) {
            const tick = p.rowTicks[s.row + r];
            if (tick > (SECONDS - 2) * 50) return;
            const row = rows[r];
            if (row.note !== null) { note = row.note; info = row.info; }
            const len = row.note === null ? 2 : row.extra === null ? 2 : 3;
            want[v].push({ key: `${s.step}:${offs[r] + len}:${note}:${info}:${tr}:${st}`, tick });
          }
        });
        expect(matches(player[v], want[v], hstSubsongRange(edit.module, 0).speed)).toEqual({ matched: want[v].length, late: 0 });
      }
      // Register for register, what Paula is told is the original's.
      const paula = async (data: Uint8Array) => {
        const w = await uade();
        w.mod._uade_wasm_enable_paula_log(1);
        w.load(data, 1);
        const logPtr = w.mod._malloc(4096 * 12);
        const writes: string[] = [];
        for (let h = 0; h < SECONDS * 100; h++) {
          w.render();
          const n = w.mod._uade_wasm_get_paula_log(logPtr, 4096);
          refreshHeap(w.mod);
          const u32 = new Uint32Array(w.mod.HEAPU8.buffer, logPtr, n * 3);
          for (let i = 0; i < n; i++) {
            const reg = (u32[i * 3] >>> 16) & 0xff;
            if (reg > 1) writes.push(`${u32[i * 3] >>> 24}:${reg}:${u32[i * 3] & 0xffff}`); // pointers differ by design
          }
        }
        return writes;
      };
      const orig = await paula(playable(bytes));
      expect(orig.length).toBeGreaterThan(5000);
      expect(await paula(edit.image)).toEqual(orig);
    }, 180_000);

  it.each(['hippel-st/crown arabia.hst', 'hippel-st/demo music10.sog'])(
    '%s: a grid edit written through UADEChipEditor mid-song is the note the player reads',
    async (rel) => {
      const name = rel.split('/').pop()!;
      const song = parseJochenHippelSTFile(load(rel).buffer as ArrayBuffer, name);
      const layout = song.uadePatternLayout!;
      const image = new Uint8Array(song.uadeEditableFileData!);
      const m = decodeHstModule(image);
      const played = playedSong(m);
      // Step 3, voice 1: a new note on an empty row (the row grows from FD 00
      // to a note) and another note moved up a tone.
      const step = song.songPositions[3];
      const rows = song.patterns[step].channels[1].rows;
      const empty = rows.findIndex((c, r) => r > 4 && c.note === 0);
      const noted = rows.findIndex((c, r) => r > empty && c.note > 0 && c.instrument > 0);
      const added = { ...rows[empty], note: 49, instrument: rows[noted].instrument };
      const moved = { ...rows[noted], note: rows[noted].note + 2 };
      const edit = new HstSongEdit(image);
      expect(edit.edit(step, empty, 1, added)).not.toBeNull();
      expect(edit.edit(step, noted, 1, moved)).not.toBeNull();
      const sv = (r: number) => edit.rows[m.song.steps[step * 12 + 4]]![r];
      const p = simulateHstSubsong(decodeHstModule(edit.exportFile()), 0);
      const tickOf = (r: number) => p.rowTicks[p.stepStarts.find((s) => s.voice === 1 && s.step === step)!.row + r];

      const u = await uade();
      u.load(image, 1);
      const at = locate(u, played);
      const editor = new UADEChipEditor(u.engine());
      const halves = (tickOf(noted) + 20) * 2;
      let wrote = false;
      const player = await watch(u, played, at, halves, async (h) => {
        if (h === 100 && !wrote) {
          wrote = true;
          await editor.patchPatternCell(layout, step, empty, 1, added);
          await editor.patchPatternCell(layout, step, noted, 1, moved);
        }
      });
      expect(tickOf(empty)).toBeGreaterThan(60); // the edit lands before the rows play
      const reads = player[1].map((r) => r.key.split(':').map(Number));
      const onStep = reads.filter(([s]) => s === step);
      expect(onStep.some(([, , note, info]) => note === sv(empty).note && info === sv(empty).info)).toBe(true);
      expect(onStep.some(([, , note]) => note === sv(noted).note)).toBe(true);
      // and those are the notes the grid now shows
      expect(edit.cell(step, empty, 1)).toMatchObject({ note: 49, instrument: added.instrument });
      expect(edit.cell(step, noted, 1).note).toBe(moved.note);
    }, 120_000);
});
