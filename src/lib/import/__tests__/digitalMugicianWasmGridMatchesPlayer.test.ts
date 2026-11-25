/**
 * The Digital Mugician grid (digmug.c dm_grid_*, the replayer's own walk) names the notes the
 * replayer plays: playing each song with the same C replayer, every row it reaches shows, per voice,
 * the period-table note and instrument the voice took at that row.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { digMugEditModule, digMugGrid } from '@/engine/digmug/digMugEditWasm';
import { parseDigitalMugicianFile } from '../formats/DigitalMugicianParser';
import { dmIndexToNote } from '../formats/DigitalMugicianNotes';

const SONGS = ['digital-mugician/believe.dmu', 'digital-mugician-2/snickle.mug', 'formats/cockwise.mug', 'formats/flight.dmu', 'formats/snickle.mug2'];

describe('Digital Mugician wasm grid = what the replayer plays', () => {
  for (const f of SONGS) it(f, async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', f)));
    const grid = await digMugGrid(bytes);
    const m = await digMugEditModule();
    const ptr = m._malloc(bytes.length);
    m.HEAPU8.set(bytes, ptr);
    const dm = m._dm_create(ptr, bytes.length, 44100);
    m._free(ptr);
    expect(dm).not.toBe(0);
    const FRAMES = 64;
    const out = m._malloc(FRAMES * 8);
    const rowsSeen = new Map<number, number>();
    const mismatches: string[] = [];
    let checked = 0, last = '';
    try {
      for (let block = 0; block < 400000 && !m._dm_has_ended(dm); block++) {
        m._dm_render(dm, out, FRAMES);
        const pos = m._dm_get_play_pos(dm), row = m._dm_get_play_row(dm);
        const key = `${pos}:${row}`;
        if (pos < 0 || key === last) continue;
        last = key;
        rowsSeen.set(pos, Math.max(rowsSeen.get(pos) ?? 0, row + 1));
        const pat = grid.patterns[grid.order[pos]];
        const cells = pat?.cells[row];
        if (!cells) { mismatches.push(`pos ${pos} row ${row}: not in the grid`); continue; }
        cells.forEach((c, ch) => {
          if (!c.note || c.effTyp === 0x03) return; // note wander slides; the voice keeps its note
          checked++;
          const note = dmIndexToNote(m._dm_voice_note_index(dm, ch));
          const ins = m._dm_voice_instrument(dm, ch);
          if (note !== c.note || (c.instrument && ins !== c.instrument)) mismatches.push(`pos ${pos} row ${row} ch ${ch}: grid ${c.note}/${c.instrument} played ${note}/${ins}`);
        });
      }
    } finally {
      m._free(out);
      m._dm_destroy(dm);
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(50);
    // every position plays exactly the rows its grid pattern holds
    expect(grid.order.map((p, k) => rowsSeen.get(k) === grid.patterns[p].cells.length)).not.toContain(false);
    // the parser's song is this grid
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const song = await parseDigitalMugicianFile(ab, f);
    expect(song.songPositions).toEqual(grid.order);
    expect(song.patterns[grid.order[0]].channels[0].rows.map((r) => r.note)).toEqual(grid.patterns[grid.order[0]].cells.map((r) => r[0].note));
  });
});
