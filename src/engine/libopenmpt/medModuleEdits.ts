/**
 * The 'med-module' live-edit route: an OctaMED MMD3 song plays on libopenmpt, which takes no cell writes. A grid edit patches the
 * cell bytes into the loaded module (MEDExporter.patchMedModule, the export's own writer), the song carries the result as the
 * bytes the next play loads, and the running engine hot-reloads it, keeping its position.
 */
import type { TrackerSong } from '../TrackerReplayer';
import { patchMedModule } from '@/lib/export/MEDExporter';
import { LibopenmptEngine } from './LibopenmptEngine';

export function applyMedModuleEdits(song: TrackerSong): ArrayBuffer | null {
  const bytes = patchMedModule(song);
  if (!bytes) return null;
  song.libopenmptFileData = bytes;
  if (LibopenmptEngine.hasInstance()) LibopenmptEngine.getInstance().hotReload(bytes.slice(0));
  return bytes;
}
