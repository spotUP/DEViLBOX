#!/usr/bin/env npx tsx
/**
 * fetchCorpus.ts - give every table row that has no corpus song one or two real songs from Modland (the server's own
 * route, /api/modland/search and /download on :3011), so the comparison batch can measure it. A candidate is kept only
 * when the row's own nuade player accepts it (probe verdict Supported) and it is small (<= 1.5 MB). Files go to
 * public/data/songs/formats/<modland filename>; the table's `corpus` is rewritten by hand-free text substitution.
 *
 *   npx tsx --tsconfig tsconfig.app.json tools/nuade/fetchCorpus.ts [id,...]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';
import { NUADE_FORMAT_LIST } from '../../src/engine/nuade/nuadeFormats';
import { ROOT } from './nuadeCompare';

const SERVER = 'http://localhost:3011/api/modland';
const OUT = 'public/data/songs/formats';
const MAX_BYTES = 1_500_000;
const WANT = 2;
/** Downloads tried per row before giving up (the server rate-limits them). */
const MAX_TRIES = 10;
/** Modland's own name for a format where a suffix search finds nothing. */
const MODLAND_FORMAT: Record<string, string> = {
  maximumeffect: 'Maximum Effect', soundimages: 'Sound Images', pierreadane: 'Pierre Adane Packer', quartet: 'Quartet ST', spl: 'Sound Programming Language',
};

interface Hit { filename: string; full_path: string; extension: string; format: string }

/** The player's probe says Supported, or (Unsure) it opens the file and starts a subsong. */
function accepts(nu: NuadeHeadless, id: string, bytes: Uint8Array, name: string): boolean {
  const v = nu.probeWith(id, bytes, name);
  if (v === 0) return true;
  if (v !== 2) return false;
  try { nu.clearFiles(); nu.open(bytes, name, id); const ok = nu.start(nu.defaultSubsong); nu.close(); return ok; } catch { return false; }
}

const flat = (name: string): string => name.replace(/[\\/]/g, '_');

/** The server rate-limits downloads (429): wait and retry. */
async function download(path: string): Promise<Uint8Array | null> {
  const local = join(ROOT, OUT, flat(path.split('/').pop()!));
  if (existsSync(local)) return new Uint8Array(readFileSync(local));
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(`${SERVER}/download?path=${encodeURIComponent(path)}`);
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 8000)); continue; }
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  return null;
}

async function search(q: string, extra = ''): Promise<Hit[]> {
  const r = await fetch(`${SERVER}/search?q=${encodeURIComponent(q)}&limit=100${extra}`);
  if (!r.ok) return [];
  return ((await r.json()) as { results: Hit[] }).results;
}

async function main(): Promise<void> {
  const only = process.argv[2]?.split(',');
  const nu = await NuadeHeadless.create();
  const rows = NUADE_FORMAT_LIST.filter((f) => f.corpus.length === 0 && (!only || only.includes(f.id)));
  const found: Record<string, string[]> = {};
  for (const row of rows) {
    const got: string[] = [];
    let tries = 0;
    const seen = new Set<string>();
    for (const ext of row.extensions) {
      if (got.length >= WANT) break;
      // Modland names most Amiga formats by suffix ("x.ext") or by prefix ("ext.x"): the query matches either spelling.
      for (const q of [`.${ext}`, `${ext}.`]) {
        if (got.length >= WANT) break;
        for (const hit of await search(q)) {
          if (got.length >= WANT) break;
          if (seen.has(hit.full_path)) continue;
          seen.add(hit.full_path);
          const name = hit.filename.toLowerCase();
          if (!(name.endsWith(`.${ext}`) || name.startsWith(`${ext}.`))) continue;
          if (++tries > MAX_TRIES) break;
          const bytes = await download(hit.full_path);
          if (!bytes) continue;
          if (bytes.length > MAX_BYTES || bytes.length < 64) continue;
          if (!accepts(nu, row.id, bytes, hit.filename)) continue;
          const rel = `${OUT}/${flat(hit.filename)}`;
          if (!existsSync(join(ROOT, rel))) writeFileSync(join(ROOT, rel), bytes);
          got.push(rel);
        }
      }
    }
    for (const hit of got.length < WANT && MODLAND_FORMAT[row.id] ? await search('', `&format=${encodeURIComponent(MODLAND_FORMAT[row.id]!)}`) : []) {
      if (got.length >= WANT || ++tries > MAX_TRIES) break;
      const bytes = await download(hit.full_path);
          if (!bytes) continue;
      if (bytes.length > MAX_BYTES || bytes.length < 64 || !accepts(nu, row.id, bytes, hit.filename)) continue;
      const rel = `${OUT}/${flat(hit.filename)}`;
      if (!existsSync(join(ROOT, rel))) writeFileSync(join(ROOT, rel), bytes);
      got.push(rel);
    }
    found[row.id] = got;
    console.log(`${row.id.padEnd(24)} ${got.length ? got.join(' | ') : 'NONE'}`);
  }
  // Rewrite `corpus: []` of each row that found something.
  const file = join(ROOT, 'src/engine/nuade/nuadeFormats.ts');
  let text = readFileSync(file, 'utf8');
  for (const [id, paths] of Object.entries(found)) {
    if (!paths.length) continue;
    const re = new RegExp(`(\\n  ${id}: row\\(\\{[^\\n]*?corpus: )\\[\\]`);
    if (!re.test(text)) throw new Error(`no empty corpus for ${id}`);
    text = text.replace(re, `$1${JSON.stringify(paths).replace(/"/g, "'")}`);
  }
  writeFileSync(file, text);
}
void main();
