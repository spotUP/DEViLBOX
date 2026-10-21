// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import uproughRoutes from '../../../../server/src/routes/uprough';
import { parseSongFile } from '../songFile';
import { readNdjson } from '../generateClient';
import type { R2Event } from '@/engine/uprough/r2Events';
import { useFactoryStore } from '../factory/useFactoryStore';
import { decideToCells } from '../factory/decideToCells';
import { useTrackerStore } from '@stores/useTrackerStore';

// Runs the route against the REAL host generator (tools/song_file.py --events -).
// Set UPROUGH_HOST_ROOT to an Up Rough checkout that has the R2b emitter; skipped otherwise.
const HOST = process.env.UPROUGH_HOST_ROOT;
const present = !!HOST && fs.existsSync(`${HOST}/tools/song_file.py`);

describe.skipIf(!present)('POST /api/uprough/generate events:true against the real host', () => {
  let server: Server;
  let base: string;
  beforeAll(() => {
    process.env.UPROUGH_ROOT = HOST;
    const app = express();
    app.use(express.json());
    app.use('/api/uprough', uproughRoutes);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });

  it('streams NDJSON incrementally and ends with a done line carrying a parseable song file', async () => {
    const style = (await (await fetch(`${base}/api/uprough/styles`)).json() as { styles: string[] }).styles[0];
    const res = await fetch(`${base}/api/uprough/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ style, seed: 1, events: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const t0 = Date.now();
    const lines: { at: number; ev: { type: string; song?: unknown } }[] = [];
    await readNdjson(res.body!, (l) => lines.push({ at: Date.now() - t0, ev: JSON.parse(l) }));
    const kinds: Record<string, number> = {};
    for (const l of lines) kinds[l.ev.type] = (kinds[l.ev.type] ?? 0) + 1;
    console.log('R2C10', JSON.stringify({ n: lines.length, kinds, firstMs: lines[0].at, lastMs: lines.at(-1)!.at }));
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.at(-1)!.at).toBeGreaterThan(lines[0].at);
    const last = lines.at(-1)!.ev;
    expect(last.type).toBe('done');
    expect(last.song).toBeDefined();
    expect(() => parseSongFile(JSON.stringify(last.song))).not.toThrow();

    // R2c-09b: the real host events, piped through the factory seam, fill the panel's state once each.
    useFactoryStore.getState().reset();
    for (const l of lines) useFactoryStore.getState().onEvent(l.ev as R2Event);
    const state = useFactoryStore.getState().state;
    expect(state.eventCount).toBe(lines.length);
    expect(state.done).toBe(true);
    expect(state.voiceOrder).toHaveLength(kinds.bank!);
    expect(kinds.bank).toBe(13);
    expect(state.slots.find((x) => x.id === 'snare')!.attachments).toHaveLength(kinds.attach!);
    expect(kinds.attach).toBe(2);
    expect(state.sections).toHaveLength(kinds.section!);
    const decided = state.sections.reduce((n, sec) => n + Object.values(sec.decided).reduce((a, b) => a + b, 0), 0);
    expect(decided).toBe(kinds.decide);

    // R2h-02 (a): the sentinel counts every line the host emitted, none dropped.
    expect(state.eventCount).toBeGreaterThan(0);
    expect(state.eventCount).toBe(lines.length);
    // R2h-02 (b): the tracker holds the cells decideToCells yields over the received decides (the fill's own rule:
    // one taken set per section and bar). The done line is not applied here, so the tracker still holds the fill.
    const taken = new Map<string, Set<string>>();
    const expectedKeys = new Set<string>();
    let expectedCells = 0;
    for (const l of lines) {
      const ev = l.ev as R2Event;
      if (ev.type !== 'decide') continue;
      const key = `${ev.section}:${ev.bar}`;
      if (!taken.has(key)) taken.set(key, new Set());
      const cells = decideToCells(ev.lane, ev.bar, ev.cells, taken.get(key));
      expectedCells += cells.length;
      for (const c of cells) expectedKeys.add(`${ev.section}:${c.lane}:${c.row}`);
    }
    let trackerCells = 0;
    for (const p of useTrackerStore.getState().patterns) {
      for (const ch of p.channels) trackerCells += ch.rows.filter((cell) => cell.note > 0).length;
    }
    console.log('R2H02', JSON.stringify({ events: state.eventCount, decides: kinds.decide, expectedCells, distinct: expectedKeys.size, trackerCells }));
    expect(expectedCells).toBeGreaterThan(0);
    expect(state.cellsWritten).toBe(expectedCells);
    expect(trackerCells).toBe(expectedKeys.size);
  }, 180_000);
});
