/**
 * TonyWilliamsExporter.ts - export a TrackerSong as a Tony Williams (Sound Images, .tw) module.
 * The module is a 68k player fused with its data, so the export is the original bytes with the
 * grid's same-length edits patched into the stream (tonyWilliamsEdits.ts). Unedited = byte-exact.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { walkTonyWilliams } from '@lib/import/formats/tonyWilliamsWalk';
import { applyChipRamSampleEdits } from './chipRamSamplePatch';
import { applyTwGridEdits } from '@lib/import/formats/tonyWilliamsEdits';

export interface TonyWilliamsExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportTonyWilliams(song: TrackerSong): Promise<TonyWilliamsExportResult> {
  const original = song.uadeEditableFileData;
  if (!original || original.byteLength === 0) {
    throw new Error('Tony Williams export needs the original module bytes (the format has no standalone writer).');
  }
  const warnings: string[] = [];
  let bytes = new Uint8Array(original);
  if (song.uadeVariableLayout) {
    const walk = walkTonyWilliams(original, 0);
    if (!walk) warnings.push('The stream could not be walked; exporting the original bytes.');
    else {
      const r = applyTwGridEdits(bytes, walk, song.patterns);
      bytes = new Uint8Array(r.data);
      warnings.push(...r.warnings);
    }
  }
  // A sample edited in the shared sample editor (PCM, length, loop) lands where the module keeps the sample.
  const samples = applyChipRamSampleEdits(bytes, song.instruments ?? []);
  bytes = new Uint8Array(samples.data);
  warnings.push(...samples.warnings);
  const filename = (song.uadeEditableFileName ?? 'untitled.tw').split('/').pop() ?? 'untitled.tw';
  return { data: new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }), filename, warnings };
}
