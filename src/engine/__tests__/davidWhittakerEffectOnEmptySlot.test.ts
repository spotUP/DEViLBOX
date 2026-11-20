/** David Whittaker: a one-argument effect typed on a slot the replayer ran none on is inserted before the row's note. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk, dwEventEffects, dwRowClock, SLOT_KEYS } from '@/lib/import/formats/davidWhittakerGrid';
import { applyDwGridEdits } from '@/lib/import/formats/davidWhittakerEdits';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';

let restore = () => {};
beforeAll(() => { restore = installDwNodeFetch(); });
afterAll(() => restore());

const KINDS: number[] = [DW_WALK.globalTranspose, DW_WALK.globalVolume, DW_WALK.globalFade, DW_WALK.volumeFade, DW_WALK.channelTranspose, DW_WALK.delaySpeed];

describe('David Whittaker effect on an empty slot', { timeout: 120000 }, () => {
  it('garfield2+: unedited export is identical; a typed one-argument command re-walks on the note\'s tick', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs/david-whittaker/garfield2+.dw'));
    const src = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const walk = await walkDavidWhittaker(src);
    const pats = buildDWGridFromWalk(walk).patterns;
    const same = applyDwGridEdits(new Uint8Array(src), walk, pats);
    expect(same.data).toEqual(new Uint8Array(src));

    const gv = walk.events.find((e) => KINDS.includes(e.kind) && e.block !== 0xffffffff)!;
    expect(gv).toBeDefined();
    const clock = dwRowClock(walk);
    const note = walk.events.find((e) => e.kind === DW_WALK.note && e.block !== 0xffffffff && e.ptick > 0 && e.channel < walk.channels
      && !walk.events.some((o) => o.channel === e.channel && o.ptick === e.ptick && o !== e))!;
    const { row } = clock.tickToRow(note.ptick);
    const cell = pats[Math.floor(row / 64)].channels[note.channel].rows[row % 64] as unknown as Record<string, number>;
    expect(cell[SLOT_KEYS[0][0]] ?? 0).toBe(0);
    cell[SLOT_KEYS[0][0]] = dwEventEffects(gv)[0][0];
    cell[SLOT_KEYS[0][1]] = 37;
    const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
    expect(out.warnings).toEqual([]);
    expect(out.data.length).toBeGreaterThan(src.byteLength);
    const walk2 = await walkDavidWhittaker(out.data.buffer.slice(0) as ArrayBuffer);
    const hit = walk2.events.filter((e) => e.channel === note.channel && e.ptick === note.ptick && e.kind === gv.kind && e.a === 37);
    expect(hit.length).toBe(1);
    expect(walk2.events.some((e) => e.channel === note.channel && e.ptick === note.ptick && e.kind === DW_WALK.note && e.b === note.b)).toBe(true);
    // the other notes keep their ticks
    const ticks = (w: typeof walk) => w.events.filter((e) => e.kind === DW_WALK.note).map((e) => `${e.channel}:${e.ptick}:${e.b}`);
    expect(ticks(walk2)).toEqual(ticks(walk));
  });
});
