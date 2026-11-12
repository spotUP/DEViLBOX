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
  let h = FNV_BASIS;
  for (const k of keys) {
    const v = (cell as unknown as Record<string, unknown>)[k];
    if (v === undefined) continue;
    h = fnvAdd(h, `${k}=${String(v)};`);
  }
  return h >>> 0;
}

const FNV_BASIS = 0x811c9dc5;
function fnvAdd(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const EXTRA_FIELDS = ['note', 'instrument', 'volume', 'delay'] as const;

/**
 * FNV-1a over the cell's further note columns (extraNotes) only; hashCell leaves them out and its
 * stored values must not change. Fields in a fixed order, undefined fields skipped, so an absent
 * extraNotes, an empty one and columns holding nothing all hash alike.
 */
export function hashExtraNotes(cell: TrackerCell): number {
  let h = FNV_BASIS;
  cell.extraNotes?.forEach((col, i) => {
    for (const f of EXTRA_FIELDS) {
      const v = col[f];
      if (v !== undefined) h = fnvAdd(h, `${i}.${f}=${v};`);
    }
  });
  return h >>> 0;
}

export function baselineOf(patterns: readonly Pattern[]): GridBaseline {
  return patterns.map((p) => p.channels.flatMap((ch) => ch.rows.map(hashCell)));
}

/** Same indexing as baselineOf, hashing the further note columns (hashExtraNotes). */
export function extraBaselineOf(patterns: readonly Pattern[]): GridBaseline {
  return patterns.map((p) => p.channels.flatMap((ch) => ch.rows.map(hashExtraNotes)));
}

/**
 * Whether a cell differs from its baseline hashes. `extra` is null for a song saved before the
 * further note columns were hashed: those columns then count as unchanged.
 */
export function cellIsEdited(cell: TrackerCell, base: number | undefined, extra: number | undefined, hasExtra: boolean): boolean {
  return hashCell(cell) !== base || (hasExtra && hashExtraNotes(cell) !== extra);
}

let current: GridBaseline | null = null;
/** Hashes of the further note columns (gridBaselineExtra); null = a save from before they were hashed. */
let currentExtra: GridBaseline | null = null;

/**
 * A sample's loop or data changed since the load (sampleEdit.ts). An engine that holds its own
 * copy of the module plays the loaded bytes until it is given the edited ones, whatever the grid says.
 */
let samplesEdited = false;
export function markSampleEdited(): void { samplesEdited = true; }
export function sampleIsEdited(): boolean { return samplesEdited; }

/** null = unknown (a project saved before baselines existed): it is never re-decoded. */
export function setGridBaseline(b: GridBaseline | null, extra: GridBaseline | null = null): void { current = b; currentExtra = b ? extra : null; restoredEditsPending = false; samplesEdited = false; }
export function getGridBaseline(): GridBaseline | null { return current; }
export function getGridBaselineExtra(): GridBaseline | null { return currentExtra; }

/**
 * A restore that decoded the stored module again brought back the original
 * bytes, so an engine that plays them (UADE chip RAM, eagleplayer runner ...)
 * plays the song without the user's edits until they are sent again. Set by
 * the restore, cleared by the next song entering through applySong and taken
 * by the first engine start (restoredEdits.ts).
 */
let restoredEditsPending = false;
export function setRestoredEditsPending(v: boolean): void { restoredEditsPending = v; }

/** The cells of `patterns` that differ from the baseline (every call; nothing is consumed). [] when no baseline is known. */
export function editedCells(patterns: readonly Pattern[]): { pattern: number; row: number; channel: number; cell: TrackerCell }[] {
  const baseline = current;
  if (!baseline) return [];
  const extra = currentExtra;
  const edits: { pattern: number; row: number; channel: number; cell: TrackerCell }[] = [];
  patterns.forEach((p, pi) => {
    let flat = 0;
    p.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      const i = flat++;
      if (cellIsEdited(cell, baseline[pi]?.[i], extra?.[pi]?.[i], !!extra)) edits.push({ pattern: pi, row: r, channel: c, cell });
    }));
  });
  return edits;
}

/** The cells of `patterns` that differ from the baseline, once per restore; [] when nothing is pending. */
export function takeRestoredEdits(patterns: readonly Pattern[]): { pattern: number; row: number; channel: number; cell: TrackerCell }[] {
  if (!restoredEditsPending || !current) return [];
  restoredEditsPending = false;
  return editedCells(patterns);
}

/**
 * Whether `patterns` differ from the baseline taken at load: any cell, or a changed pattern/channel/row
 * count. false when no baseline is known (a project saved before baselines existed).
 */
export function gridIsEdited(patterns: readonly Pattern[]): boolean {
  const baseline = current;
  if (!baseline) return false;
  const extra = currentExtra;
  if (patterns.length !== baseline.length) return true;
  return patterns.some((p, pi) => {
    const flat = p.channels.flatMap((ch) => ch.rows);
    return flat.length !== baseline[pi].length || flat.some((cell, i) => cellIsEdited(cell, baseline[pi][i], extra?.[pi]?.[i], !!extra));
  });
}
