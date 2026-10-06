/**
 * The Actionamics grid is the song the replayer plays, and the playhead is the
 * row it is on.
 *
 * Runs the real worklet and WASM replayer headless (workletHarness) over the
 * first pass of every corpus module's first sub-song, records every sample
 * start the voices make (position, row, voice, sample, table period: the
 * replayer's own event log, act_event_field) and the position/row the worklet
 * reports, and holds the parsed grid to both:
 *   - every note the replayer starts has a cell at its position/row/voice that
 *     names the same note (ProTracker naming from the table period) and the
 *     same sample;
 *   - every note cell the grid shows is started by the replayer;
 *   - the rows the replayer reads are exactly the rows of the grid's patterns
 *     (a set rows / break effect shortens a position: dynablaster plays 50,
 *     49 and 64 rows of 64);
 *   - the position the worklet reports while a note starts is that note's
 *     pattern and row (the playhead is the row sounding, not an estimate).
 * One test of the wiring through the product's entry points (parse -> grid;
 * worklet -> position messages); the codec and the walk have their own tests.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { parseActionamicsFile } from '@/lib/import/formats/ActionamicsParser';
import { decodeActionamicsModule, encodeActionamicsModule } from '@/lib/import/formats/ActionamicsModule';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { actionamicsTransform } from '@/engine/actionamics/ActionamicsEngine';

/** Every distinct .ast / .act module under public/data/songs. */
function corpus(): Array<{ name: string; path: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; path: string }> = [];
  const root = join(ROOT, 'public/data/songs');
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of readdirSync(join(root, dir.name))) {
      if (!/\.(ast|act)$/i.test(f)) continue;
      const path = join(root, dir.name, f);
      const hash = createHash('sha1').update(readFileSync(path)).digest('hex');
      if (!readFileSync(path).subarray(62, 84).toString('latin1').startsWith('ACTIONAMICS')) continue;
      if (seen.has(hash)) continue;
      seen.add(hash);
      out.push({ name: f, path });
    }
  }
  return out;
}

interface Wasm {
  _act_event_count(h: number): number;
  _act_event_field(h: number, i: number, f: number): number;
  _act_get_position(h: number): number;
  _act_get_row(h: number): number;
  _act_has_ended(h: number): number;
}

const FILES = corpus();

describe('Actionamics corpus', () => {
  it('has modules to test', () => { expect(FILES.length).toBeGreaterThan(0); });

  for (const { name, path } of FILES) {
    describe(name, () => {
      const bytes = new Uint8Array(readFileSync(path));

      it('decodes and re-encodes byte for byte', () => {
        const m = decodeActionamicsModule(bytes);
        expect(m).not.toBeNull();
        const again = encodeActionamicsModule(m!);
        expect(again.length).toBe(bytes.length);
        expect(again.every((b, i) => b === bytes[i])).toBe(true);
      });

      it('shows what the replayer plays, and the playhead is the row sounding', async () => {
        loadSharedWorkletScripts();
        const song = parseActionamicsFile(bytes, name)!;
        const m = decodeActionamicsModule(bytes)!;
        const start = m.songs[0].start;
        const grid = song.patterns;

        const { proc, send, posted } = await startWorklet('actionamics', 'Actionamics', actionamicsTransform);
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        await send({ type: 'loadModule', moduleData: buf });
        await send({ type: 'play' });
        const w = (proc as unknown as { module: Wasm }).module;
        const h = (proc as unknown as { handle: number }).handle;
        const out = stereoOutputs(5);

        const played = new Map<string, { sample: number; period: number }>();
        const rowsRead = new Set<string>();
        const wrong: string[] = [];
        let seen = 0;
        let lastReport = -1;
        for (let block = 0; block < 400000; block++) {
          proc.process([], out);
          const reports = posted.filter((p) => (p as { type?: string }).type === 'position') as unknown as Array<{ position: number; row: number }>;
          const report = reports[reports.length - 1];
          if (report) rowsRead.add(`${report.position}:${report.row}`);
          const count = w._act_event_count(h);
          for (; seen < count; seen++) {
            const f = (i: number): number => w._act_event_field(h, seen, i);
            const pos = f(0) - start, row = f(1), voice = f(2), sample = f(6), period = f(7);
            const key = `${pos}:${row}:${voice}`;
            played.set(key, { sample, period });
            // The playhead while the note starts is the note's pattern and row.
            if (!report || report.position !== pos || report.row !== row) wrong.push(`${key}: playhead ${report?.position}:${report?.row}`);
            const cell = grid[pos]?.channels[voice]?.rows[row];
            if (!cell) { wrong.push(`${key}: no cell`); continue; }
            if (cell.note !== periodToNote(period)) wrong.push(`${key}: shows note ${cell.note}, replayer starts period ${period} (note ${periodToNote(period)})`);
            const instr = cell.instrument ? m.sampleLists[m.instruments[cell.instrument - 1].sampleList][0] : sample;
            if (instr !== sample) wrong.push(`${key}: shows instrument ${cell.instrument} (sample ${instr}), replayer starts sample ${sample}`);
          }
          lastReport = block;
          if (w._act_has_ended(h) && block > 8) break;
        }
        expect(lastReport, 'the first pass of the sub-song ended').toBeLessThan(399999);
        expect(wrong.slice(0, 10)).toEqual([]);

        // Every note the grid shows is played; every row of the grid is read, and no other.
        const shown: string[] = [];
        const rows: string[] = [];
        grid.forEach((p, pi) => {
          for (let r = 0; r < p.length; r++) rows.push(`${pi}:${r}`);
          p.channels.forEach((c, v) => c.rows.forEach((cell, r) => { if (cell.note) shown.push(`${pi}:${r}:${v}`); }));
        });
        expect(shown.filter((k) => !played.has(k)).slice(0, 10)).toEqual([]);
        expect([...rowsRead].filter((k) => !rows.includes(k)).slice(0, 10)).toEqual([]);
        expect(rows.filter((k) => !rowsRead.has(k)).slice(0, 10)).toEqual([]);
        expect(played.size).toBeGreaterThan(0);
      }, 120000);
    });
  }
});
