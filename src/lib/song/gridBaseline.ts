/**
 * The grid as the decoder produced it - what the user has NOT edited.
 *
 * A saved song carries its grid as the user left it, and the grid is the only
 * place a user edit lives (UADE formats write edits into chip RAM, the exporters
 * diff the grid against a fresh decode of the module bytes). To restore a song
 * through today's decoder without losing edits, restore has to tell an edited
 * cell from one the old decoder merely produced: one 32-bit hash per cell,
 * taken the moment the song was loaded, is enough (not the grid twice).
 *
 * Indexed [pattern][channel * rowCount + row]. Held outside the stores; every
 * song enters through applySong, which sets it, and snapshotSong saves it.
 */
import type { Pattern, TrackerCell } from '@/types/tracker';

export type GridBaseline = number[][];

/** FNV-1a over the cell's fields in a fixed order (key order of the object must not matter). */
export function hashCell(cell: TrackerCell): number {
  const keys = Object.keys(cell).sort();
  let h = 0x811c9dc5;
  for (const k of keys) {
    const v = (cell as unknown as Record<string, unknown>)[k];
    if (v === undefined) continue;
    const s = `${k}=${String(v)};`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}

export function baselineOf(patterns: readonly Pattern[]): GridBaseline {
  return patterns.map((p) => p.channels.flatMap((ch) => ch.rows.map(hashCell)));
}

let current: GridBaseline | null = null;

/** null = unknown (a project saved before baselines existed): it is never re-decoded. */
export function setGridBaseline(b: GridBaseline | null): void { current = b; }
export function getGridBaseline(): GridBaseline | null { return current; }
