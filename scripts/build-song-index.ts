/**
 * Build the jukebox's song index: one playable song for every format
 * DEViLBOX claims to support, plus every Furnace subformat.
 *
 * The corpus holds ~15k files in 186 directories, but the directory names are
 * not the authority on what the app can play — `FORMAT_REGISTRY` is, with 206
 * entries. So this matches real corpus files against the registry using
 * `detectFormat()`, the SAME function the loader uses. Anything the registry
 * knows and the corpus cannot demonstrate comes out as a coverage GAP rather
 * than silently not existing, which is the question an audit actually asks.
 *
 * Furnace is one registry entry but many machines, so its songs are split by
 * the chip directory they sit in (`furnace/gameboy`, `furnace/nes`, …). The
 * same is done for any format whose corpus directory has subdirectories: a
 * subformat that plays differently deserves its own row.
 *
 * Regenerate after adding songs:
 *     npx tsx scripts/build-song-index.ts
 */
import { readdirSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join, relative, basename, dirname, sep } from 'node:path';
import { FORMAT_REGISTRY, detectFormat, detectFormatFromContent } from '../src/lib/import/FormatRegistry';
import { companionFilesIn, isInSampleDirectory, isNonSongAsset, partnerlessFilesIn } from '../src/lib/import/companionResolver';

const ROOT = process.cwd();
const SONGS_ROOT = join(ROOT, 'public/data/songs');
const OUT = join(SONGS_ROOT, 'index.json');

/** Enough takes to move on when the first file of a format is a bad example —
 *  which happened twice in one night — without shipping 15k names. */
const PER_ENTRY = 6;

// `.instr` is a Sonix instrument; no registry entry plays one as a song.
const SKIP_EXT = new Set(['.json', '.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.html', '.instr', '.bak', '.info']);
const SKIP_DIR = new Set(['.git', 'node_modules']);

/**
 * A directory listing, in the shape `resolveCompanions()` expects.
 *
 * The jukebox must load a song the way DEViLBOX loads it, companions and all
 * — a TFMX tune without its `smpl.` partner, or a Sonix song without its
 * `.ss`/`.instr`, is not a test of anything. The resolution logic already
 * exists and is pure (`src/lib/import/companionResolver.ts`); what it needs
 * is a listing, so the index carries one per directory.
 */
interface DirListing {
  siblings: string[];
  subdirs?: Record<string, string[]>;
  parentSamples?: string[];
}

interface Entry {
  /** Stable id, also the key a fault report writes to on the :4444 tracker. */
  id: string;
  /** What the list shows. */
  label: string;
  /** Registry key, or null when the corpus has a song the registry cannot name. */
  formatKey: string | null;
  /** Machine / chip, for formats that have several. */
  subformat?: string;
  files: string[];
  total: number;
  /** Key into `dirs` — where this row's songs live, and what sits beside them. */
  dir: string;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      if (SKIP_DIR.has(name) || name.startsWith('.')) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      const dot = name.lastIndexOf('.');
      if (dot > 0 && SKIP_EXT.has(name.slice(dot).toLowerCase())) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

const webPath = (f: string) => `/${relative(join(ROOT, 'public'), f)}`;

/** Directories directly under a format directory — Furnace's chips, and any
 *  other format that organises its corpus by machine. */
function subdirsOf(dir: string): string[] {
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.') && !SKIP_DIR.has(n))
    .filter((n) => statSync(join(dir, n)).isDirectory())
    .sort();
}

const entries: Entry[] = [];
/** Registry keys the corpus can actually demonstrate. */
const covered = new Set<string>();

/**
 * One row per FORMAT, not per directory.
 *
 * Most directories hold a single format and become one row. Two shapes break
 * that and both are real:
 *
 *  - `formats/` is the one-song-per-format collection: 165 files that are 165
 *    DIFFERENT formats. Grouped by directory it collapsed into a single
 *    useless row.
 *  - `furnace/` is one format on many machines, each of which plays through
 *    different chip code and breaks independently.
 *
 * So files are grouped by (directory, detected format), using the app's own
 * `detectFormat()`. A directory whose files all detect the same way still
 * produces exactly one row, which is the common case.
 */
/** Listings by directory (relative to public/), shared by every row from it. */
const dirs: Record<string, DirListing> = {};

/** Cap: a listing exists to find a handful of companions, not to mirror a
 *  directory of thousands into the browser. Matches MAX_SUBDIR_FILES. */
const MAX_LISTED = 512;

function listingFor(dir: string): string {
  const key = `/${relative(join(ROOT, 'public'), dir)}`;
  if (dirs[key]) return key;
  const names = readdirSync(dir).filter((n) => !n.startsWith('.'));
  const siblings: string[] = [];
  const subdirs: Record<string, string[]> = {};
  for (const n of names) {
    if (statSync(join(dir, n)).isDirectory()) {
      subdirs[n] = readdirSync(join(dir, n)).filter((x) => !x.startsWith('.')).slice(0, MAX_LISTED);
    } else {
      siblings.push(n);
    }
  }
  // ZoundMonitor keeps `Samples/` beside the song's DIRECTORY, one level up.
  let parentSamples: string[] | undefined;
  try {
    const up = join(dir, '..', 'Samples');
    if (statSync(up).isDirectory()) {
      parentSamples = readdirSync(up).filter((n) => !n.startsWith('.')).slice(0, MAX_LISTED);
    }
  } catch { /* no Samples directory beside it */ }

  dirs[key] = {
    siblings: siblings.slice(0, MAX_LISTED),
    ...(Object.keys(subdirs).length ? { subdirs } : {}),
    ...(parentSamples ? { parentSamples } : {}),
  };
  return key;
}

/** The first bytes of a file, for the content-aware detection (never the whole corpus in memory). */
function headOf(path: string, n = 128): Uint8Array {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = readSync(fd, buf, 0, n, 0);
    return new Uint8Array(buf.buffer, buf.byteOffset, got);
  } finally { closeSync(fd); }
}

/** A file the registry names as a song in its own right (not the catch-all). */
function isSongByName(name: string): boolean {
  const det = detectFormat(name.toLowerCase());
  return !!det && det.key !== 'amiga_formats_catchall';
}

/**
 * Drop the files that belong WITH a song in `dir`: the `instruments/*.ss` a
 * SMUS owns, the `.ins` of an Infogrames `.dum`. Listed as songs they each
 * "failed to load" and were judged broken formats (ledger F11, F12). The
 * rule is the resolver's own, run backwards (`companionFilesIn`).
 */
const companionsByDir = new Map<string, Set<string>>();
function companionsIn(dir: string): Set<string> {
  let set = companionsByDir.get(dir);
  if (!set) {
    const listing = dirs[listingFor(dir)];
    set = new Set([...companionFilesIn(listing, isSongByName), ...partnerlessFilesIn(listing)].map((c) => c.toLowerCase()));
    companionsByDir.set(dir, set);
  }
  return set;
}
/** A module claims companions beside it (`smpl.x`) or one directory down
 *  (`instruments/Saxophone.ss`), so a file is checked against the listing of
 *  its own directory and of its parent. */
function isCompanionFile(f: string): boolean {
  const own = dirname(f);
  if (companionsIn(own).has(basename(f).toLowerCase())) return true;
  const up = dirname(own);
  return up !== own && companionsIn(up).has(relative(up, f).toLowerCase());
}
function withoutCompanions(_dir: string, files: string[]): string[] {
  return files.filter((f) => !isInSampleDirectory(relative(SONGS_ROOT, f)) && !isNonSongAsset(relative(SONGS_ROOT, f).split(sep).join('/')) && !isCompanionFile(f));
}

function addRows(dirLabel: string, dir: string, allFiles: string[], subformat?: string): void {
  const files = withoutCompanions(dir, allFiles);
  if (files.length === 0) return;
  const byFormat = new Map<string | null, string[]>();
  for (const f of files) {
    const det = detectFormatFromContent(basename(f).toLowerCase(), headOf(f));
    const key = det?.key ?? null;
    const list = byFormat.get(key);
    if (list) list.push(f); else byFormat.set(key, [f]);
  }

  const several = byFormat.size > 1;
  for (const [formatKey, group] of byFormat) {
    if (formatKey) covered.add(formatKey);
    const def = formatKey ? FORMAT_REGISTRY.find((f) => f.key === formatKey) : undefined;
    // Only name the format in the label when the directory holds more than
    // one — otherwise every row would read "ahx / AHX".
    const label = several && def ? `${dirLabel} / ${def.label}` : dirLabel;
    entries.push({
      id: [dirLabel.replace(/\s*\/\s*/g, '-'), several ? formatKey ?? 'unknown' : null]
        .filter(Boolean).join('-'),
      label,
      formatKey,
      ...(subformat ? { subformat } : {}),
      files: group.slice(0, PER_ENTRY).map(webPath),
      total: group.length,
      dir: listingFor(dir),
    });
  }
}

for (const dirName of readdirSync(SONGS_ROOT).sort()) {
  if (SKIP_DIR.has(dirName) || dirName.startsWith('.')) continue;
  const dir = join(SONGS_ROOT, dirName);
  if (!statSync(dir).isDirectory()) continue;

  const subs = subdirsOf(dir);
  if (subs.length === 0) {
    addRows(dirName, dir, filesUnder(dir));
    continue;
  }

  // A directory of directories: one group per machine, plus whatever sits
  // loose alongside them.
  for (const sub of subs) {
    addRows(`${dirName} / ${sub}`, join(dir, sub), filesUnder(join(dir, sub)), sub);
  }
  const loose = readdirSync(dir)
    .filter((n) => !n.startsWith('.') && !statSync(join(dir, n)).isDirectory())
    .filter((n) => { const d = n.lastIndexOf('.'); return !(d > 0 && SKIP_EXT.has(n.slice(d).toLowerCase())); })
    .sort()
    .map((n) => join(dir, n));
  addRows(dirName, dir, loose);
}

/** Registry formats with nothing in the corpus to prove them. */
const gaps = FORMAT_REGISTRY
  .filter((f) => !covered.has(f.key))
  .map((f) => ({ formatKey: f.key, label: f.label }))
  .sort((a, b) => a.label.localeCompare(b.label));

/**
 * One row per format (owner, 2026-10-06: "we only need one song per format").
 * Directories of directories made a row per artist folder - DefleMask had 176
 * rows, SNDH 82. Rows of one format collapse to the one with the most takes;
 * its takes stay in its own directory so companions still resolve. Furnace
 * keeps a row per chip: each chip is a different sound engine. Rows whose
 * format was not detected are kept as they are.
 */
function onePerFormat(rows: Entry[]): Entry[] {
  const best = new Map<string, Entry>();
  const kept: Entry[] = [];
  for (const row of rows) {
    if (!row.formatKey) { kept.push(row); continue; }
    const perChip = row.dir.startsWith('/data/songs/furnace/') && row.subformat;
    const key = perChip ? `${row.formatKey}/${row.subformat}` : row.formatKey;
    const prev = best.get(key);
    if (!prev || row.total > prev.total) best.set(key, row);
  }
  return [...kept, ...best.values()];
}

const deduped = onePerFormat(entries);
entries.length = 0;
entries.push(...deduped);
entries.sort((a, b) => a.label.localeCompare(b.label));

writeFileSync(OUT, `${JSON.stringify({
  generated: new Date().toISOString(),
  perEntry: PER_ENTRY,
  registryTotal: FORMAT_REGISTRY.length,
  covered: covered.size,
  entries,
  dirs,
  gaps,
}, null, 2)}\n`);

console.log(
  `[song-index] ${entries.length} rows (${covered.size}/${FORMAT_REGISTRY.length} registry formats covered, `
  + `${gaps.length} with no test song) → ${relative(ROOT, OUT)}`,
);
