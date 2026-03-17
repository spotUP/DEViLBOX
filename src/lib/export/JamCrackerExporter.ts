/**
 * JamCrackerExporter.ts - Export JamCracker Pro (.jam) files
 *
 * Priority chain:
 *   1. WASM engine jc_save() — includes runtime edits from chip RAM
 *   2. From-scratch serializer (jamExport.ts) — builds from TrackerSong data
 *   3. Original file data fallback — returns unedited import data
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { JamCrackerEngine } from '@/engine/jamcracker/JamCrackerEngine';
import { exportSongToJam } from './jamExport';

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

  // 2. Build from TrackerSong data (works for template-created songs)
  try {
    const result = exportSongToJam(song);
    return { ...result, warnings: [...warnings, ...result.warnings] };
  } catch (e) {
    warnings.push(`From-scratch build failed: ${(e as Error).message}.`);
  }

  // 3. Fallback: export original binary
  const fileData = song.jamCrackerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error('No JamCracker file data available for export');
  }

  warnings.push('Using original file without in-session edits.');
  const data = new Blob([fileData], { type: 'application/octet-stream' });
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data, filename: `${baseName}.jam`, warnings };
}
