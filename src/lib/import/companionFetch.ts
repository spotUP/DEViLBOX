/**
 * companionFetch - read a module's partner files for the browser, one way for
 * every in-app load path (file browser, jukebox).
 *
 * The resolver (companionResolver.ts) decides WHICH files from a directory
 * listing. This module supplies that listing and reads the files. Both loaders
 * used to list a directory their own way: the file browser read the bundled
 * file manifest, which only holds the common module and audio extensions, so
 * in a mixed folder such as songs/formats it never saw WantedTeam.bin, a
 * `.nt`, a `.ssd` or a `smpl.*` partner. The jukebox read the song index and
 * found them. The same song then loaded with partners from one and without
 * them from the other (2026-10-05).
 *
 * The listing comes from the song index (built from the disk by
 * scripts/build-song-index.ts, every file of every song directory), then from
 * the server API for paths the index does not cover.
 */
import { resolveCompanions, type CompanionListing } from './companionResolver';
import { sunTronicCompanionPaths } from './formats/SunTronicV13';
import { listServerDirectory, readServerFile, readStaticFile } from '@/lib/serverFS';

/** Where a load path lists directories and reads files. Paths are relative to public/data, e.g. `songs/formats/`. */
export interface CompanionIO {
  listing(dir: string): Promise<CompanionListing | null>;
  read(path: string): Promise<ArrayBuffer | null>;
}

/** Ensure a directory path is relative to public/data and ends with `/`. */
function normaliseDir(dir: string): string {
  const d = dir.replace(/^\/+/, '').replace(/^data\//, '');
  return d.endsWith('/') ? d : `${d}/`;
}

/**
 * The partner files of `filename`, which lives in `dir`, keyed by the name the
 * replayer opens. `moduleBytes` lets a format name its own sidecars (SunTronic
 * V1.3 names each instr/ sample inside the module).
 */
export async function gatherCompanions(
  filename: string,
  dir: string,
  moduleBytes: ArrayBuffer | undefined,
  io: CompanionIO = appCompanionIO,
): Promise<Map<string, ArrayBuffer>> {
  const base = normaliseDir(dir);
  const companions = new Map<string, ArrayBuffer>();

  // SunTronic V1.3 opens instr/<name>.x through dos.library; the module holds
  // the exact names, which beat any listing rule.
  if (moduleBytes) {
    for (const rel of sunTronicCompanionPaths(moduleBytes)) {
      const buf = await io.read(base + rel);
      if (buf) companions.set(rel, buf);
    }
    if (companions.size > 0) return companions;
  }

  const listing = await io.listing(base);
  if (!listing) return companions;
  const resolved = resolveCompanions(filename, listing);
  for (const key of resolved.companions) {
    const buf = await io.read(base + (resolved.sources[key] ?? key));
    if (buf) companions.set(key, buf);
  }
  return companions;
}

interface SongIndexListings {
  dirs: Record<string, CompanionListing>;
}

let songIndex: Promise<SongIndexListings | null> | null = null;

/** The song index's directory listings, fetched once. */
function songIndexListings(): Promise<SongIndexListings | null> {
  songIndex ??= (async () => {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}data/songs/index.json`);
      if (!res.ok) return null;
      const json = (await res.json()) as Partial<SongIndexListings>;
      return json.dirs ? { dirs: json.dirs } : null;
    } catch {
      return null;
    }
  })();
  return songIndex;
}

/** Test seam: forget the cached index. */
export function resetCompanionIndexCache(): void {
  songIndex = null;
}

/** A directory listed by the server API, in the resolver's shape. */
async function serverListing(dir: string): Promise<CompanionListing | null> {
  const list = async (path: string) => {
    try { return await listServerDirectory(path); } catch { return []; }
  };
  const entries = await list(dir);
  if (entries.length === 0) return null;
  const listing: CompanionListing = { siblings: entries.filter((e) => !e.isDirectory).map((e) => e.name) };
  const subdirs: Record<string, string[]> = {};
  for (const e of entries) {
    if (!e.isDirectory) continue;
    subdirs[e.name] = (await list(`${dir}${e.name}/`)).filter((f) => !f.isDirectory).map((f) => f.name);
  }
  if (Object.keys(subdirs).length) listing.subdirs = subdirs;
  const parent = dir.replace(/[^/]+\/$/, '');
  const parentSamples = (await list(`${parent}Samples/`)).filter((f) => !f.isDirectory).map((f) => f.name);
  if (parentSamples.length) listing.parentSamples = parentSamples;
  return listing;
}

/** The in-app IO: song index then server for listings; static bundle then server for reads. */
export const appCompanionIO: CompanionIO = {
  async listing(dir) {
    const index = await songIndexListings();
    const fromIndex = index?.dirs[`/data/${dir.replace(/\/$/, '')}`];
    return fromIndex ?? serverListing(dir);
  },
  async read(path) {
    try { return await readStaticFile(path); } catch { /* not in the static bundle */ }
    try { return await readServerFile(path); } catch { /* not on the server */ }
    return null;
  },
};
