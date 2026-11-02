/**
 * The module bytes a Hippel song plays from, with its grid edits written in.
 *
 * Hippel songs are decoded by libtfmxaudiodecoder straight from the file
 * (`song.hippelFileData`, the file as loaded). Playback reloads, and export
 * saves, the original bytes with every edited cell patched in place; nothing
 * else in the file changes. Formats without an editable grid return null.
 */
import type { TrackerCell } from '@/types';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { mapHippelCoSoCells } from '@lib/import/formats/HippelCoSoParser';
import { isJochenHippel7VFormat, mapJochenHippel7VCells } from '@lib/import/formats/JochenHippel7VParser';
import { findHippelTfmxHeader } from '@lib/import/formats/HippelTfmxWalk';
import { patchEditedCells, type HippelCellSpans, type HippelPatchResult } from './hippelCellSpans';

export function isCoSo(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0x43 && buf[1] === 0x4F && buf[2] === 0x53 && buf[3] === 0x4F; // 'COSO'
}

/**
 * @param fileData        the module as loaded (`hippelFileData`)
 * @param patterns        the grid as it is now
 * @param instrumentCount the loaded song's instrument count (CoSo shows
 *                        instrument 0 for a volume sequence past the last one)
 */
/** The cell spans of a Hippel module with an editable grid (CoSo, TFMX 4V and 7V), else null. */
export function mapHippelCells(fileData: ArrayBuffer | Uint8Array, instrumentCount: number, subsong = 0): HippelCellSpans | null {
  const buf = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  if (isCoSo(buf)) return mapHippelCoSoCells(buf, instrumentCount, subsong);
  if (isJochenHippel7VFormat(buf)) return mapJochenHippel7VCells(buf, subsong);
  // .hip: a TFMX song behind replay code, the decoder's own header search.
  if (findHippelTfmxHeader(buf) !== null) {
    const spans = mapJochenHippel7VCells(buf, subsong);
    return spans.length > 0 ? spans : null;
  }
  return null;
}

export function rebuildHippelModule(
  fileData: ArrayBuffer | Uint8Array,
  patterns: ReadonlyArray<{ channels: Array<{ rows: TrackerCell[] }> }>,
  instrumentCount: number,
  /** The subsong the grid shows (the song's fileSubsongs.current). */
  subsong = 0,
  /** instrument number -> the sound-sequence transpose its notes play under (see patchEditedCells). */
  keySeq?: (instrument: number) => number,
): HippelPatchResult | null {
  const buf = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const spans = mapHippelCells(buf, instrumentCount, subsong);
  return spans ? patchEditedCells(buf, spans, patterns, keySeq) : null;
}

/**
 * A loaded Hippel song's module with its grid edits written in, or null when the
 * song carries no module (`hippelFileData`) or the module has no editable grid.
 * The one save path for CoSo / TFMX songs: the samples, TFMX block and every
 * byte the grid does not show stay as loaded.
 */
export function rebuildHippelSong(song: TrackerSong): HippelPatchResult | null {
  if (!song.hippelFileData) return null;
  // A song with no grid (the scope view, gridUnmatchedReason) has no edits: its placeholder pattern is not one.
  return rebuildHippelModule(
    song.hippelFileData,
    song.gridUnmatchedReason ? [] : song.patterns,
    song.instruments.length,
    song.fileSubsongs?.current ?? 0,
    (n) => song.instruments.find((x) => x.id === n)?.metadata?.hippelKeySeq ?? 0,
  );
}

/** The export warning for edits that had no room in the module. */
export function hippelRefusedWarnings(refused: readonly string[]): string[] {
  return refused.length > 0
    ? [`${refused.length} edit(s) have no room in the module and were not saved (pattern:channel:row ${refused.slice(0, 8).join(', ')})`]
    : [];
}
