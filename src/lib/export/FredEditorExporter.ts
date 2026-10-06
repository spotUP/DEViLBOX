/**
 * FredEditorExporter.ts - write a Fred Editor (.fred) song back to its own
 * module, with the grid's edits.
 *
 * The module the song plays (fredReplayerFileData) is decoded
 * (FredEditorModule.ts), every grid cell whose line differs from the line it
 * shows is written into that line's pattern (fredEditorGrid.ts), and the
 * module is encoded again: byte-exact where nothing was edited, the replay
 * code, track lists, instruments and samples carried as they are. Grid edits
 * already reach the module as they are made (fredModuleEdits.ts), so this
 * normally finds none; it catches a grid changed by any other route.
 *
 * Before 2026-10-06 this rebuilt a .fred from the display grid (one pattern
 * per channel per display pattern, synthesised durations): it played, but it
 * was not the song's own structure.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { decodeFredModule } from '@lib/import/formats/FredEditorModule';
import {
  FRED_ROWS_PER_PATTERN, applyFredGridEdits, cellToFredLine, fredLinesEqual, fredVoiceStates, walkFredSong, type FredGridEdit,
} from '@lib/import/formats/fredEditorGrid';

export interface FredEditorExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportFredEditor(song: TrackerSong): Promise<FredEditorExportResult> {
  const src = song.fredReplayerFileData;
  if (!src) throw new Error('Fred Editor export needs the module the song was loaded from');
  const bytes = new Uint8Array(src);
  const module = decodeFredModule(bytes);
  const walk = walkFredSong(module);
  const states = fredVoiceStates(module, walk);
  const edits: FredGridEdit[] = [];
  song.patterns.forEach((pattern, p) => {
    pattern.channels.forEach((channel, ch) => {
      channel.rows.forEach((cell, row) => {
        const ref = walk.voices[ch]?.[p * FRED_ROWS_PER_PATTERN + row];
        if (!ref) return;
        const r = p * FRED_ROWS_PER_PATTERN + row;
        const line = module.patterns[ref.pattern].lines[ref.line];
        if (!fredLinesEqual(cellToFredLine(cell, { line, state: states[ch][r] }), line)) {
          edits.push({ pattern: p, row, channel: ch, cell });
        }
      });
    });
  });
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data: applyFredGridEdits(bytes, edits), filename: `${baseName}.fred`, warnings: [] };
}
