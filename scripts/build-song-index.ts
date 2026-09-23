/**
 * Build the jukebox's song index.
 *
 * `public/data/songs/` holds ~15k files across 189 format directories. The
 * jukebox exists to walk FORMATS quickly — one representative each, next,
 * next, next — so the index is grouped by directory and caps how many files
 * it carries per format. Testing every file is a different job and would put
 * a megabyte of names in the browser for nothing.
 *
 * Regenerate after adding songs:
 *     npx tsx scripts/build-song-index.ts
 *
 * Output: public/data/songs/index.json (committed — the corpus is a fixed
 * test asset, and a manifest that needs a server is one the built app cannot
 * use).
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SONGS_ROOT = join(process.cwd(), 'public/data/songs');
const OUT = join(SONGS_ROOT, 'index.json');

/** How many songs to carry per format. Enough to retry a format whose first
 *  file is a bad example — which happened twice in one night — without
 *  shipping every name. */
const PER_FORMAT = 8;

/** Not songs: manifests, notes, and the sweep's own output. */
const SKIP_EXT = new Set(['.json', '.md', '.txt', '.png', '.jpg', '.webp']);
const SKIP_DIR = new Set(['.git', 'node_modules']);

interface FormatEntry {
  /** Directory name, which is how the corpus names the format. */
  format: string;
  /** Paths relative to `public/`, ready to hand to the loader. */
  files: string[];
  /** How many the directory actually holds, so the UI can say "8 of 214". */
  total: number;
}

function songsIn(dir: string): string[] {
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

const formats: FormatEntry[] = [];
for (const name of readdirSync(SONGS_ROOT).sort()) {
  if (SKIP_DIR.has(name) || name.startsWith('.')) continue;
  const full = join(SONGS_ROOT, name);
  if (!statSync(full).isDirectory()) continue;
  const all = songsIn(full);
  if (all.length === 0) continue;
  formats.push({
    format: name,
    total: all.length,
    files: all.slice(0, PER_FORMAT).map((f) => `/${relative(join(process.cwd(), 'public'), f)}`),
  });
}

const index = {
  generated: new Date().toISOString(),
  perFormat: PER_FORMAT,
  formats,
};
writeFileSync(OUT, `${JSON.stringify(index, null, 2)}\n`);
console.log(
  `[song-index] ${formats.length} formats, `
  + `${formats.reduce((n, f) => n + f.files.length, 0)} songs listed `
  + `of ${formats.reduce((n, f) => n + f.total, 0)} total → ${relative(process.cwd(), OUT)}`,
);
