/**
 * BenDaglishExporter.ts - native export for Ben Daglish modules (.bd).
 *
 * A Ben Daglish module is a compiled 68k player with its track streams. The grid is the
 * replayer's walk (benDaglishGrid.ts), so a cell is not a byte of the file: a note cell is the
 * period a note command's byte, the voice's transposes and the sample's base note give.
 *
 * Export is the module as loaded, byte for byte. A grid edit has no writer yet (plan unit
 * G16-benDaglish in thoughts/shared/plans/2026-10-07-grid-from-replayer-walk.md): the grid is
 * compared with the grid the module itself shows and every edited cell comes back as a
 * warning, so an edit is never dropped without the owner being told.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseBenDaglishFile } from '@lib/import/formats/BenDaglishParser';

export interface BenDaglishExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportBenDaglish(song: TrackerSong): Promise<BenDaglishExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Ben Daglish export needs the module the song was loaded from');
  const name = song.uadeEditableFileName ?? 'song.bd';
  const original = await parseBenDaglishFile(src.slice(0), name);
  let edited = 0;
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, r) => {
    const was = original.patterns[p]?.channels[ch]?.rows[r];
    if (!was || was.note !== cell.note || was.instrument !== cell.instrument || was.volume !== cell.volume
      || was.effTyp !== cell.effTyp || was.eff !== cell.eff || was.effTyp2 !== cell.effTyp2 || was.eff2 !== cell.eff2) edited++;
  })));
  const warnings = edited > 0
    ? [`${edited} edited cell(s) were not written: Ben Daglish grid edits have no writer yet, the file is the module as loaded`]
    : [];
  return { data: new Uint8Array(src), filename: name.split('/').pop() ?? name, warnings };
}
