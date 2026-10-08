/**
 * BenDaglishExporter.ts - native export for Ben Daglish modules (.bd).
 *
 * A Ben Daglish module is a compiled 68k player with its track streams. The grid is the replayer's walk
 * (benDaglishGrid.ts), so a cell is not a byte of the file: a note cell is the period a note command's byte,
 * the voice's transposes and the sample's base note give.
 *
 * Export is the module as loaded with each edited note written into its note command (benDaglishEdits.ts, G24).
 * What the walk grid cannot place in place (a note on a blank row, a removed note, an instrument or effect change)
 * comes back as a warning, so an edit is never dropped without the owner being told.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyBdGridEdits } from '@lib/import/formats/benDaglishEdits';
import { walkBenDaglish } from '@lib/import/formats/BenDaglishWasmExtractor';
import { editedCells, getGridBaseline } from '@/lib/song/gridBaseline';

export interface BenDaglishExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportBenDaglish(song: TrackerSong): Promise<BenDaglishExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Ben Daglish export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'song.bd').split('/').pop() ?? 'song.bd';
  const trackOffsets = song.uadeVariableLayout?.filePatternAddrs;
  if (!trackOffsets || (getGridBaseline() && editedCells(song.patterns).length === 0)) return { data: new Uint8Array(src), filename: name, warnings: [] };
  const walk = await walkBenDaglish(src.slice(0), song.fileSubsongs?.current ?? 0);
  const res = applyBdGridEdits(new Uint8Array(src), walk, trackOffsets, song.patterns);
  return { data: res.data, filename: name, warnings: res.warnings };
}
