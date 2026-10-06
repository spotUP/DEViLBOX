/**
 * An edited Actionamics cell is the note the replayer plays: the edit is
 * written into the track the voice reads (note byte = shown note less the
 * transposes), the module re-encodes, the export carries it, and the running
 * replayer takes the new tracks without losing its place.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { parseActionamicsFile } from '@/lib/import/formats/ActionamicsParser';
import { applyActionamicsGridEdits } from '@/lib/import/formats/actionamicsGrid';
import { exportActionamics } from '@/lib/export/ActionamicsExporter';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { actionamicsTransform } from '@/engine/actionamics/ActionamicsEngine';

const FILE = join(ROOT, 'public/data/songs/actionamics/dynablaster.ast');
const bytes = new Uint8Array(readFileSync(FILE));

interface Wasm {
  _act_event_count(h: number): number;
  _act_event_field(h: number, i: number, f: number): number;
  _act_get_row(h: number): number;
}

describe('Actionamics grid edits', () => {
  const song = parseActionamicsFile(bytes, 'dynablaster.ast')!;
  const rows = song.patterns[0].channels[1].rows;
  const target = rows.findIndex((c, r) => r >= 10 && c.note > 0);
  const edit = (note: number) => ({ pattern: 0, row: target, channel: 1, cell: { ...rows[target], note } });

  it('a note edit is the note the module then shows; nothing else moves', () => {
    const next = applyActionamicsGridEdits(bytes, [edit(rows[target].note + 2)]);
    const again = parseActionamicsFile(next, 'dynablaster.ast')!;
    expect(again.patterns[0].channels[1].rows[target].note).toBe(rows[target].note + 2);
    for (const [p, pat] of song.patterns.entries()) pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      if (p === 0 && ch === 1 && r === target) return;
      expect(again.patterns[p].channels[ch].rows[r], `${p}:${ch}:${r}`).toEqual(cell);
    }));
  });

  it('a cleared cell and a cell set in an empty row are written and read back', () => {
    const empty = rows.findIndex((c, r) => r > target && c.note === 0 && c.effTyp === 0);
    const cleared = applyActionamicsGridEdits(bytes, [{ ...edit(0) }]);
    expect(parseActionamicsFile(cleared, 'd')!.patterns[0].channels[1].rows[target].note).toBe(0);
    const filled = applyActionamicsGridEdits(bytes, [{ pattern: 0, row: empty, channel: 1, cell: { ...rows[target], note: rows[target].note + 5 } }]);
    const cell = parseActionamicsFile(filled, 'd')!.patterns[0].channels[1].rows[empty];
    expect([cell.note, cell.instrument]).toEqual([rows[target].note + 5, rows[target].instrument]);
  });

  it('an edit that cannot be written (a note the track byte cannot hold) leaves the module as it was', () => {
    expect(applyActionamicsGridEdits(bytes, [edit(120)])).toBe(bytes);
  });

  it('the export carries the edited grid, and is the module itself when nothing changed', async () => {
    const plain = new Uint8Array(await (await exportActionamics(song)).data.arrayBuffer());
    expect(plain.length).toBe(bytes.length);
    expect(plain.every((b, i) => b === bytes[i])).toBe(true);
    const edited = parseActionamicsFile(bytes, 'd')!;
    edited.patterns[0].channels[1].rows[target] = { ...rows[target], note: rows[target].note + 2 };
    const out = new Uint8Array(await (await exportActionamics(edited)).data.arrayBuffer());
    expect(parseActionamicsFile(out, 'd')!.patterns[0].channels[1].rows[target].note).toBe(rows[target].note + 2);
  });

  it('the running replayer plays the edited note on the row, and keeps its place', async () => {
    loadSharedWorkletScripts();
    const note = rows[target].note + 2;
    const next = applyActionamicsGridEdits(bytes, [edit(note)]);
    const { proc, send } = await startWorklet('actionamics', 'Actionamics', actionamicsTransform);
    await send({ type: 'loadModule', moduleData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    await send({ type: 'play' });
    const w = (proc as unknown as { module: Wasm }).module;
    const h = (proc as unknown as { handle: number }).handle;
    const out = stereoOutputs(5);
    const start = 39;
    let swapped = false, seen = 0, rowAtSwap = -1, rowAfter = -1;
    const played: number[] = [];
    for (let block = 0; block < 12000 && played.length === 0; block++) {
      proc.process([], out);
      if (!swapped && w._act_get_row(h) >= 4) {
        rowAtSwap = w._act_get_row(h);
        await send({ type: 'replaceModule', moduleData: next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) });
        swapped = true;
        proc.process([], out);
        rowAfter = w._act_get_row(h);
      }
      for (const n = w._act_event_count(h); seen < n; seen++) {
        const f = (i: number): number => w._act_event_field(h, seen, i);
        if (f(0) - start === 0 && f(1) === target && f(2) === 1) played.push(periodToNote(f(7)));
      }
    }
    expect(rowAtSwap).toBeGreaterThanOrEqual(4);
    expect(target, 'the edited row is ahead of the swap').toBeGreaterThan(rowAtSwap);
    expect(rowAfter, 'the swap keeps the replayer on its row').toBe(rowAtSwap);
    expect(played).toEqual([note]);
  }, 60000);
});
