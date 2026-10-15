/**
 * KlysExporter.ts - Export klystrack (.kt) files
 *
 * Uses the WASM engine's klys_save_song() to serialize the current in-memory
 * state (including edits) to a valid .kt binary. Falls back to the original
 * file data if the engine is not running.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import { klysInstrumentToEngine } from '@/engine/klystrack/klysSongData';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useFormatStore } from '@stores/useFormatStore';
import { notify } from '@stores/useNotificationStore';
import { planKlysExport } from './klysStandaloneExport';

export interface KlysExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportAsKlystrack(song: TrackerSong): Promise<KlysExportResult> {
  const warnings: string[] = [];

  // Standalone klystrack instruments travel in the file (klysStandaloneExport.ts); with none, the path below is unchanged.
  const plan = planKlysExport(useInstrumentStore.getState().instruments, useFormatStore.getState().klysNative);
  if (plan.error) {
    notify.error(plan.error);
    throw new Error(plan.error);
  }
  if (plan.extra.length > 0) {
    const buf = await KlysEngine.getInstance().serializeSongWith(plan.extra.map(klysInstrumentToEngine), plan.remap);
    const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
    return { data: new Blob([buf], { type: 'application/octet-stream' }), filename: `${baseName}.kt`, warnings: plan.warnings };
  }

  // Try WASM serialization first (includes edits)
  if (KlysEngine.hasInstance()) {
    const engine = KlysEngine.getInstance();
    try {
      const buf = await engine.serializeSong();
      const data = new Blob([buf], { type: 'application/octet-stream' });
      const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
      return { data, filename: `${baseName}.kt`, warnings };
    } catch (e) {
      warnings.push(`WASM serialize failed: ${(e as Error).message}. Falling back to original data.`);
    }
  }

  // Fallback: export original binary
  if (!song.klysFileData) {
    throw new Error('No klystrack file data available for export');
  }

  warnings.push('Engine not running — exports original file without in-session edits.');
  const data = new Blob([song.klysFileData], { type: 'application/octet-stream' });
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data, filename: `${baseName}.kt`, warnings };
}
