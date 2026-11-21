import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { listingFromRelativePaths, resolveCompanions, type CompanionListing } from '../../src/lib/import/companionResolver';

/** A song directory listed one level deep, so `Instruments/*` (Sonix) and `instr/*.x` reach the resolver. */
export function listingFromDir(dir: string): CompanionListing {
  const rel = readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? readdirSync(join(dir, e.name)).map((f) => `${e.name}/${f}`) : [e.name]);
  return listingFromRelativePaths(rel);
}

/** Every companion the resolver wants for `filename` in `dir`, read from disk. A companion registered under the
 *  name the player asks for (`dawnpatrol-sad.SSD`) is read from the file it maps to (`mdtest.ssd`). */
export function companionFilesFromDir(dir: string, filename: string): { name: string; data: Buffer }[] {
  const { companions, sources } = resolveCompanions(filename, listingFromDir(dir));
  return companions.map((name) => ({ name, data: readFileSync(join(dir, sources[name] ?? name)) }));
}
