/**
 * JamCrackerExporter.ts - Export JamCracker Pro (.jam) files
 *
 * Uses the WASM engine's jc_save() to serialize the current in-memory state
 * (including edits) to a valid JamCracker binary. Falls back to the original
 * file data if the engine is not running.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { JamCrackerEngine } from '@/engine/jamcracker/JamCrackerEngine';

export interface JamCrackerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportAsJamCracker(song: TrackerSong): Promise<JamCrackerExportResult> {
  const warnings: string[] = [];

  // Try WASM serialization first (includes edits)
  if (JamCrackerEngine.hasInstance()) {
    const engine = JamCrackerEngine.getInstance();
    try {
      const buf = await engine.save();
      if (buf.length > 0) {
        const data = new Blob([buf.buffer as ArrayBuffer], { type: 'application/octet-stream' });
        const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
        return { data, filename: `${baseName}.jam`, warnings };
      }
      warnings.push('WASM save returned empty data. Falling back to original file.');
    } catch (e) {
      warnings.push(`WASM save failed: ${(e as Error).message}. Falling back to original data.`);
    }
  }

  // Fallback: export original binary
  const fileData = song.jamCrackerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error('No JamCracker file data available for export');
  }

  warnings.push('Engine not running — exports original file without in-session edits.');
  const data = new Blob([fileData], { type: 'application/octet-stream' });
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data, filename: `${baseName}.jam`, warnings };
}
