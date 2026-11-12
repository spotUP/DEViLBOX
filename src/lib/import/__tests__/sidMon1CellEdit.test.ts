/**
 * SidMon 1: every non-empty grid cell carries the stored 5 bytes in period/pan/cutoff/resonance, and the
 * layout's encodeCell returns them unconditionally (the GlueMon bug class, 8d9c49ca8). The live chip-RAM
 * write (UADEChipEditor.patchPatternCell) and the exporter (SidMon1Exporter) both go through layout.writeCell,
 * which compares the cell with what the module row shows (track transpose included). A grid edit copies the
 * cell with its carriers, so this guards that the edit survives and an unedited cell writes its original bytes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSidMon1File } from '@/lib/import/formats/SidMon1Parser';
import { exportSidMon1 } from '@/lib/export/SidMon1Exporter';
import { sm1IndexToXM } from '@/engine/uade/encoders/SidMon1Encoder';

const NAME = 'myfunnymazea.sid';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/sidmon-1', NAME)));
const load = () => parseSidMon1File(raw.slice().buffer as ArrayBuffer, NAME);

describe('SidMon 1 cell edits reach the bytes', () => {
  it('note and instrument edits (cell copied with its carriers) are written; an unedited cell is not', async () => {
    const song = load();
    const layout = song.uadePatternLayout!;
    // A cell showing a note whose module row is the first one that cell maps to.
    let hit: { p: number; r: number; ch: number } | null = null;
    for (let p = 0; p < song.patterns.length && !hit; p++) {
      for (let ch = 0; ch < 4 && !hit; ch++) {
        const rows = song.patterns[p].channels[ch].rows;
        const r = rows.findIndex((x) => x.note > 20 && x.note < 80 && x.period !== undefined);
        if (r >= 0 && layout.getCellFileOffset!(p, r, ch) >= 0) hit = { p, r, ch };
      }
    }
    expect(hit).not.toBeNull();
    const { p, r, ch } = hit!;
    const cell = song.patterns[p].channels[ch].rows[r];
    const off = layout.getCellFileOffset!(p, r, ch);
    expect(cell.pan).toBeDefined(); // the carriers are present: the shortcut shape this guards

    // Unedited: writes the original bytes.
    const same = layout.writeCell!(p, r, ch, { ...cell });
    expect(Array.from(same[0].bytes)).toEqual(Array.from(raw.slice(off, off + 5)));

    // Note edit, instrument edit.
    const noteRun = layout.writeCell!(p, r, ch, { ...cell, note: cell.note + 2 });
    expect(noteRun[0].offset).toBe(off);
    expect(noteRun[0].bytes[0]).toBe(raw[off] + 2);
    expect(noteRun[0].bytes[1]).toBe(raw[off + 1]);
    const insRun = layout.writeCell!(p, r, ch, { ...cell, instrument: (cell.instrument % 9) + 1 });
    expect(insRun[0].bytes[1]).toBe((cell.instrument % 9) + 1);
    expect(insRun[0].bytes[0]).toBe(raw[off]);

    // Decoded back: the edited layout shows the edited note (per-position transpose included).
    const edited = new Uint8Array(raw);
    edited.set(noteRun[0].bytes, off);
    const back = parseSidMon1File(edited.buffer as ArrayBuffer, NAME);
    expect(back.patterns[p].channels[ch].rows[r].note).toBe(cell.note + 2);
    expect(sm1IndexToXM(1)).toBeGreaterThan(0);

    // Export path: the same edit through the exporter changes exactly that cell byte.
    song.patterns[p].channels[ch].rows[r] = { ...cell, note: cell.note + 2 };
    const out = new Uint8Array(await (await exportSidMon1(song)).data.arrayBuffer());
    const diff = out.reduce<number[]>((l, v, k) => (v !== raw[k] ? [...l, k] : l), []);
    expect(diff).toEqual([off]);
    expect(out[off]).toBe(raw[off] + 2);
  });
});
