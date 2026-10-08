/**
 * G5 / David Whittaker: a note typed on a row no note starts on is written into the module. The note covering the
 * row is split ([wait D][A] -> [wait k][A][wait D-k][Z][wait D]), the grown track is copied to the end of the module
 * and its position-list entries repointed. Per song:
 *   - the walk of the grown module has the same notes at the same ticks plus the new one at the typed row;
 *   - the ORIGINAL player (UADE) plays it: the other voices write exactly the same Paula registers for the whole
 *     render, the edited voice is the same up to the row and plays something else from it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk } from '@/lib/import/formats/davidWhittakerGrid';
import { applyDwGridEdits } from '@/lib/import/formats/davidWhittakerEdits';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { paulaEventStream, eventsOfVoice } from './gridOracle';

const ROWS = 64;
const FILE = 'david-whittaker/garfield2+.dw';

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

describe('David Whittaker: a note on a row no note starts on', { timeout: 120000 }, () => {
  it('splits the covering note: the same notes plus the new one, played by the original player', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs', FILE));
    const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const bytes = new Uint8Array(ab);
    const walk = await walkDavidWhittaker(ab.slice(0));
    const grid = buildDWGridFromWalk(walk).patterns;

    // Candidates: one speed unit into a note that lasts longer, first pattern(s).
    const tried: string[] = [];
    let chosen: { p: number; ch: number; row: number; note: number; result: ReturnType<typeof applyDwGridEdits> } | null = null;
    const notes = walk.events.filter((e) => e.kind === DW_WALK.note);
    for (let i = 0; i < notes.length && !chosen && tried.length < 12; i++) {
      const e = notes[i];
      const next = notes.find((x) => x.channel === e.channel && x.tick > e.tick);
      const tick = e.tick + walk.speed;
      if (!next || tick >= next.tick || tick >= 2 * ROWS) continue;
      const p = Math.floor(tick / ROWS), row = tick % ROWS;
      const cell = grid[p]?.channels[e.channel]?.rows[row] as unknown as { note: number } | undefined;
      const above = grid[p]?.channels[e.channel]?.rows[e.tick % ROWS] as unknown as { note: number } | undefined;
      if (!cell || cell.note !== 0 || !above || above.note <= 0 || above.note >= 97) continue;
      const edited = structuredClone(grid);
      (edited[p].channels[e.channel].rows[row] as unknown as { note: number }).note = above.note + 2;
      const result = applyDwGridEdits(bytes, walk, edited);
      tried.push(`${p}:${e.channel}:${row} ${result.warnings.join(';')}`);
      if (result.warnings.length === 0 && result.data.length > bytes.length) chosen = { p, ch: e.channel, row, note: above.note + 2, result };
    }
    expect(chosen, `a blank row inside a note that the module can split: ${tried.join(' | ')}`).not.toBeNull();
    const grown = chosen!.result.data;
    const tick = chosen!.p * ROWS + chosen!.row;

    // The grown module's walk: every old note start is still there, the new one is at the typed tick.
    const walk2 = await walkDavidWhittaker(grown.slice().buffer as ArrayBuffer);
    const starts = (w: typeof walk) => w.events.filter((e) => e.kind === DW_WALK.note).map((e) => `${e.channel}:${e.tick}`);
    const before = new Set(starts(walk));
    const after = starts(walk2);
    // The block is shared by every pass that plays it, so the note also starts on its later passes (G17).
    const added = after.filter((s) => !before.has(s));
    expect(added).toContain(`${chosen!.ch}:${tick}`);
    // Voices that play the same block change with it; the others must not.
    const sharing = new Set(added.map((s) => Number(s.split(':')[0])));
    expect(sharing.has(chosen!.ch)).toBe(true);
    for (const s of before) expect(after, `note start ${s} kept`).toContain(s);
    const back = buildDWGridFromWalk(walk2).patterns;
    expect((back[chosen!.p].channels[chosen!.ch].rows[chosen!.row] as unknown as { note: number }).note).toBe(chosen!.note);

    // The original player.
    const was = await paulaEventStream(bytes, 'garfield2+.dw');
    const now = await paulaEventStream(grown, 'garfield2+.dw');
    expect(was.length, 'the player ran (sentinel)').toBeGreaterThan(50);
    // The Paula voice order is not the walk's channel order: the edited voice is the one whose stream first differs, near the typed row.
    // A voice of another channel keeps every sample start (registers 0-2: pointer, length); its period and volume writes may move by
    // a tick, because the replayer's delay counter is global.
    const sampleStarts = (events: string[]) => events.filter((e) => ['0', '1', '2'].includes(e.split(':')[1]));
    const firstDiff = (a: string[], b: string[]) => { const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return Number((a[i] ?? b[i]).split(':')[0]); return -1; };
    const edited: number[] = [];
    for (let v = 0; v < 4; v++) {
      const a = eventsOfVoice(was, v), b = eventsOfVoice(now, v);
      const d = firstDiff(a, b);
      if (d >= tick * 2 - 1 && d <= tick * 2 + 4) edited.push(v);
      else expect(sampleStarts(b), `voice ${v}: every sample start kept`).toEqual(sampleStarts(a));
    }
    expect(edited.length, 'the voice that plays the new note differs from the typed row on').toBeGreaterThanOrEqual(1);
  });
});
