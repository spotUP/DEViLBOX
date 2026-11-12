/**
 * DaveLoweExporter.ts - save a Dave Lowe (.dl) or Dave Lowe New (.dln) song: the module it was loaded from, with every section
 * an edited cell belongs to re-encoded from the grid (the parsers' variable layout and encoder, byte-exact carrier rows for what
 * the grid does not show) and written over its own slot. A section that no longer fits its slot is refused, as growing it needs
 * the module's pointers moved; it comes back as a warning. A section is shared by every position that plays it.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByVariableLayout } from './layoutPatch';

export interface DaveLoweExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportDaveLowe(song: TrackerSong): Promise<DaveLoweExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Dave Lowe export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout) throw new Error('Dave Lowe export needs the section layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.dl').split('/').pop() ?? 'module.dl';
  const r = patchModuleByVariableLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.refused.map((x) => `Pattern ${x.pattern + 1}, channel ${x.channel + 1}: the edited section needs ${x.encoded} bytes, its slot holds ${x.slot}; not saved`),
  };
}
