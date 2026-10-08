/**
 * TFMX (G5, G24): a note edit reaches the module and the module plays.
 *   - the encoder is the parser's inverse: a note cell typed without byte carriers encodes to a command word that decodes to the
 *     same note (the encoder was 24 semitones off the parser, so every typed note came out two octaves away after export);
 *   - the export is the module as loaded: unedited it is the file byte for byte (it was a from-scratch rebuild that dropped every
 *     pattern past 128), edited it differs only in the command words of the edited cells;
*   - a note typed on a row of the grid that is a wait command (F3 xx) becomes a note-with-wait command of the same wait, so the
 *     module keeps its size and timing (the TFMX worklet's live swap is measured in tfmxLiveSwap.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTFMXFile } from '../TFMXParser';
import { exportTFMX } from '@/lib/export/TFMXExporter';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));

const FILE = 'public/data/songs/tfmx/mdat.hbtitle';
const buf = readFileSync(FILE);
const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

describe('TFMX note edits', { timeout: 120000 }, () => {
  it('the encoder inverts the parser', async () => {
    const song = await parseTFMXFile(bytes.slice(0), 'mdat.hbtitle');
    const layout = song.uadePatternLayout!;
    let n = 0;
    song.patterns.forEach((pat) => pat.channels.forEach((ch) => ch.rows.forEach((cell) => {
      if (cell.note <= 0 || cell.note >= 97 || cell.effTyp === 0x03 || n > 300) return;
      const typed = { note: cell.note, instrument: cell.instrument, volume: cell.volume, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
      expect(layout.decodeCell!(layout.encodeCell!(typed as never)).note).toBe(cell.note);
      n++;
    })));
    expect(n, 'note cells checked (sentinel)').toBeGreaterThan(20);
  });

  it('exported unedited it is the file; a note on a wait row keeps the size and the wait', async () => {
    const song = await parseTFMXFile(bytes.slice(0), 'mdat.hbtitle') as unknown as Parameters<typeof exportTFMX>[0];
    (song as { tfmxFileData?: ArrayBuffer }).tfmxFileData = bytes.slice(0);
    setGridBaseline(baselineOf(song.patterns));
    const same = new Uint8Array(await (await exportTFMX(song)).data.arrayBuffer());
    expect(same.length).toBe(bytes.byteLength);
    expect(same.every((v, i) => v === new Uint8Array(bytes)[i]), 'unedited export is the module').toBe(true);

    // A wait row (F3 xx) of the first patterns: the cell shows the speed/wait effect and no note.
    const layout = song.uadePatternLayout!;
    let at: { p: number; ch: number; row: number } | null = null;
    outer: for (let p = 0; p < 4; p++) for (let ch = 0; ch < 4; ch++) {
      const rows = song.patterns[p]?.channels[ch]?.rows ?? [];
      for (let row = 1; row < rows.length; row++) {
        const off = layout.getCellFileOffset!(p, row, ch);
        if (off >= 0 && new Uint8Array(bytes)[off] === 0xf3 && rows[row].note === 0) { at = { p, ch, row }; break outer; }
      }
    }
    expect(at, 'a wait row in the first patterns').not.toBeNull();
    const above = song.patterns[at!.p].channels[at!.ch].rows.slice(0, at!.row).reverse().find((c) => c.note > 0 && c.note < 97)!;
    const cell = song.patterns[at!.p].channels[at!.ch].rows[at!.row];
    song.patterns[at!.p].channels[at!.ch].rows[at!.row] = { ...cell, note: above.note, instrument: above.instrument, period: undefined, pan: undefined, cutoff: undefined, resonance: undefined };
    const out = await exportTFMX(song);
    expect(out.warnings, out.warnings.join(';')).toEqual([]);
    const grown = new Uint8Array(await out.data.arrayBuffer());
    expect(grown.length).toBe(bytes.byteLength);
    const off = layout.getCellFileOffset!(at!.p, at!.row, at!.ch);
    expect(grown[off] & 0x80, 'a note with wait').toBe(0x80);
    expect(grown[off + 3], 'the wait of the F3 it replaced').toBe(new Uint8Array(bytes)[off + 1] + 1);
    const back = await parseTFMXFile(grown.slice().buffer as ArrayBuffer, 'mdat.hbtitle');
    expect(back.patterns[at!.p].channels[at!.ch].rows[at!.row].note).toBe(above.note);

  });
});
