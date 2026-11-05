/**
 * G5 / David Whittaker: a note typed on a row no note starts on is written into the module. The note covering the
 * row is split ([wait D][A] -> [wait k][A][wait D-k][Z][wait D]), the grown track is copied to the end of the module
 * and its position-list entries repointed. Per song:
 *   - the walk of the grown module has the same notes at the same ticks plus the new one at the typed row;
 *   - the ORIGINAL player (UADE) plays it: the other voices write exactly the same Paula registers for the whole
 *     render, the edited voice is the same up to the row and plays something else from it.
 */
import { dwNoteToByte, dwWalkTransposes } from '@/lib/import/formats/davidWhittakerPitch';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk, dwRowClock } from '@/lib/import/formats/davidWhittakerGrid';
import { applyDwGridEdits } from '@/lib/import/formats/davidWhittakerEdits';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { paulaEventStream, eventsOfVoice } from './gridOracle';
import { parseAs } from '@/lib/export/__tests__/exporterHarness.shared';
import { exportDavidWhittaker } from '@/lib/export/DavidWhittakerExporter';

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
    const clock = dwRowClock(walk);

    // Candidates: one speed unit into a note that lasts longer, first pattern(s).
    const tried: string[] = [];
    let chosen: { p: number; ch: number; row: number; note: number; result: ReturnType<typeof applyDwGridEdits> } | null = null;
    const notes = walk.events.filter((e) => e.kind === DW_WALK.note);
    for (let i = 0; i < notes.length && !chosen && tried.length < 12; i++) {
      const e = notes[i];
      const next = notes.find((x) => x.channel === e.channel && x.ptick > e.ptick);
      // one row is one song step: the row under a note's own row
      const eRow = clock.tickToRow(e.ptick).row;
      const gridRow = eRow + 1;
      if (!next || gridRow >= clock.tickToRow(next.ptick).row || gridRow >= 2 * ROWS) continue;
      const p = Math.floor(gridRow / ROWS), row = gridRow % ROWS;
      const cell = grid[p]?.channels[e.channel]?.rows[row] as unknown as { note: number } | undefined;
      const above = grid[p]?.channels[e.channel]?.rows[eRow % ROWS] as unknown as { note: number } | undefined;
      if (!cell || cell.note !== 0 || !above || above.note <= 0 || above.note >= 97) continue;
      const edited = structuredClone(grid);
      (edited[p].channels[e.channel].rows[row] as unknown as { note: number }).note = above.note + 2;
      const result = applyDwGridEdits(bytes, walk, edited);
      tried.push(`${p}:${e.channel}:${row} ${result.warnings.join(';')}`);
      if (result.warnings.length === 0 && result.data.length > bytes.length) chosen = { p, ch: e.channel, row, note: above.note + 2, result };
    }
    expect(chosen, `a blank row inside a note that the module can split: ${tried.join(' | ')}`).not.toBeNull();
    const grown = chosen!.result.data;
    const newRow = chosen!.p * ROWS + chosen!.row;
    const tick = clock.rowToTick(newRow);   // garfield2+ has no frame skip: a processed tick is a frame

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

  it('a note typed on ANY row of the blank New Song template is written and sounds (rows 0, 1, 4, 8, 12)', async () => {
    // The New Song template (makeNewSongTemplates) blanks the source by turning notes into slots. Built from apb.dw as it
    // was (speed 3, the global delay counter, 2 unit waits), its slots fell every 6 or 7 rows: rows 4, 8 and 12 were
    // refused ("between them"), and a split had to grow a track past the 32 KiB a 16-bit pointer reaches. The template
    // now plays subsong 0 at speed 1, delay speed 0 and 1 unit waits, with the 0x83 hold in every slot, so every row
    // (one replayer tick) reads a slot, and a typed note replaces its hold in place and sounds until the next note.
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/templates/davidWhittaker.dw')));
    const song = await parseAs('davidWhittaker.dw', bytes);
    expect(song.gridUnmatchedReason, 'the blank opens with a grid').toBeUndefined();
    expect(song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0).length, 'and is blank').toBe(0);
    const walk = await walkDavidWhittaker(bytes.slice().buffer as ArrayBuffer);
    const rows = [0, 1, 4, 8, 12];
    const slots = rows.map((t) => walk.events.find((e) => e.channel === 0 && e.tick === t && e.kind === DW_WALK.waitRow));
    expect(slots.map((e) => e !== undefined), 'voice 1 reads a hold on every typed row').toEqual(rows.map(() => true));
    for (const t of rows) { const cell = song.patterns[Math.floor(t / ROWS)].channels[0].rows[t % ROWS]; cell.note = 37 + t; cell.instrument = 1; }
    const ex = await exportDavidWhittaker(song);
    expect(ex.warnings).toEqual([]);
    const out = new Uint8Array(await ex.data.arrayBuffer());
    const tr = dwWalkTransposes(walk);
    const want = rows.map((t, i) => dwNoteToByte(walk.layout.pitch, 37 + t, 0, tr.get(slots[i]!)));
    expect(slots.map((e) => out[e!.block + e!.pos]), 'each hold byte became its note').toEqual(want);
    const walk2 = await walkDavidWhittaker(out.slice().buffer as ArrayBuffer);
    const played = rows.map((t) => walk2.events.find((e) => e.kind === DW_WALK.note && e.channel === 0 && e.tick === t)?.b);
    expect(played, 'the walk plays each typed note on its row').toEqual(want);
    // The original player starts a sample for each typed note; the blank template starts none on voice 1.
    const starts = (ev: string[]) => ev.filter((e) => e.split(':')[2] === '0').length;
    const was = await paulaEventStream(bytes, 'davidWhittaker.dw', 2);
    const now = await paulaEventStream(out, 'davidWhittaker.dw', 2);
    expect(now.length, 'the player ran (sentinel)').toBeGreaterThan(0);
    expect(starts(now) - starts(was), 'a sample start per typed note').toBeGreaterThanOrEqual(rows.length);
  });
});
