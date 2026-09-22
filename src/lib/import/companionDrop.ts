/**
 * Which of the files in a folder drop are the module's companions.
 *
 * A folder drop hands over every file in the folder. Registering them all
 * "worked" — the player only opens what it asks for — but a folder of eight
 * SynthPack tunes pushed seven other songs into the WASM filesystem beside
 * the one `smp.set` that mattered. The resolver picks; the rest stay out.
 *
 * When the resolver names nothing but files were dropped, everything is kept
 * as before: the user chose those files, and a format the rules do not know
 * must not lose the samples it came with.
 */

import { companionRelativeName } from './companionRelativeName';
import { listingFromRelativePaths, resolveCompanions } from './companionResolver';

export interface PickedCompanions {
  /** The files to register, keyed by the relative name the replayer opens. */
  files: Array<{ key: string; file: File }>;
  /** True when the resolver named nothing and every dropped file was kept. */
  keptAll: boolean;
}

export function pickCompanionsFromDrop(mainFile: File, dropped: File[]): PickedCompanions {
  const named = dropped.map(file => ({ key: companionRelativeName(mainFile, file), file }));
  const listing = listingFromRelativePaths(named.map(n => n.key));
  const resolved = resolveCompanions(mainFile.name, listing);
  if (resolved.companions.length === 0) {
    return { files: named, keptAll: named.length > 0 };
  }
  const wanted = new Map(resolved.companions.map(c => [c.toLowerCase(), c]));
  const files = named
    .filter(n => wanted.has(n.key.toLowerCase()))
    .map(n => ({ key: wanted.get(n.key.toLowerCase()) ?? n.key, file: n.file }));
  return { files, keptAll: false };
}
