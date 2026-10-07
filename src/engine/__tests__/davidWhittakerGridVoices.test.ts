/**
 * David Whittaker: the grid IS what the replayer plays (owner, 2026-10-07: "the pattern data is a
 * bad guesstimate", "channel 3 and 4 has OFF on all commands", "stray instrument numbers"). The grid is
 * the replayer's tick timeline drawn from its own walk (davidwhittaker.c dw_walk); this checks it
 * against what the replayer does by other routes, for every David Whittaker song in the corpus:
 *   - per voice, the notes and instruments equal dw_trace's independent record, in order;
 *   - a voice's audio is silent where the grid has no note, and a note starts it within a tick;
 *   - an instrument number only on a note-start cell; a note-off only where a sounding voice is muted;
 *     a voice that never sounds is all empty cells;
 *   - every walk event points at the carrier command it ran (block, byte), so the byte-exact source
 *     the encoder writes is the command the grid shows;
 *   - the effect columns hold the commands the replayer ran, named as DW names them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT } from './workletHarness';
import { renderTicks, rmsPerTick } from './keyboardPreviewHarness';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { DW_FX_MIN, DW_EFFECT_NAMES } from '@/lib/import/formats/davidWhittakerEffectGlyphs';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const SONGS = ['formats/apb.dw', 'david-whittaker/garfield2+.dw'];

const corpus = (n: string) => {
  const f = readFileSync(resolve(ROOT, 'public/data/songs', n));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};
const emscriptenTransform = (c: string) => c
  .replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '')
  .replace(/self\.location\.href/g, "'.'")
  .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
  .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');

interface Cell { note: number; instrument: number; effTyp?: number; eff?: number; effTyp2?: number; eff2?: number; effTyp3?: number; eff3?: number; effTyp4?: number; eff4?: number; effTyp5?: number; eff5?: number }
interface GridSong {
  songPositions: number[];
  gridUnmatchedReason?: string;
  patterns: Array<{ length: number; channels: Array<{ rows: Cell[] }> }>;
  uadeVariableLayout?: UADEVariablePatternLayout;
}

/** The grid of voice `ch` as one flat tick timeline. */
const timeline = (song: GridSong, ch: number): Cell[] => song.songPositions.flatMap((pi) => song.patterns[pi].channels[ch].rows);
const effectCells = (c: Cell): Array<[number, number]> => ([[c.effTyp, c.eff], [c.effTyp2, c.eff2], [c.effTyp3, c.eff3], [c.effTyp4, c.eff4], [c.effTyp5, c.eff5]] as Array<[number | undefined, number | undefined]>)
  .filter(([t]) => t !== undefined && t !== 0) as Array<[number, number]>;

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

describe.each(SONGS)('David Whittaker %s: the grid is what the replayer plays', (name) => {
  it('is drawn (not the scope-view fallback) and every walk block is a block of the layout', async () => {
    const ab = corpus(name);
    const song = await parseDavidWhittakerFile(ab, name) as unknown as GridSong;
    expect(song.gridUnmatchedReason, 'no grid').toBeFalsy();
    const layout = song.uadeVariableLayout!;
    const known = new Set(layout.filePatternAddrs);
    const walk = await walkDavidWhittaker(ab);
    for (const e of walk.events) if (e.block !== 0xffffffff) expect(known.has(e.block), `block ${e.block.toString(16)}`).toBe(true);
    expect(song.songPositions.length * 64 - 63, 'the grid spans the walk').toBeLessThanOrEqual(walk.ticks);
  });

  it('per voice, the notes and instruments equal the replayer\'s own record (dw_trace), in order', async () => {
    const ab = corpus(name);
    const song = await parseDavidWhittakerFile(ab, name) as unknown as GridSong;
    const a = await startWorklet('davidwhittaker', 'DavidWhittaker', emscriptenTransform);
    await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
    const mod = a.proc.module as { _malloc(n: number): number; _free(p: number): void; HEAPU8: Uint8Array; _dw_trace(h: number, ticks: number, out: number, max: number): number };
    const ptr = mod._malloc(4096 * 6);
    const walk = await walkDavidWhittaker(ab);
    const n = mod._dw_trace(a.proc.handle as number, walk.ticks, ptr, 4096);
    const dv = new DataView(mod.HEAPU8.buffer, ptr, n * 6);
    const trace = Array.from({ length: n }, (_, i) => ({ ch: dv.getInt16(i * 6, true), sample: dv.getInt16(i * 6 + 2, true), byte: dv.getInt16(i * 6 + 4, true) }));
    mod._free(ptr);
    let compared = 0;
    for (let ch = 0; ch < 4; ch++) {
      const played = trace.filter((t) => t.ch === ch);
      const shown = timeline(song, ch).filter((c) => c.note > 0 && c.note < 97);
      expect(shown.length, `${name} voice ${ch}: note count`).toBe(played.length);
      played.forEach((t, i) => {
        expect({ note: shown[i].note, instrument: shown[i].instrument }, `${name} voice ${ch} note ${i}`).toEqual({ note: t.byte + 25, instrument: t.sample + 1 });
        compared++;
      });
    }
    expect(compared, 'notes compared').toBeGreaterThan(10);
  });

  it('a voice\'s audio starts within a tick of each note and a voice with no notes is silent; no stray instrument numbers or note-offs', async () => {
    const ab = corpus(name);
    const song = await parseDavidWhittakerFile(ab, name) as unknown as GridSong;
    for (let ch = 0; ch < 4; ch++) {
      const cells = timeline(song, ch);
      cells.forEach((c, t) => { if (c.instrument > 0) expect(c.note > 0 && c.note < 97, `${name} voice ${ch} tick ${t}: instrument ${c.instrument} on a cell that starts no note`).toBe(true); });
      const a = await startWorklet('davidwhittaker', 'DavidWhittaker', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const rms = rmsPerTick(renderTicks(a.proc, cells.length + 2, ch === 1 || ch === 2 ? 1 : 0), cells.length + 2);
      const noteTicks = cells.flatMap((c, t) => (c.note > 0 && c.note < 97 ? [t] : []));
      if (noteTicks.length === 0) {
        expect(Math.max(...rms), `${name} voice ${ch} never has a note: silent`).toBeLessThan(1e-4);
        expect(cells.every((c) => c.note === 0), `${name} voice ${ch} empty`).toBe(true);
        continue;
      }
      // the replayer's output runs one tick behind its walk (the first tick plays when the first frames are rendered)
      let started = 0;
      for (const t of noteTicks.slice(0, 40)) if (Math.max(rms[t] ?? 0, rms[t + 1] ?? 0, rms[t + 2] ?? 0) > 1e-4) started++;
      expect(started, `${name} voice ${ch}: notes that start audio`).toBeGreaterThanOrEqual(Math.min(noteTicks.length, 40) * 0.9);
      // a note-off follows a note: the voice sounded before it
      let sounded = false;
      cells.forEach((c, t) => {
        if (c.note > 0 && c.note < 97) sounded = true;
        if (c.note === 97) { expect(sounded, `${name} voice ${ch} tick ${t}: note-off on a voice that is silent`).toBe(true); sounded = false; }
      });
    }
  });

  it('every walk event points at the carrier command it ran, and the effect columns hold the replayer\'s commands', async () => {
    const ab = corpus(name);
    const song = await parseDavidWhittakerFile(ab, name) as unknown as GridSong;
    const layout = song.uadeVariableLayout!;
    const walk = await walkDavidWhittaker(ab);
    const fpOf = new Map(layout.filePatternAddrs.map((addr, fp) => [addr, fp]));
    const carrierAt = (block: number, pos: number) => {
      const rows = layout.blockRows![fpOf.get(block)!];
      let at = 0;
      for (const r of rows) { if (at === pos) return r; at += r.cutoff ?? 0; }
      return undefined;
    };
    let linked = 0;
    for (const e of walk.events) {
      if (e.block === 0xffffffff) continue;
      const c = carrierAt(e.block, e.pos);
      expect(c, `${name}: a command at ${e.block.toString(16)}+${e.pos}`).toBeTruthy();
      const b0 = c!.period ?? 0;
      if (e.kind === DW_WALK.note) expect(b0, 'note byte').toBe(e.b);
      else if (e.kind === DW_WALK.mute) expect(b0, 'mute opcode').toBe(0x82);
      else if (e.kind === DW_WALK.wait) expect(b0 - 0xdf, 'wait rows').toBe(e.a);
      else if (e.kind === DW_WALK.slide) { expect(b0).toBe(0x81); expect(c!.pan, 'slide speed').toBe(e.a & 0xff); }
      else if (e.kind === DW_WALK.vibrato) { expect(b0).toBe(0x86); expect(c!.pan, 'vibrato speed').toBe(e.a); }
      else if (e.kind === DW_WALK.endOfTrack) expect(b0).toBe(0x80);
      linked++;
    }
    expect(linked, 'events linked to carriers').toBeGreaterThan(50);

    // effect columns: exactly the commands the walk ran, per voice and tick, written out here by hand
    // (name -> id by the player's own names, so a changed mapping in the grid builder is caught)
    const id = (name: string) => DW_FX_MIN + DW_EFFECT_NAMES.indexOf(name as typeof DW_EFFECT_NAMES[number]);
    const b8 = (v: number) => v & 0xff;
    const expected = (e: { kind: number; a: number; b: number }): Array<[number, number]> => {
      switch (e.kind) {
        case DW_WALK.envelope: return [[id('envelope'), e.a]];
        case DW_WALK.arpeggio: return [[id('arpeggio'), e.a]];
        case DW_WALK.slide: return [[id('slide speed'), b8(e.a)], [id('slide delay'), e.b]];
        case DW_WALK.waitRow: return [[id('wait for next row'), 0]];
        case DW_WALK.stopSong: return [[id('stop song'), 0]];
        case DW_WALK.globalTranspose: return [[id('global transpose'), b8(e.a)]];
        case DW_WALK.vibrato: return [[id('vibrato speed'), e.a], [id('vibrato depth'), e.b]];
        case DW_WALK.vibratoOff: return [[id('vibrato off'), 0]];
        case DW_WALK.volumeFade: return [[id('volume fade'), e.a]];
        case DW_WALK.channelTranspose: return [[id('channel transpose'), b8(e.a)]];
        case DW_WALK.halfVolumeOn: return [[id('half volume on'), 0]];
        case DW_WALK.halfVolumeOff: return [[id('half volume off'), 0]];
        case DW_WALK.restart: return [[id('restart'), 0]];
        case DW_WALK.speed: return [[id('speed'), e.a]];
        case DW_WALK.delaySpeed: return [[id('delay speed'), e.a]];
        case DW_WALK.globalFade: return [[id('global volume fade'), e.a]];
        case DW_WALK.globalVolume: return [[id('global volume'), e.a]];
        case DW_WALK.soundEffect: return [[id('sound effect'), e.a]];
        case DW_WALK.endOfTrack: return e.b === 1 ? [[id('loop'), b8(e.a)]] : [];
        default: return [];   // notes, mutes, waits and sample selects show as notes, note-offs and instruments
      }
    };
    let seenKinds = 0;
    for (let ch = 0; ch < walk.channels; ch++) {
      const want: Array<[number, number, number]> = [];
      for (const e of walk.events) if (e.channel === ch && e.tick < song.songPositions.length * 64) for (const [t, v] of expected(e)) want.push([e.tick, t, v]);
      const got: Array<[number, number, number]> = [];
      timeline(song, ch).forEach((c, t) => { for (const [typ, v] of effectCells(c)) got.push([t, typ, v]); });
      expect(got, `${name} voice ${ch} effect columns`).toEqual(want);
      seenKinds += new Set(got.map((g) => g[1])).size;
    }
    expect(seenKinds, 'the song uses effect commands').toBeGreaterThan(0);
  });
});
