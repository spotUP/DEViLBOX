/**
 * DynamicSynthesizerExporter.ts - save a Dynamic Synthesizer (dns.) song: the module it was loaded from, with the grid's note and
 * instrument edits patched into the command words they came from (dynamicSynthesizerEdits.ts). Same length, byte-exact
 * where nothing was edited; edits the module cannot hold in place come back as warnings.
 * Reference: DynamicSynthesizerParser.ts (import), dynamicSynthesizerGrid.ts (the walk the grid is drawn from).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyDnsGridEdits } from '@lib/import/formats/dynamicSynthesizerEdits';

export interface DynamicSynthesizerExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportDynamicSynthesizer(song: TrackerSong): Promise<DynamicSynthesizerExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Dynamic Synthesizer export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'dns.song').split('/').pop() ?? 'dns.song';
  const original = new Uint8Array(src);
  // a song whose grid did not match the replayer's walk opened without a layout: there is no grid to write back
  if (!song.uadeVariableLayout) return { data: original, filename: name, warnings: [] };
  const r = applyDnsGridEdits(original, song.patterns);
  return { data: r.data, filename: name, warnings: r.warnings };
}
