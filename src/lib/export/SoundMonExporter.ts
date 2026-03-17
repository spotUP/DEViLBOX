/**
 * SoundMonExporter.ts - Export SoundMon V2 (.bp) files
 *
 * Priority chain:
 *   1. From-scratch TS serializer (soundMonExport.ts) — builds from TrackerSong data
 *   2. UADE chip RAM readback — captures running module data from WASM memory
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { exportSongToSoundMon, type SoundMonExportResult } from './soundMonExport';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

export async function exportAsSoundMon(song: TrackerSong): Promise<SoundMonExportResult> {
  const warnings: string[] = [];

  // 1. Build from TrackerSong data (works for all songs, including templates)
  try {
    const result = exportSongToSoundMon(song);
    if (result.data.size > 0) {
      return { ...result, warnings: [...warnings, ...result.warnings] };
    }
    warnings.push('From-scratch build returned empty data.');
  } catch (e) {
    warnings.push(`From-scratch build failed: ${(e as Error).message}.`);
  }

  // 2. Fallback: UADE chip RAM readback (captures any runtime edits)
  try {
    const moduleSize = song.instruments?.[0]?.uadeChipRam?.moduleSize;
    if (moduleSize && moduleSize > 0) {
      const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
      const chipData = await chipEditor.readEditedModule(moduleSize);
      if (chipData && chipData.byteLength > 0) {
        warnings.push('Exported from UADE chip RAM (runtime state).');
        const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
        return {
          data: new Blob([chipData as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
          filename: `${baseName}.bp`,
          warnings,
        };
      }
    }
  } catch (e) {
    warnings.push(`Chip RAM readback failed: ${(e as Error).message}.`);
  }

  throw new Error('No export method available for SoundMon: ' + warnings.join(' '));
}
