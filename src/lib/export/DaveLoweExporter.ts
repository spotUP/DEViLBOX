/**
 * DaveLoweExporter.ts - save a Dave Lowe (.dl) or Dave Lowe New (.dln) song: the module it was loaded from, with every section
 * an edited cell belongs to re-encoded from the grid (the parsers' variable layout and encoder, byte-exact carrier rows for what
 * the grid does not show) and written over its own slot. A section that no longer fits its slot is appended at the file end and
 * every position-list pointer to it is rewritten (the old bytes stay as dead data). A section is shared by every position that plays it.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByVariableLayout } from './layoutPatch';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';

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
  let data = r.bytes;
  const warnings: string[] = [];
  const moved = new Set<number>();
  for (const x of r.refused) {
    const fp = layout.trackMap[x.pattern]?.[x.channel] ?? -1;
    const refs = layout.sectionRefs?.at[fp];
    const where = `Pattern ${x.pattern + 1}, channel ${x.channel + 1}`;
    if (moved.has(fp)) continue;
    if (!refs?.length) { warnings.push(`${where}: the edited section needs ${x.encoded} bytes, its slot holds ${x.slot}; no pointer to move; not saved`); continue; }
    const bytes = encodeVariableBlock(layout, fp, song.patterns[x.pattern].channels[x.channel].rows, x.channel);
    const newAt = (data.length + 1) & ~1;
    const next = new Uint8Array(newAt + bytes.length);
    next.set(data); next.set(bytes, newAt);
    const dv = new DataView(next.buffer);
    for (const at of refs) dv.setUint32(at, newAt - layout.sectionRefs!.base);
    data = next;
    moved.add(fp);
  }
  return { data, filename: name, warnings };
}
