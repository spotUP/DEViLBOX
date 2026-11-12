/**
 * Jeroen Tel: a track entry stores its note in one byte. An unedited song exports byte-identical; a one-note edit changes only
 * that entry's note byte (grid note minus the voice's transpose) and keeps duration, instrument and volume bytes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJeroenTelFile } from '@/lib/import/formats/JeroenTelParser';
import { exportJeroenTel } from '@/lib/export/JeroenTelExporter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const NAME = 'stormlord title.jt';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/jeroen-tel', NAME)));
const load = () => parseJeroenTelFile(raw.slice().buffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Jeroen Tel is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('jeroenTel')?.exporter?.fn).toBe('exportJeroenTel');
  });

  it('an unedited song exports byte-identical', async () => {
    expect(Array.from((await exportJeroenTel(await load())).data)).toEqual(Array.from(raw));
  });

  it('a one-note edit changes only that entry note byte', async () => {
    const song = await load();
    const layout = song.uadePatternLayout!;
    expect(layout).toBeTruthy();
    let found: { p: number; c: number; i: number; at: number } | null = null;
    for (let p = 0; p < song.patterns.length && !found; p++) {
      for (let c = 0; c < 4 && !found; c++) {
        song.patterns[p].channels[c].rows.forEach((r, i) => {
          const at = getCellFileOffset(layout, p, i, c);
          if (!found && r.note > 20 && r.note < 80 && at >= 0 && raw[at] > 0 && raw[at] < 0x7F) found = { p, c, i, at };
        });
      }
    }
    expect(found).not.toBeNull();
    const { p, c, i, at } = found!;
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[i];
    song.patterns[p].channels[c].rows[i] = { ...cell, note: cell.note + 1 };
    const out = (await exportJeroenTel(song)).data;
    expect(diffAt(out, raw)).toEqual([at]);
    expect(out[at]).toBe(raw[at] + 1);
    setGridBaseline(null);
  });
});
