/**
 * SoundMonExporter.ts - Export SoundMon V2 (.bp) files
 *
 * Priority chain:
 *   1. The loaded module with the grid's edits written in (writeEditsIntoSoundMonModule): byte-exact when unedited,
 *      the module's own header, instruments, synth tables and samples kept
 *   2. From-scratch TS serializer (soundMonExport.ts) — builds from TrackerSong data (a song with no SoundMon module
 *      behind it, or one restructured past one pattern per step)
 *   3. UADE chip RAM readback — captures running module data from WASM memory
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { exportSongToSoundMon, writeEditsIntoSoundMonModule, type SoundMonExportResult } from './soundMonExport';
import { sampleIsEdited } from '@/lib/song/gridBaseline';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

export async function exportAsSoundMon(song: TrackerSong): Promise<SoundMonExportResult> {
  const warnings: string[] = [];
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. The module the song was loaded from, with the grid's edits (a sample edit needs the writer that rebuilds samples).
  const loaded = song.soundMonFileData ?? song.uadeEditableFileData ?? song.nuadeFileData;
  if (loaded && !sampleIsEdited()) {
    const written = await writeEditsIntoSoundMonModule(loaded, song.patterns, song.nuadeFileName ?? song.uadeEditableFileName ?? `${baseName}.bp`);
    if (written) {
      const ext = (song.nuadeFileName ?? song.uadeEditableFileName ?? '').split('.').pop()?.toLowerCase();
      return {
        data: new Blob([written.bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
        filename: `${baseName}.${ext && /^(bp|bp2|bp3)$/.test(ext) ? ext : 'bp'}`,
        warnings: [...warnings, ...written.warnings],
      };
    }
  }

  // 2. Build from TrackerSong data (works for all songs, including templates)
  try {
    const result = exportSongToSoundMon(song);
    if (result.data.size > 0) {
      return { ...result, warnings: [...warnings, ...result.warnings] };
    }
    warnings.push('From-scratch build returned empty data.');
  } catch (e) {
    warnings.push(`From-scratch build failed: ${(e as Error).message}.`);
  }

  // 3. Fallback: UADE chip RAM readback (captures any runtime edits)
  try {
    const moduleSize = song.instruments?.[0]?.uadeChipRam?.moduleSize;
    if (moduleSize && moduleSize > 0) {
      const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
      const chipData = await chipEditor.readEditedModule(moduleSize);
      if (chipData && chipData.byteLength > 0) {
        warnings.push('Exported from UADE chip RAM (runtime state).');
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
