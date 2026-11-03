/**
 * Which Modland files are the sample/instrument half of a multi-file format
 * (smpl.<tune> beside mdat.<tune>, smp.set, Instruments/*.ss, songplay ...).
 *
 * The answer needs a whole directory listing, so it is computed here, at index
 * build time, from the full allmods listing, and stored as
 * modland_files.is_companion. The search query filters on the flag; a filter on
 * one page of results would break counts and miss half-pairs.
 *
 * The rule is companionResolver's own, run backwards - the same call the song
 * index (scripts/build-song-index.ts) makes per directory.
 */

import {
  companionFilesIn,
  isInSampleDirectory,
  isNonSongAsset,
  listingFromRelativePaths,
  partnerlessFilesIn,
} from '../../../src/lib/import/companionResolver';
import { detectFormat } from '../../../src/lib/import/formatFilenameMatcher';

export interface ListedFile {
  format: string;
  author: string;
  /** Path under the author directory (may contain `/`, e.g. `Instruments/x.ss`). */
  filename: string;
}

/** A file the registry names as a song in its own right (not the catch-all). */
function isSongByName(name: string): boolean {
  const det = detectFormat(name.toLowerCase());
  return !!det && det.key !== 'amiga_formats_catchall';
}

/** `pub/modules/<format>/<author>/<filename>` paths of every companion in `files`. */
export function companionPathsIn(files: Iterable<ListedFile>): Set<string> {
  const byDir = new Map<string, ListedFile[]>();
  for (const f of files) {
    const key = `${f.format}/${f.author}`;
    const list = byDir.get(key);
    if (list) list.push(f); else byDir.set(key, [f]);
  }
  const out = new Set<string>();
  for (const [dir, list] of byDir) {
    const listing = listingFromRelativePaths(list.map((f) => f.filename));
    const claimed = new Set(
      [...companionFilesIn(listing, isSongByName), ...partnerlessFilesIn(listing)].map((c) => c.toLowerCase()),
    );
    for (const f of list) {
      const rel = f.filename;
      if (
        claimed.has(rel.toLowerCase()) ||
        isInSampleDirectory(rel) ||
        isNonSongAsset(`${dir}/${rel}`)
      ) out.add(`pub/modules/${dir}/${rel}`);
    }
  }
  return out;
}
