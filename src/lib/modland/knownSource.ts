/**
 * Files the app fetched from Modland itself: never a "rare find", whatever the hash database says about
 * this copy (it answered "no match" for corpus songs, so the contribution prompt fired on a file that came
 * from Modland). downloadModlandFile marks every file it fetches, so every Modland load path (the Modland
 * browser, the online search list, the DJ decks) is covered; the loader asks before prompting.
 *
 * Its own module, without imports: modlandApi marks, ModlandDetector asks, and ModlandDetector imports
 * modlandApi, so the set cannot live in either without a cycle.
 */
const knownSourceNames = new Set<string>();
export function markKnownSource(filename: string): void { knownSourceNames.add(filename.toLowerCase()); }
export function isKnownSource(filename: string): boolean { return knownSourceNames.has(filename.toLowerCase()); }
