/**
 * Corpus finder: for every nuade player, up to three songs under public/data/songs that the player's own probe accepts
 * (and whose extension or prefix the player lists). Prints JSON { playerId: [relative path, ...] }.
 *   npx tsx tools/nuade/findCorpus.ts [outFile]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';

const ROOT = join(import.meta.dirname, '../..');
const SONGS = join(ROOT, 'public/data/songs');
const MAX_PER_PLAYER = 3;
const MAX_BYTES = 3 * 1024 * 1024;

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const nu = await NuadeHeadless.create();
const found: Record<string, string[]> = {};
// Songs in the flat `formats` directory first: they are the audited corpus.
const files = [...walk(SONGS)].sort((a, b) => Number(b.includes('/formats/')) - Number(a.includes('/formats/')) || a.localeCompare(b));
for (const file of files) {
  if (statSync(file).size > MAX_BYTES) continue;
  const name = file.slice(file.lastIndexOf('/') + 1);
  const bytes = readFileSync(file);
  const ids = nu.playerIds().filter((id) => (found[id]?.length ?? 0) < MAX_PER_PLAYER);
  if (ids.length === 0) break;
  for (const id of ids) if (nu.probeWith(id, bytes, name) === 0) (found[id] ??= []).push(relative(ROOT, file));
  
}
writeFileSync(process.argv[2] ?? '/dev/stdout', JSON.stringify(found, null, 1));
