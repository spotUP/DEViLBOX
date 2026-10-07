/**
 * importChoice - when does opening a song need a person's answer?
 *
 * Owner decision D1 (plan 2026-10-07-one-load-save-export-path, U2.3): an
 * interactive open (drop, file browser) shows the import dialog only when the
 * file carries a real choice, and opens directly otherwise. A dialog that only
 * says "Import" is a click that changes nothing.
 *
 * A real choice is: several subsongs to pick from, a partner file the format
 * needs that was not provided, or a format whose own dialog collects settings
 * (Furnace subsong, MIDI quantise and pattern length).
 */
import { detectNativeFormat } from '@lib/import/prepareModuleImport';
import { expectedCompanionNames } from '@lib/import/companionResolver';
import type { PreparedSong } from '@/lib/song/openSong';

/** Formats whose song needs an external Instruments/ or Samples/ folder beside it. */
const MULTI_FILE_FORMAT_KEYS: ReadonlySet<string> = new Set(['iffSmus', 'zoundMonitor']);

/** Files that have a dialog of their own because they take settings. */
const OWN_DIALOG = /\.(fur|dmf|mid|midi)$/i;

/** The names a module expects beside it, from the one companion resolver (bob4e.dum -> bob4e.ins). */
export function expectedCompanion(filename: string): { names: string[]; description: string } | null {
  const basename = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const names = expectedCompanionNames(basename);
  if (names.length === 0) return null;
  return { names, description: names.join(' or ') };
}

/** The format needs partner files and none are in hand. */
export function needsCompanionPrompt(filename: string, companionCount: number): boolean {
  if (companionCount > 0) return false;
  const nativeFmt = detectNativeFormat(filename.toLowerCase());
  return (nativeFmt !== null && MULTI_FILE_FORMAT_KEYS.has(nativeFmt.key)) || expectedCompanion(filename) !== null;
}

/** The D1 rule: does this prepared song need the import dialog? */
export function needsImportChoice(p: Pick<PreparedSong, 'file' | 'songKind' | 'companions' | 'uadeMetadata' | 'sidInfo'>): boolean {
  if (OWN_DIALOG.test(p.file.name)) return true;
  if (p.songKind !== 'module') return false;
  if ((p.uadeMetadata?.subsongCount ?? 0) > 1) return true;
  if ((p.sidInfo?.subsongs ?? 0) > 1) return true;
  return needsCompanionPrompt(p.file.name, p.companions?.size ?? 0);
}
