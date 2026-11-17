/**
 * MusicMakerExporter.ts - save a Music Maker 4V/8V song as `.sdata`: the sdata it was loaded from with the grid's note,
 * instrument and volume edits patched into the triples they came from (MusicMakerParser.buildMusicMakerGrid gives the
 * offsets). Same length, byte-exact where nothing was edited. A macro shared by several positions changes everywhere it
 * is played. Edits the triple cannot hold (empty cell, legato instrument, note off, other bank) come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { buildMusicMakerGrid, MM_NOTE_PERIODS, MM_VOLUMES, readMusicMakerIff } from '@lib/import/formats/MusicMakerParser';
import { noteToPeriod } from '@lib/amiga/periodNotes';

export interface MusicMakerExportResult { data: Uint8Array; filename: string; warnings: string[] }

const nearest = (table: readonly number[], v: number, from = 0): number => {
  let best = from;
  for (let i = from; i < table.length; i++) if (Math.abs(table[i] - v) < Math.abs(table[best] - v)) best = i;
  return best;
};

export async function exportMusicMaker(song: TrackerSong): Promise<MusicMakerExportResult> {
  if (!song.musicMakerFileData) throw new Error('Music Maker export needs the song it was loaded from');
  const { song: orig } = readMusicMakerIff(song.musicMakerFileData);
  const out = orig.sdata.slice();
  const base = buildMusicMakerGrid(orig);
  const warnings: string[] = [];
  const written = new Map<number, string>();
  base.patterns.forEach((bp, p) => bp.channels.forEach((bc, v) => bc.rows.forEach((was, r) => {
    const now = song.patterns[p]?.channels[v]?.rows[r];
    if (!now || (now.note === was.note && now.instrument === was.instrument && now.volume === was.volume)) return;
    const where = `position ${p} voice ${v + 1} row ${r}`;
    const src = base.sources[p][v][r];
    if (!src?.note) { warnings.push(`${where}: no note triple here to edit`); return; }
    const b0 = out[src.at], b1 = out[src.at + 1];
    let n0 = b0, n1 = b1;
    if (now.note !== was.note) {
      if (now.note < 1 || now.note > 96) { warnings.push(`${where}: note off or empty is not written in place`); return; }
      n1 = (b1 & 0xc0) | nearest(MM_NOTE_PERIODS, noteToPeriod(now.note));
    }
    if (now.instrument !== was.instrument) {
      const inst = now.instrument - 1 - src.bank;
      if (src.legato || inst < 0 || inst > 15) { warnings.push(`${where}: instrument ${now.instrument} cannot be held in this triple`); return; }
      n0 = (n0 & 0x0f) | (inst << 4);
    }
    if (now.volume !== was.volume) {
      n0 = (n0 & 0xf0) | nearest(MM_VOLUMES, now.volume - 0x10, 1);
    }
    const bytes = `${n0},${n1}`;
    const prev = written.get(src.at);
    if (prev !== undefined && prev !== bytes) { warnings.push(`${where}: shares a macro triple with a differently edited cell; first edit kept`); return; }
    written.set(src.at, bytes);
    out[src.at] = n0; out[src.at + 1] = n1;
  })));
  const stem = (song.name || 'song').replace(/[^\w.-]+/g, '_');
  return { data: out, filename: `${stem}.sdata`, warnings };
}
