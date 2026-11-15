/**
 * JamCrackerExporter.ts - Export JamCracker Pro (.jam) files
 *
 * Priority chain:
 *   1. WASM engine jc_save() — includes runtime edits from chip RAM
 *   2. A loaded module's own bytes with grid edits and the order list written in place (layoutPatch)
 *   3. From-scratch serializer (jamExport.ts) — builds from TrackerSong data
 *   4. Original file data fallback — returns unedited import data
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { JamCrackerEngine } from '@/engine/jamcracker/JamCrackerEngine';
import { exportSongToJam } from './jamExport';
import { patchModuleByLayout } from './layoutPatch';

export interface JamCrackerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportAsJamCracker(song: TrackerSong): Promise<JamCrackerExportResult> {
  const warnings: string[] = [];

  // 1. Try WASM serialization first (includes chip RAM edits)
  if (JamCrackerEngine.hasInstance()) {
    const engine = JamCrackerEngine.getInstance();
    try {
      const buf = await engine.save();
      if (buf.length > 0) {
        const data = new Blob([buf.buffer as ArrayBuffer], { type: 'application/octet-stream' });
        const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
        return { data, filename: `${baseName}.jam`, warnings };
      }
      warnings.push('WASM save returned empty data.');
    } catch (e) {
      warnings.push(`WASM save failed: ${(e as Error).message}.`);
    }
  }

  // 2. A loaded module: its own bytes with each edited cell written where the parser's layout puts it, and the order list
  // written over the song table when its length is unchanged (a different length shifts the pattern data: rebuild). The
  // rebuild below re-derives the instrument table from the grid: freehand-spreadtro.jam came back with instrument 1's flags
  // byte (37) changed and every cell re-encoded, so untouched voices played differently after an edit.
  const layout = song.uadePatternLayout;
  const src = song.uadeEditableFileData;
  if (src && layout?.formatId === 'jamCracker' && song.patterns.length === layout.numPatterns) {
    const r = patchModuleByLayout(src, layout, song.patterns);
    const b = r.bytes;
    const noi = (b[4] << 8) | b[5];
    const nop = (b[6 + noi * 40] << 8) | b[7 + noi * 40];
    const slAt = 8 + noi * 40 + nop * 6;
    const sl = (b[slAt] << 8) | b[slAt + 1];
    if (song.songPositions.length === sl) {
      song.songPositions.forEach((x, i) => { b[slAt + 2 + i * 2] = x >> 8; b[slAt + 3 + i * 2] = x & 0xFF; });
      if (r.unplaced.length > 0) warnings.push(`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`);
      const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
      return { data: new Blob([b.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }), filename: `${baseName}.jam`, warnings };
    }
  }

  // 3. Build from TrackerSong data (works for template-created songs and a changed pattern count or order length)
  try {
    const result = exportSongToJam(song);
    return { ...result, warnings: [...warnings, ...result.warnings] };
  } catch (e) {
    warnings.push(`From-scratch build failed: ${(e as Error).message}.`);
  }

  // 4. Fallback: export original binary
  const fileData = song.jamCrackerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error('No JamCracker file data available for export');
  }

  warnings.push('Using original file without in-session edits.');
  const data = new Blob([fileData], { type: 'application/octet-stream' });
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data, filename: `${baseName}.jam`, warnings };
}
