/** David Whittaker: an effect cleared, or swapped for one of another byte length, resizes its block. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker, DW_WALK, type DwWalk, type DwWalkEvent } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk, dwEventEffects, dwRowClock, SLOT_KEYS } from '@/lib/import/formats/davidWhittakerGrid';
import { applyDwGridEdits } from '@/lib/import/formats/davidWhittakerEdits';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';

let restore = () => {};
beforeAll(() => { restore = installDwNodeFetch(); });
afterAll(() => restore());

type Cell = Record<string, number | undefined>;
const NO_BLOCK = 0xffffffff;

async function load(): Promise<{ src: ArrayBuffer; walk: DwWalk }> {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs/david-whittaker/garfield2+.dw'));
  const src = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
  return { src, walk: await walkDavidWhittaker(src) };
}

/** An event of `kind` whose command byte position runs exactly once in the walk, so no other cell shares it. */
const onceEvent = (walk: DwWalk, kind: number): DwWalkEvent => {
  const e = walk.events.find((x) => x.kind === kind && x.block !== NO_BLOCK && x.channel < walk.channels
    && walk.events.filter((o) => o.block === x.block && o.pos === x.pos).length === 1);
  expect(e, `a ${kind} command that runs once`).toBeDefined();
  return e!;
};

/** The grid cell and effect slot an event shows in. */
function slotOf(walk: DwWalk, pats: ReturnType<typeof buildDWGridFromWalk>['patterns'], e: DwWalkEvent): { cell: Cell; s: number; key: string } {
  const { row } = dwRowClock(walk).tickToRow(e.ptick);
  const cell = pats[Math.floor(row / 64)].channels[e.channel].rows[row % 64] as unknown as Cell;
  const typ = dwEventEffects(e)[0][0];
  const s = SLOT_KEYS.findIndex(([kt]) => cell[kt] === typ);
  expect(s).toBeGreaterThanOrEqual(0);
  return { cell, s, key: `${Math.floor(row / 64)}:${e.channel}:${row % 64}` };
}

const snapshot = (pats: ReturnType<typeof buildDWGridFromWalk>['patterns']): Map<string, string> => {
  const m = new Map<string, string>();
  pats.forEach((p, pi) => p.channels.forEach((c, ci) => c.rows.forEach((r, ri) => m.set(`${pi}:${ci}:${ri}`, JSON.stringify(r)))));
  return m;
};

/** Every cell but `except` is the same before and after. */
function expectOthersEqual(a: Map<string, string>, b: Map<string, string>, except: string | Set<string>): void {
  const skip = typeof except === 'string' ? new Set([except]) : except;
  expect(b.size).toBe(a.size);
  for (const [k, v] of a) if (!skip.has(k)) expect(b.get(k), k).toBe(v);
}

/** Every position-list entry names the same logical block: same bytes, except the one block the edit resized. */
function expectPointersResolve(src: Uint8Array, walk: DwWalk, out: Uint8Array, walk2: DwWalk, edited: number, delta: number): void {
  const l1 = walk.layout, l2 = walk2.layout;
  expect(l2.entries.length).toBe(l1.entries.length);
  const len = (l: typeof l1, off: number): number => l.tracks.find((t) => t.offset === off)!.length;
  l1.entries.forEach((e1, i) => {
    const e2 = l2.entries[i];
    expect(e2.at).toBe(e1.at);
    const a = src.slice(e1.track, e1.track + len(l1, e1.track));
    const b = out.slice(e2.track, e2.track + len(l2, e2.track));
    if (e1.track === edited) expect(b.length).toBe(a.length + delta);
    else expect(Array.from(b)).toEqual(Array.from(a));
  });
}

describe('David Whittaker effect resize', { timeout: 120000 }, () => {
  it('garfield2+: unedited export is identical', async () => {
    const { src, walk } = await load();
    expect(applyDwGridEdits(new Uint8Array(src), walk, buildDWGridFromWalk(walk).patterns).data).toEqual(new Uint8Array(src));
  });

  it('garfield2+: a cleared effect removes its two command bytes; every other cell and pointer is unchanged', async () => {
    const { src, walk } = await load();
    const pats = buildDWGridFromWalk(walk).patterns;
    const before = snapshot(pats);
    const e = onceEvent(walk, DW_WALK.globalFade);
    const { cell, s, key } = slotOf(walk, pats, e);
    cell[SLOT_KEYS[s][0]] = 0; cell[SLOT_KEYS[s][1]] = 0;
    const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
    expect(out.warnings).toEqual([]);
    const walk2 = await walkDavidWhittaker(out.data.buffer.slice(0) as ArrayBuffer);
    expect(walk2.layout.tracks.find((t) => t.offset === e.block)!.length).toBe(walk.layout.tracks.find((t) => t.offset === e.block)!.length - 2);
    expectPointersResolve(new Uint8Array(src), walk, out.data, walk2, e.block, -2);
    const after = snapshot(buildDWGridFromWalk(walk2).patterns);
    expect(Object.values(JSON.parse(after.get(key)!))).not.toContain(dwEventEffects(e)[0][0]);
    expectOthersEqual(before, after, key);
  });

  it('garfield2+: an effect swapped for one of another length (2 -> 1 bytes, 1 -> 2 bytes) re-imports as the new effect', async () => {
    const { src, walk } = await load();
    const grid0 = buildDWGridFromWalk(walk).patterns;
    const vOff = walk.events.find((x) => x.kind === DW_WALK.vibratoOff && x.block !== NO_BLOCK && x.channel < walk.channels
      && grid0[Math.floor(dwRowClock(walk).tickToRow(x.ptick).row / 64)] !== undefined)!;
    const vOffFx = dwEventEffects(vOff)[0];

    // global volume fade (2 bytes) -> vibrato off (1 byte): the block shrinks
    {
      const pats = buildDWGridFromWalk(walk).patterns;
      const before = snapshot(pats);
      const e = onceEvent(walk, DW_WALK.globalFade);
      const { cell, s, key } = slotOf(walk, pats, e);
      cell[SLOT_KEYS[s][0]] = vOffFx[0]; cell[SLOT_KEYS[s][1]] = vOffFx[1];
      const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
      expect(out.warnings).toEqual([]);
      const walk2 = await walkDavidWhittaker(out.data.buffer.slice(0) as ArrayBuffer);
      expectPointersResolve(new Uint8Array(src), walk, out.data, walk2, e.block, -1);
      const after = snapshot(buildDWGridFromWalk(walk2).patterns);
      expect(JSON.parse(after.get(key)!)[SLOT_KEYS[s][0]]).toBe(vOffFx[0]);
      expectOthersEqual(before, after, key);
    }
    // vibrato off (1 byte) -> global volume fade 5 (2 bytes): the block grows
    {
      const pats = buildDWGridFromWalk(walk).patterns;
      const before = snapshot(pats);
      const ct = dwEventEffects(onceEvent(walk, DW_WALK.globalFade))[0];
      const e = vOff;
      const { cell, s, key } = slotOf(walk, pats, e);
      // a block runs for every voice and pass that reads it: the same command byte is the cell of each of them
      const shared = new Set(walk.events.filter((o) => o.block === e.block && o.pos === e.pos).map((o) => { const { row } = dwRowClock(walk).tickToRow(o.ptick); return `${Math.floor(row / 64)}:${o.channel}:${row % 64}`; }));
      cell[SLOT_KEYS[s][0]] = ct[0]; cell[SLOT_KEYS[s][1]] = 5;
      const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
      expect(out.warnings).toEqual([]);
      const walk2 = await walkDavidWhittaker(out.data.buffer.slice(0) as ArrayBuffer);
      const after = snapshot(buildDWGridFromWalk(walk2).patterns);
      const c2 = JSON.parse(after.get(key)!);
      expect([c2[SLOT_KEYS[s][0]], c2[SLOT_KEYS[s][1]]]).toEqual([ct[0], 5]);
      expectOthersEqual(before, after, shared);
    }
  });

  // Slide and vibrato: three bytes, shown as two consecutive slots (first and second argument).
  const SONGS = ['david-whittaker/garfield2+.dw', 'formats/apb.dw'];
  const PAIRS: Array<[string, number]> = [['slide', DW_WALK.slide], ['vibrato', DW_WALK.vibrato]];
  const keyOf = (walk: DwWalk, e: DwWalkEvent): string => { const { row } = dwRowClock(walk).tickToRow(e.ptick); return `${Math.floor(row / 64)}:${e.channel}:${row % 64}`; };
  const sharing = (walk: DwWalk, e: DwWalkEvent): Set<string> => new Set(walk.events.filter((o) => o.block === e.block && o.pos === e.pos).map((o) => keyOf(walk, o)));
  const loadSong = async (rel: string): Promise<{ src: ArrayBuffer; walk: DwWalk }> => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs', rel));
    const src = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    return { src, walk: await walkDavidWhittaker(src) };
  };
  const reimport = async (d: Uint8Array): Promise<{ walk: DwWalk; snap: Map<string, string> }> => {
    const walk = await walkDavidWhittaker(d.buffer.slice(0) as ArrayBuffer);
    return { walk, snap: snapshot(buildDWGridFromWalk(walk).patterns) };
  };
  const slots = (snap: Map<string, string>, key: string, s: number): number[] => { const c = JSON.parse(snap.get(key)!); return [c[SLOT_KEYS[s][0]], c[SLOT_KEYS[s][1]], c[SLOT_KEYS[s + 1][0]], c[SLOT_KEYS[s + 1][1]]]; };
  const trackLen = (w: DwWalk, off: number): number => w.layout.tracks.find((t) => t.offset === off)!.length;

  for (const rel of SONGS) {
    for (const [name, kind] of PAIRS) {
      it(`${rel}: ${name} typed on an empty slot, cleared, and swapped to and from 1/2-byte effects`, async () => {
        const { src, walk } = await loadSong(rel);
        const pair = walk.events.find((x) => x.kind === kind && x.block !== NO_BLOCK && x.channel < walk.channels);
        if (!pair) return;   // this module never runs one: nothing to take the command byte from
        const [t1, t2] = [dwEventEffects(pair)[0][0], dwEventEffects(pair)[1][0]];
        const base = buildDWGridFromWalk(walk).patterns;
        expect(applyDwGridEdits(new Uint8Array(src), walk, base).data).toEqual(new Uint8Array(src));

        // 1. typed on an empty slot, in front of a note whose cell has no effects
        const note = walk.events.find((e) => e.kind === DW_WALK.note && e.block !== NO_BLOCK && e.channel < walk.channels
          && !walk.events.some((o) => o.channel === e.channel && o.ptick === e.ptick && o !== e)
          && (() => { const c = base[Math.floor(dwRowClock(walk).tickToRow(e.ptick).row / 64)].channels[e.channel].rows[dwRowClock(walk).tickToRow(e.ptick).row % 64] as unknown as Cell; return !(c[SLOT_KEYS[0][0]] ?? 0) && !(c[SLOT_KEYS[1][0]] ?? 0); })())!;
        expect(note).toBeDefined();
        {
          const pats = buildDWGridFromWalk(walk).patterns;
          const before = snapshot(pats);
          const key = keyOf(walk, note);
          const cell = pats[Number(key.split(':')[0])].channels[note.channel].rows[Number(key.split(':')[2])] as unknown as Cell;
          [cell[SLOT_KEYS[0][0]], cell[SLOT_KEYS[0][1]], cell[SLOT_KEYS[1][0]], cell[SLOT_KEYS[1][1]]] = [t1, 3, t2, 9];
          const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
          expect(out.warnings).toEqual([]);
          const { walk: w2, snap } = await reimport(out.data);
          expect(slots(snap, key, 0)).toEqual([t1, 3, t2, 9]);
          expectOthersEqual(before, snap, sharing(walk, note));
          expectPointersResolve(new Uint8Array(src), walk, out.data, w2, note.block, 3);
        }
        // 2. cleared (a command that runs once, so only its own cell changes)
        const once = walk.events.find((x) => x.kind === kind && x.block !== NO_BLOCK && x.channel < walk.channels
          && walk.events.filter((o) => o.block === x.block && o.pos === x.pos).length === 1) ?? pair;   // a shared one changes every cell that runs it
        {
          const pats = buildDWGridFromWalk(walk).patterns;
          const before = snapshot(pats);
          const { cell, s, key } = slotOf(walk, pats, once);
          [cell[SLOT_KEYS[s][0]], cell[SLOT_KEYS[s][1]], cell[SLOT_KEYS[s + 1][0]], cell[SLOT_KEYS[s + 1][1]]] = [0, 0, 0, 0];
          const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
          expect(out.warnings).toEqual([]);
          const { walk: w2, snap } = await reimport(out.data);
          expect(trackLen(w2, once.block)).toBe(trackLen(walk, once.block) - 3);
          expect(out.data.length).toBe(src.byteLength);
          expect(Object.values(JSON.parse(snap.get(key)!))).not.toContain(t1);   // the cleared pair is gone from its cell
          expectOthersEqual(before, snap, sharing(walk, once));
          expectPointersResolve(new Uint8Array(src), walk, out.data, w2, once.block, -3);
        }
        // 3. swapped with a 2-byte effect and a 1-byte effect, both ways
        const two = walk.events.find((x) => x.kind === DW_WALK.globalFade && x.block !== NO_BLOCK && x.channel < walk.channels
          && walk.events.filter((o) => o.block === x.block && o.pos === x.pos).length === 1);
        const one = walk.events.find((x) => x.kind === DW_WALK.vibratoOff && x.block !== NO_BLOCK && x.channel < walk.channels);
        for (const [small, len] of [[two, 2], [one, 1]] as Array<[DwWalkEvent | undefined, number]>) {
          if (!small) continue;
          const [st, sv] = dwEventEffects(small)[0];
          // small -> pair (grows by 3 - len); the second slot must be empty, so only where the cell has the one effect
          const pats = buildDWGridFromWalk(walk).patterns;
          const before = snapshot(pats);
          const { cell, s, key } = slotOf(walk, pats, small);
          if (!(cell[SLOT_KEYS[s + 1]?.[0]] ?? 0) && SLOT_KEYS[s + 1]) {
            [cell[SLOT_KEYS[s][0]], cell[SLOT_KEYS[s][1]], cell[SLOT_KEYS[s + 1][0]], cell[SLOT_KEYS[s + 1][1]]] = [t1, 4, t2, 7];
            const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
            expect(out.warnings).toEqual([]);
            const { snap } = await reimport(out.data);
            expect(slots(snap, key, s)).toEqual([t1, 4, t2, 7]);
            expectOthersEqual(before, snap, sharing(walk, small));
          }
          // pair -> small (shrinks by 3 - len)
          const pats2 = buildDWGridFromWalk(walk).patterns;
          const before2 = snapshot(pats2);
          const o = slotOf(walk, pats2, once);
          [o.cell[SLOT_KEYS[o.s][0]], o.cell[SLOT_KEYS[o.s][1]], o.cell[SLOT_KEYS[o.s + 1][0]], o.cell[SLOT_KEYS[o.s + 1][1]]] = [st, sv === 0 ? 0 : 6, 0, 0];
          const out2 = applyDwGridEdits(new Uint8Array(src), walk, pats2);
          expect(out2.warnings).toEqual([]);
          const { walk: w3, snap: snap2 } = await reimport(out2.data);
          expect(trackLen(w3, once.block)).toBe(trackLen(walk, once.block) - (3 - len));
          expect(JSON.parse(snap2.get(o.key)!)[SLOT_KEYS[o.s][0]]).toBe(st);
          expectOthersEqual(before2, snap2, sharing(walk, once));
        }
      });
    }
  }
});
