/**
 * Playlist track sources — what a `PlaylistTrack.fileName` must carry so the
 * DJ loader (`DJTrackLoader`) can fetch the bytes.
 *
 * A resolvable entry is one of:
 *   - `modland:<full_path>`  — downloaded from the Modland mirror
 *   - `hvsc:<path>`          — downloaded from HVSC via the server proxy
 *   - `local:<name>`         — bytes stored in IndexedDB by Add Files / drop
 *
 * A *bare* name ("quickening.mod") is the legacy pre-`local:` form. It only
 * loads when that exact name happens to be cached in this browser's
 * IndexedDB, so a bare entry that came from anywhere other than this
 * browser's file picker can never load. The bundled seed playlists
 * (`public/data/playlists/imported-prg.json`) shipped 1295 such entries:
 * whoever built the seed fell back to the bare name whenever its Modland
 * lookup missed.
 *
 * This module holds the one resolver used both offline (to fix the seed,
 * `tools/resolve-bundled-playlist-sources.ts`) and at runtime (to repair a
 * persisted copy of a seed playlist from the fixed seed).
 */

const SOURCE_PREFIX = /^(modland|hvsc|local):/;

/** True when the entry carries no source prefix (legacy bare name). */
export function isBareFileName(fileName: string): boolean {
  return !SOURCE_PREFIX.test(fileName);
}

/** The file's own name, without any source prefix or directory. */
export function sourceBaseName(fileName: string): string {
  const withoutPrefix = fileName.replace(SOURCE_PREFIX, '');
  return withoutPrefix.slice(withoutPrefix.lastIndexOf('/') + 1);
}

/** `pub/modules/<format>/<author>` of a Modland full path. */
function modlandAuthorDir(fullPath: string): string {
  return fullPath.split('/').slice(0, 4).join('/');
}

export interface SourceIndex {
  /** Lower-cased basename -> Modland full paths with that basename. */
  modland: ReadonlyMap<string, readonly string[]>;
  /** Lower-cased basename -> HVSC paths (relative to C64Music) with that basename. */
  hvsc: ReadonlyMap<string, readonly string[]>;
}

/**
 * Resolve a bare name to a loadable source, or null when no archive holds a
 * file of exactly that name — or several do and nothing says which.
 *
 * Ambiguity is settled only by context: the Modland author directories the
 * rest of the same playlist already resolved to. A guess is never made — a
 * wrong song in a DJ set is worse than a missing one.
 *
 * @param contextFileNames the other entries of the same playlist
 */
export function resolveBareFileName(
  bare: string,
  index: SourceIndex,
  contextFileNames: readonly string[],
): string | null {
  const key = bare.toLowerCase();

  const modland = index.modland.get(key) ?? [];
  if (modland.length === 1) return `modland:${modland[0]}`;
  if (modland.length > 1) {
    const authorDirs = new Set(
      contextFileNames
        .filter((f) => f.startsWith('modland:'))
        .map((f) => modlandAuthorDir(f.slice('modland:'.length))),
    );
    const inContext = modland.filter((p) => authorDirs.has(modlandAuthorDir(p)));
    if (inContext.length === 1) return `modland:${inContext[0]}`;
    return null;
  }

  const hvsc = index.hvsc.get(key) ?? [];
  if (hvsc.length === 1) return `hvsc:${hvsc[0]}`;
  return null;
}

interface RepairableTrack {
  fileName: string;
  isBad?: boolean;
  badReason?: string;
  badTimestamp?: number;
  badFailCount?: number;
}

interface RepairablePlaylist {
  id: string;
  tracks: RepairableTrack[];
}

/**
 * Repair persisted copies of the bundled seed playlists: every bare entry
 * whose seed counterpart (same playlist id, same basename) now carries a
 * source takes that source, and its bad flag — earned only because it could
 * not load — is cleared. Mutates `playlists` in place (Immer-draft safe).
 *
 * @returns the number of entries repaired
 */
export function repairBareSourcesFromSeed(
  playlists: RepairablePlaylist[],
  seed: readonly { id: string; tracks: readonly { fileName: string }[] }[],
): number {
  let repaired = 0;
  for (const seedPlaylist of seed) {
    const playlist = playlists.find((p) => p.id === seedPlaylist.id);
    if (!playlist) continue;
    const sourceByBase = new Map<string, string>();
    for (const t of seedPlaylist.tracks) {
      if (!isBareFileName(t.fileName)) {
        sourceByBase.set(sourceBaseName(t.fileName).toLowerCase(), t.fileName);
      }
    }
    for (const track of playlist.tracks) {
      if (!isBareFileName(track.fileName)) continue;
      const source = sourceByBase.get(track.fileName.toLowerCase());
      if (!source) continue;
      track.fileName = source;
      track.isBad = false;
      track.badReason = undefined;
      track.badTimestamp = undefined;
      track.badFailCount = 0;
      repaired++;
    }
  }
  return repaired;
}
