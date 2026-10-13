/**
 * The one resolver for the per-format engine choice (plan D7). The import route, the DJ pipeline, the UI and the MCP
 * all ask here; nobody reads `formatEngine[key]` for a key of the nuade table directly.
 *
 *   explicit choice in the settings store   >   the row's defaultEngine (measured, or what plays today)
 *
 * The store holds only explicit choices for these keys. Rows of one key must agree on the default (checked by the
 * table test), so a key resolves to one engine whichever of its players a song uses.
 */
import type { FormatEngineChoice, FormatEnginePreferences } from '@/types/formatEngine';
import { NUADE_FORMAT_LIST, nuadeFormatsByPrefKey, type NuadeFormat } from './nuadeFormats';
import { nuadeProbe, type NuadeProbe } from './nuadeProbe';

export type FormatEngineMap = Partial<Record<string, FormatEngineChoice>>;

/** Every preference key of the table. */
export const NUADE_PREF_KEYS: readonly string[] = Array.from(new Set(NUADE_FORMAT_LIST.map((f) => f.prefKey)));

/**
 * The stored values a row can honour: replace rows play on UADE (stored as their legacy engine) or nuade; dual rows on
 * all three. Anything else in the store (a value from an older build, or a hand edit) is not a choice of this row.
 */
export function honourableChoices(row: NuadeFormat): FormatEngineChoice[] {
  return row.role === 'dual' ? ['native', 'uade', 'nuade'] : [row.legacyEngine, 'nuade'];
}

/** The explicit stored choice of `key` when its row can honour it, else undefined (the table default applies). */
export function explicitFormatEngine(prefs: FormatEngineMap | FormatEnginePreferences, key: string): FormatEngineChoice | undefined {
  const stored = (prefs as FormatEngineMap)[key];
  const row = nuadeFormatsByPrefKey(key)[0];
  if (!stored) return undefined;
  return row && !honourableChoices(row).includes(stored) ? undefined : stored; // a key the table does not own keeps its stored value
}

/** The choice for `key`: the explicit one the row can honour, else the table's default; undefined for a key the table does not own. */
export function effectiveFormatEngine(prefs: FormatEngineMap | FormatEnginePreferences, key: string): FormatEngineChoice | undefined {
  return explicitFormatEngine(prefs, key) ?? nuadeFormatsByPrefKey(key)[0]?.defaultEngine;
}

/**
 * The choices the engines a row can play on: replace rows have no engine of ours (UADE or nuade), dual rows have all
 * three. 'uade' on a replace row means what plays today (its legacyEngine), so the route keeps its behaviour.
 */
export function engineChoicesFor(row: NuadeFormat): FormatEngineChoice[] {
  return row.role === 'dual' ? ['native', 'uade', 'nuade'] : ['uade', 'nuade'];
}

/** The value the store keeps for a choice on a row: a replace row's 'uade' is its legacy engine. */
export function storedChoiceFor(row: NuadeFormat, choice: FormatEngineChoice): FormatEngineChoice {
  return row.role === 'replace' && choice === 'uade' ? row.legacyEngine : choice;
}

/** The option a row's effective stored value shows as (the inverse of storedChoiceFor). */
export function displayChoiceFor(row: NuadeFormat, effective: FormatEngineChoice): FormatEngineChoice {
  return row.role === 'replace' && effective === 'native' ? 'uade' : effective;
}

/**
 * The preferences the existing parser routes read: every key of the table filled with its effective value, with
 * 'nuade' shown as 'native' (our parser draws the grid; the playback is switched to nuade afterwards, applyNuadeChoice).
 */
export function resolvedFormatEngines(prefs: FormatEnginePreferences): FormatEnginePreferences {
  const out = { ...prefs } as unknown as Record<string, FormatEngineChoice | undefined>;
  for (const key of NUADE_PREF_KEYS) {
    const e = effectiveFormatEngine(prefs, key);
    out[key] = e === 'nuade' ? 'native' : e;
  }
  return out as unknown as FormatEnginePreferences;
}

/** The file's extension and its UADE-style prefix (`mc.song` -> mc), lower case. */
function fileTags(filename: string): string[] {
  const name = filename.toLowerCase().slice(filename.lastIndexOf('/') + 1);
  const first = name.indexOf('.');
  const last = name.lastIndexOf('.');
  return first < 0 ? [] : Array.from(new Set([name.slice(0, first), name.slice(last + 1)]));
}

/**
 * The row that plays this file on nuade, or null: only rows whose choice is 'nuade' are considered, matched by the
 * router's registry key or by the extension / prefix the player lists, and a name match is confirmed by the player's
 * own probe (Supported, or Unsure when nothing else disputes it). Rows whose choice is not nuade cost nothing.
 */
export async function nuadeRowFor(
  filename: string,
  bytes: Uint8Array,
  prefs: FormatEngineMap | FormatEnginePreferences,
  registryKey?: string | null,
  probe: NuadeProbe = nuadeProbe(),
): Promise<NuadeFormat | null> {
  const wanted = NUADE_FORMAT_LIST.filter((f) => (effectiveFormatEngine(prefs, f.prefKey) ?? f.defaultEngine) === 'nuade');
  if (wanted.length === 0) return null;
  const tags = fileTags(filename);
  const byKey = registryKey ? wanted.filter((f) => f.registryKeys.includes(registryKey)) : [];
  const byName = wanted.filter((f) => f.extensions.some((e) => tags.includes(e)));
  const candidates = Array.from(new Set([...byKey, ...byName]));
  let unsure: NuadeFormat | null = null;
  for (const row of candidates) {
    const verdict = await probe(row.id, bytes, filename);
    if (verdict === 0) return row;
    if (verdict === 2 && !unsure) unsure = row;
  }
  return unsure;
}

/** The nuade player that plays this file when its format's choice is 'nuade', else null. */
export async function nuadePlayerFor(filename: string, bytes: Uint8Array, prefs: FormatEngineMap | FormatEnginePreferences, registryKey?: string | null, probe?: NuadeProbe): Promise<string | null> {
  return (await nuadeRowFor(filename, bytes, prefs, registryKey, probe))?.id ?? null;
}

/** Settings v14: the store keeps only explicit choices for the table's keys, so persisted defaults are dropped. */
export function dropPersistedNuadeDefaults(formatEngine: Record<string, unknown> | undefined): void {
  if (!formatEngine) return;
  for (const key of NUADE_PREF_KEYS) delete formatEngine[key];
}
