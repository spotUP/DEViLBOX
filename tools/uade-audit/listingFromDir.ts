import { readdirSync } from 'fs';
import { join } from 'path';
import { listingFromRelativePaths, type CompanionListing } from '../../src/lib/import/companionResolver';

/** A song directory listed one level deep, so `Instruments/*` (Sonix) and `instr/*.x` reach the resolver. */
export function listingFromDir(dir: string): CompanionListing {
  const rel = readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? readdirSync(join(dir, e.name)).map((f) => `${e.name}/${f}`) : [e.name]);
  return listingFromRelativePaths(rel);
}
