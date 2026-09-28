/**
 * The module bytes a Hippel song plays from, with its grid edits written in.
 *
 * Hippel songs are decoded by libtfmxaudiodecoder straight from the file
 * (`song.hippelFileData`, the file as loaded). Playback reloads, and export
 * saves, the original bytes with every edited cell patched in place; nothing
 * else in the file changes. Formats without an editable grid return null.
 */
import type { TrackerCell } from '@/types';
import { mapHippelCoSoCells } from '@lib/import/formats/HippelCoSoParser';
import { isJochenHippel7VFormat, mapJochenHippel7VCells } from '@lib/import/formats/JochenHippel7VParser';
import { patchEditedCells, type HippelCellSpans, type HippelPatchResult } from './hippelCellSpans';

function isCoSo(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0x43 && buf[1] === 0x4F && buf[2] === 0x53 && buf[3] === 0x4F; // 'COSO'
}

/**
 * @param fileData        the module as loaded (`hippelFileData`)
 * @param patterns        the grid as it is now
 * @param instrumentCount the loaded song's instrument count (CoSo shows
 *                        instrument 0 for a volume sequence past the last one)
 */
export function rebuildHippelModule(
  fileData: ArrayBuffer | Uint8Array,
  patterns: ReadonlyArray<{ channels: Array<{ rows: TrackerCell[] }> }>,
  instrumentCount: number,
): HippelPatchResult | null {
  const buf = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  let spans: HippelCellSpans;
  if (isCoSo(buf)) spans = mapHippelCoSoCells(buf, instrumentCount);
  else if (isJochenHippel7VFormat(buf)) spans = mapJochenHippel7VCells(buf);
  else return null;
  return patchEditedCells(buf, spans, patterns);
}
