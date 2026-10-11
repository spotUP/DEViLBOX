/**
 * Playlist track sources — what a `PlaylistTrack.fileName` must carry so the
 * DJ loader (`DJTrackLoader`) can fetch the bytes.
 *
 * A resolvable entry is one of:
 *   - `modland:<full_path>`  — downloaded from the Modland mirror
 *   - `hvsc:<path>`          — downloaded from HVSC via the server proxy
 *   - `local:<name>`         — bytes stored in IndexedDB by Add Files / drop
 *   - `http(s)://...`        — any other URL, downloaded through the server
 *                              proxy (`remoteSources.ts`); the HippoPlayer
 *                              playlists the seed is built from point at
 *                              hippoplayer.se, AmigaRemix, modules.pl, ...
 *
 * A *bare* name ("quickening.mod") is the legacy pre-`local:` form. It only
 * loads when that exact name happens to be cached in this browser's
 * IndexedDB, so a bare entry that came from anywhere other than this
 * browser's file picker can never load. The bundled seed playlists
 * (`public/data/playlists/imported-prg.json`) shipped 1295 such entries:
 * whoever built the seed fell back to the bare name whenever its Modland
 * lookup missed.
 *
 * The seed is now built by `tools/convert-hippo-playlists.ts`, which keeps
 * every entry's source; this module holds the resolver it uses to re-find a
 * Modland file that moved, and the runtime repair that brings a persisted
 * copy of a seed playlist up to the seed's sources.
 */

const SOURCE_PREFIX = /^(modland|hvsc|local|https?):/i;

/** True when the entry carries no source prefix (legacy bare name). */
export function isBareFileName(fileName: string): boolean {
  return !SOURCE_PREFIX.test(fileName);
}

/** The file's own name, without any source prefix or directory. */
export function sourceBaseName(fileName: string): string {
  const withoutPrefix = fileName.replace(SOURCE_PREFIX, '');
  return withoutPrefix.slice(withoutPrefix.lastIndexOf('/') + 1);
}

/** `%28` -> `(`, leaving a name untouched when it holds a `%` that is not an escape. */
export function decodePathEscapes(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** What identifies an entry across source changes: its file name, unescaped, lower-cased. */
function sourceKey(fileName: string): string {
  return decodePathEscapes(sourceBaseName(fileName)).toLowerCase();
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
 * Bring persisted copies of the bundled seed playlists up to the seed's
 * sources. An entry whose source the seed no longer holds — a bare name (no
 * source, never loads), a Modland path that moved, a basename guess the seed
 * has since replaced with the playlist's own URL — takes the seed source with
 * the same file name, when exactly one seed source has that name. Its bad
 * flag, earned because it could not load, is cleared. `local:` entries the
 * user added are never touched. Mutates `playlists` in place (Immer-draft safe).
 *
 * @returns the number of entries repaired
 */
export function repairSourcesFromSeed(
  playlists: RepairablePlaylist[],
  seed: readonly { id: string; tracks: readonly { fileName: string }[] }[],
): number {
  let repaired = 0;
  for (const seedPlaylist of seed) {
    const playlist = playlists.find((p) => p.id === seedPlaylist.id);
    if (!playlist) continue;
    const seedSources = new Set(seedPlaylist.tracks.map((t) => t.fileName));
    const sourcesByKey = new Map<string, Set<string>>();
    for (const source of seedSources) {
      const key = sourceKey(source);
      const set = sourcesByKey.get(key);
      if (set) set.add(source);
      else sourcesByKey.set(key, new Set([source]));
    }
    for (const track of playlist.tracks) {
      if (seedSources.has(track.fileName) || /^local:/.test(track.fileName)) continue;
      const candidates = sourcesByKey.get(sourceKey(track.fileName));
      if (candidates?.size !== 1) continue;
      track.fileName = candidates.values().next().value as string;
      track.isBad = false;
      track.badReason = undefined;
      track.badTimestamp = undefined;
      track.badFailCount = 0;
      repaired++;
    }
  }
  return repaired;
}

/**
 * Record the outcome of a load attempt on every playlist entry with this
 * source. `isBad` means exactly "the last attempt to load this source
 * failed": a failure sets it (with the reason), a successful load or render
 * clears it. No other signal — analysis, tempo, a skip decision — writes it.
 * Mutates `playlists` in place (Immer-draft safe).
 *
 * @returns the number of entries whose flag changed
 */
export function applyLoadOutcome(
  playlists: RepairablePlaylist[],
  fileName: string,
  outcome: { ok: true } | { ok: false; reason: string },
  now: number,
): number {
  let changed = 0;
  for (const playlist of playlists) {
    for (const track of playlist.tracks) {
      if (track.fileName !== fileName) continue;
      if (outcome.ok) {
        if (!track.isBad && !track.badFailCount) continue;
        track.isBad = false;
        track.badReason = undefined;
        track.badTimestamp = undefined;
        track.badFailCount = 0;
      } else {
        track.isBad = true;
        track.badReason = outcome.reason;
        track.badTimestamp = now;
        track.badFailCount = (track.badFailCount || 0) + 1;
      }
      changed++;
    }
  }
  return changed;
}
