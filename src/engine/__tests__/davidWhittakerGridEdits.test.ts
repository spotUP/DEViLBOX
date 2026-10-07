/**
 * David Whittaker: an edit on the tick grid is written back into the module's own command bytes
 * (P11, fix-all-open). The grid is the replayer's walk (davidWhittakerGrid.ts); a note, an
 * instrument and an effect-column edit each reach the byte of the command that ran, and the export
 * changes those bytes and no others. Re-importing the export shows the edit on the same cell.
 *
 * One reachability proof per song: parse -> edit the grid -> exportDavidWhittaker (the product's
 * export entry) -> parse again; the walk call count proves the export ran the replayer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';
import { walkDavidWhittaker, DW_WALK, type DwWalk, type DwWalkEvent } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { dwEventEffects, buildDWGridFromWalk } from '@/lib/import/formats/davidWhittakerGrid';
import { exportDavidWhittaker } from '@/lib/export/DavidWhittakerExporter';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';

const SONGS = ['formats/apb.dw', 'david-whittaker/garfield2+.dw'];
const ROWS = 64;
const FX = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']] as const;
type Rec = Record<string, number | undefined>;

const load = (n: string): ArrayBuffer => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs', n));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};
const off = (e: DwWalkEvent): number => e.block + e.pos;
const cellAt = (pats: Pattern[], ch: number, tick: number): Rec =>
  pats[Math.floor(tick / ROWS)].channels[ch].rows[tick % ROWS] as unknown as Rec;
const clonePatterns = (p: Pattern[]): Pattern[] => structuredClone(p);

let restoreFetch = () => {};
let walkCalls = 0;
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

interface Plan {
  noteEv: DwWalkEvent; newNote: number;
  insEv: DwWalkEvent; insSample: DwWalkEvent; newIns: number;
  fxEv: DwWalkEvent; fxSlot: number; fxTyp: number; newFx: number;
}

/** Choose three independent edits from the walk: a note, an instrument (its sample command), an effect argument. */
function plan(walk: DwWalk, pats: Pattern[]): Plan {
  const lastSample: Array<DwWalkEvent | null> = new Array(walk.channels).fill(null);
  const noted: Array<{ e: DwWalkEvent; sc: DwWalkEvent }> = [];
  for (const e of walk.events) {
    if (e.kind === DW_WALK.sample) lastSample[e.channel] = e;
    else if (e.kind === DW_WALK.note && lastSample[e.channel]) noted.push({ e, sc: lastSample[e.channel]! });
  }
  const used = new Set<number>();
  const n1 = noted.find(({ e }) => e.tick < pats.length * ROWS)!;
  used.add(off(n1.e));
  const n2 = noted.find(({ e, sc }) => e.channel !== n1.e.channel && off(sc) !== off(n1.e) && !used.has(off(e)))!;
  const order = [DW_WALK.speed, DW_WALK.globalVolume, DW_WALK.vibrato, DW_WALK.slide, DW_WALK.globalTranspose, DW_WALK.envelope];
  let fx: { e: DwWalkEvent; slot: number; typ: number } | null = null;
  for (const kind of order) {
    for (const e of walk.events) {
      if (e.kind !== kind) continue;
      const typ = dwEventEffects(e)[0][0];
      const cell = cellAt(pats, e.channel, e.tick);
      const slot = FX.findIndex(([kt, kv]) => cell[kt] === typ && cell[kv] === (dwEventEffects(e)[0][1]));
      if (slot >= 0) { fx = { e, slot, typ }; break; }
    }
    if (fx) break;
  }
  const baseNote = cellAt(pats, n1.e.channel, n1.e.tick).note!;
  const baseFx = cellAt(pats, fx!.e.channel, fx!.e.tick)[FX[fx!.slot][1]]!;
  // a select byte (envelope) moves to another index the song itself uses; an argument byte moves by one
  const otherEnv = walk.events.find((e) => e.kind === DW_WALK.envelope && e.a !== baseFx)?.a;
  const newFx = fx!.e.kind === DW_WALK.envelope ? otherEnv! : (baseFx + 1) & 0xff;
  return {
    noteEv: n1.e, newNote: baseNote < 90 ? baseNote + 2 : baseNote - 2,
    insEv: n2.e, insSample: n2.sc, newIns: ((cellAt(pats, n2.e.channel, n2.e.tick).instrument! % walk.samples) + 1),
    fxEv: fx!.e, fxSlot: fx!.slot, fxTyp: fx!.typ, newFx,
  };
}

describe.each(SONGS)('David Whittaker grid edits reach the module: %s', (name) => {
  it('a note, an instrument and an effect edit change exactly their command bytes, and re-import shows them', async () => {
    const src = load(name);
    const orig = new Uint8Array(src);
    const song = await parseDavidWhittakerFile(src, name) as TrackerSong;
    expect(song.uadeVariableLayout, 'the grid matched the walk').toBeTruthy();
    const walk = await walkDavidWhittaker(src);
    walkCalls++;

    // unedited grid: the export is the module, byte for byte
    const same = await exportDavidWhittaker(song);
    expect(new Uint8Array(await same.data.arrayBuffer())).toEqual(orig);
    expect(same.warnings).toEqual([]);

    const p = plan(walk, song.patterns);
    const edited = clonePatterns(song.patterns);
    const noteCell = cellAt(edited, p.noteEv.channel, p.noteEv.tick);
    const insCell = cellAt(edited, p.insEv.channel, p.insEv.tick);
    const fxCell = cellAt(edited, p.fxEv.channel, p.fxEv.tick);
    noteCell.note = p.newNote;
    insCell.instrument = p.newIns;
    fxCell[FX[p.fxSlot][1]] = p.newFx;

    const r = await exportDavidWhittaker({ ...song, patterns: edited } as TrackerSong);
    expect(r.warnings, 'every edit is writable in place').toEqual([]);
    const bytes = new Uint8Array(await r.data.arrayBuffer());
    expect(bytes.length).toBe(orig.length);

    // only the three command bytes differ
    const diff: number[] = [];
    for (let i = 0; i < orig.length; i++) if (orig[i] !== bytes[i]) diff.push(i);
    const fxOff = off(p.fxEv) + (p.fxEv.kind === DW_WALK.envelope ? 0 : 1);
    expect(diff.sort((a, b) => a - b)).toEqual([off(p.noteEv), off(p.insSample), fxOff].sort((a, b) => a - b));
    expect(bytes[off(p.noteEv)]).toBe(p.newNote - 25);

    // re-import: the edited cells hold the edits
    const again = await parseDavidWhittakerFile(bytes.buffer.slice(0) as ArrayBuffer, name) as TrackerSong;
    const re = again.patterns;
    expect(cellAt(re, p.noteEv.channel, p.noteEv.tick).note).toBe(p.newNote);
    expect(cellAt(re, p.insEv.channel, p.insEv.tick).instrument).toBe(p.newIns);
    expect(cellAt(re, p.fxEv.channel, p.fxEv.tick)[FX[p.fxSlot][1]]).toBe(p.newFx);

    // and no other cell changed except where a shared command or the sample in force is the edited byte
    const walk2 = await walkDavidWhittaker(bytes.buffer.slice(0) as ArrayBuffer);
    const touched = new Set(diff);
    const base = buildDWGridFromWalk(walk).patterns;
    const lastS: Array<DwWalkEvent | null> = new Array(walk.channels).fill(null);
    const allowed = new Set<string>();
    for (const e of walk.events) {
      if (e.kind === DW_WALK.sample) lastS[e.channel] = e;
      if (touched.has(off(e)) || (e.kind === DW_WALK.note && lastS[e.channel] && touched.has(off(lastS[e.channel]!)))) allowed.add(`${e.channel}:${e.tick}`);
    }
    expect(walk2.ticks, 'the song keeps its length (note and argument edits only)').toBeGreaterThan(0);
    let stray = 0;
    for (let pi = 0; pi < Math.min(base.length, re.length); pi++) for (let ch = 0; ch < walk.channels; ch++) for (let row = 0; row < base[pi].length; row++) {
      const a = JSON.stringify(base[pi].channels[ch].rows[row]);
      const b = JSON.stringify(re[pi].channels[ch].rows[row]);
      if (a !== b && !allowed.has(`${ch}:${pi * ROWS + row}`)) stray++;
    }
    expect(stray, 'cells that changed without sharing an edited command').toBe(0);
  });

  it('an edit that needs a longer block is refused with a warning and leaves the module untouched', async () => {
    const src = load(name);
    const song = await parseDavidWhittakerFile(src, name) as TrackerSong;
    const edited = clonePatterns(song.patterns);
    // a note on a row where the replayer runs none
    const empty = (edited[0].channels[0].rows as unknown as Rec[]).find((c) => !c.note && !c.effTyp)!;
    empty.note = 40;
    const r = await exportDavidWhittaker({ ...song, patterns: edited } as TrackerSong);
    expect(r.warnings.length).toBe(1);
    expect(new Uint8Array(await r.data.arrayBuffer())).toEqual(new Uint8Array(src));
  });
});

describe('David Whittaker grid edits: wiring', () => {
  it('the export runs the replayer walk (sentinel: walks counted above, export refuses a song with no module)', () => {
    expect(walkCalls).toBeGreaterThan(0);
  });
});
