/**
 * Format669Exporter.ts - save a Composer 669 (.669) song: the module it was loaded from, with each edited grid
 * cell's three bytes written where the parser's layout puts it (Format669Parser.ts getCellFileOffset / encode669Edit). Same
 * length, and byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';
import { editedCells } from '@/lib/song/gridBaseline';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

export interface Format669ExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportFormat669(song: TrackerSong): Promise<Format669ExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Composer 669 export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Composer 669 export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.669').split('/').pop() ?? 'module.669';
  const r = patchModuleByLayout(src, layout, song.patterns);
  const warnings: string[] = [];
  if (r.unplaced.length > 0) warnings.push(`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`);
  const conflicts = sharedPatternConflicts(song, layout);
  if (conflicts > 0) warnings.push(`${conflicts} cell(s) of a pattern used at several song positions were edited differently at two positions; the later position was saved`);
  return { data: r.bytes, filename: name, warnings };
}

/**
 * The module stores one copy of a pattern however many song positions play it, while the grid holds one pattern per position. Two
 * positions of the same file pattern edited to different cells cannot both be saved: the later one overwrites the earlier. Counts the
 * stored cells where that happens.
 */
function sharedPatternConflicts(song: TrackerSong, layout: NonNullable<TrackerSong['uadePatternLayout']>): number {
  const byOffset = new Map<number, string>();
  const conflicted = new Set<number>();
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const at = getCellFileOffset(layout, pattern, row, channel);
    if (at < 0) continue;
    const key = `${cell.note}/${cell.instrument}/${cell.volume}/${cell.effTyp}/${cell.eff}`;
    const prev = byOffset.get(at);
    if (prev !== undefined && prev !== key) conflicted.add(at);
    byOffset.set(at, key);
  }
  return conflicted.size;
}
