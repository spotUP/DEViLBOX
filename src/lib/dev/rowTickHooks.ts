/**
 * Per-row hooks the transport fires, late-bound.
 *
 * `useTransportStore.setCurrentRow` reached for three things on every row —
 * the dub lane player, the dub effect scanner and the editor/cursor stores —
 * through `require()`, with a comment calling it "the file's pattern for
 * avoiding circular imports at startup".
 *
 * `require` does not exist in an ESM browser bundle. Every one of those calls
 * threw a ReferenceError on the first row and was swallowed by the catch beside
 * it, so all three had never run in the browser at all: lane events never
 * fired, `Z00` typed into a cell did nothing, and the edit cursor never
 * followed the play head — reported 2026-09-21 as "the pattern scroll is
 * frozen". A silent catch around a call that cannot succeed is indistinguishable
 * from a feature nobody wired.
 *
 * The cycle the `require` was avoiding is real, so this is a leaf with no
 * imports, in the shape `storeAccess.ts` already uses: the engine modules
 * register their hook when they load, and the transport calls whatever is
 * registered. A hook that never registers is simply absent, which is the
 * behaviour the old catch was pretending to have.
 */

export type RowHook = (row: number) => void;

const _hooks = new Map<string, RowHook>();

/** Register a per-row hook. Replaces any hook already under this name. */
export function registerRowHook(name: string, hook: RowHook): void {
  _hooks.set(name, hook);
}

export function unregisterRowHook(name: string): void {
  _hooks.delete(name);
}

/** Names of the hooks currently registered, for diagnostics and tests. */
export function registeredRowHooks(): string[] {
  return Array.from(_hooks.keys()).sort();
}

/**
 * Fire every registered hook for `row`.
 *
 * One hook throwing must not stop the others or the transport: this runs on
 * every row of playback. The error is logged once per hook rather than
 * swallowed, because silence here is what hid the fault for months.
 */
const _reported = new Set<string>();
export function fireRowHooks(row: number): void {
  for (const [name, hook] of _hooks) {
    try {
      hook(row);
    } catch (err) {
      if (!_reported.has(name)) {
        _reported.add(name);
        console.error(`[rowHooks] ${name} failed on row ${row}:`, err);
      }
    }
  }
}

/** Test seam. */
export function clearRowHooks(): void {
  _hooks.clear();
  _reported.clear();
}
