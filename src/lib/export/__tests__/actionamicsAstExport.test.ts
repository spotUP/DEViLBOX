/**
 * Actionamics .ast export through the dialog's path: dynablaster.ast loaded via parseModuleToSong, written by
 * nativeExportAvailable / exportNativeSong. Unedited = byte-identical; one edited cell round-trips.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PATH = join(process.cwd(), 'public/data/songs/formats/dynablaster.ast');

async function load(bytes?: Uint8Array) {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(PATH));
  const song = await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], 'dynablaster.ast'));
  return { raw, song };
}

describe('Actionamics .ast native export', () => {
  it('is offered and exports byte-identical unedited', async () => {
    const { exportNativeSong, nativeExportAvailable } = await import('@lib/export/nativeExportRouter');
    const { raw, song } = await load();
    expect(await nativeExportAvailable(song)).toBe(true);
    const res = await exportNativeSong(song);
    if (!res) throw new Error('no native export');
    expect(res.warnings).toEqual([]);
    expect(res.data.length).toBe(raw.length);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  }, 120000);

  it('one edited note exports, re-parses and reads back as the edit', async () => {
    const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
    const { raw, song } = await load();
    const rows = song.patterns[1].channels[0].rows;
    const r = rows.findIndex((c) => c.note);
    const was = rows[r].note;
    const note = was + 1;
    rows[r].note = note;
    const res = await exportNativeSong(song);
    if (!res) throw new Error('no native export');
    // a track re-encodes at its own length, so the file may grow or shrink; the read-back below is the check
    expect(Array.from(res.data)).not.toEqual(Array.from(raw));
    const again = await load(res.data);
    const back = again.song.patterns[1].channels[0].rows;
    expect(back[r].note).toBe(note);
    // every other cell unchanged
    song.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((cell, ri) => {
      expect([pi, c, ri, again.song.patterns[pi].channels[c].rows[ri].note]).toEqual([pi, c, ri, cell.note]);
    })));
  }, 120000);
});
