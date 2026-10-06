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
export function setGridBaseline(b: GridBaseline | null): void { current = b; restoredEditsPending = false; }
export function getGridBaseline(): GridBaseline | null { return current; }

/**
 * A restore that decoded the stored module again brought back the original
 * bytes, so an engine that plays them (UADE chip RAM, eagleplayer runner ...)
 * plays the song without the user's edits until they are sent again. Set by
 * the restore, cleared by the next song entering through applySong and taken
 * by the first engine start (restoredEdits.ts).
 */
let restoredEditsPending = false;
export function setRestoredEditsPending(v: boolean): void { restoredEditsPending = v; }

/** The cells of `patterns` that differ from the baseline, once per restore; [] when nothing is pending. */
export function takeRestoredEdits(patterns: readonly Pattern[]): { pattern: number; row: number; channel: number; cell: TrackerCell }[] {
  const baseline = current;
  if (!restoredEditsPending || !baseline) return [];
  restoredEditsPending = false;
  const edits: { pattern: number; row: number; channel: number; cell: TrackerCell }[] = [];
  patterns.forEach((p, pi) => {
    let flat = 0;
    p.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      if (hashCell(cell) !== baseline[pi]?.[flat++]) edits.push({ pattern: pi, row: r, channel: c, cell });
    }));
  });
  return edits;
}
