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
});
