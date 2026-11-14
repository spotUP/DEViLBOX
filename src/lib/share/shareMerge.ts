/**
 * Three-way merge of a shared song: base (the immutable share), mine (the author's current song)
 * and theirs (a reply). Pure: no stores. One rule everywhere (pick3): if one side left the base
 * value alone take the other side; if both made the same change take it; otherwise it is a conflict.
 *
 * Units: a pattern cell, the order list (whole), an instrument (whole, its samples with it).
 */
import type { Pattern, TrackerCell } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';

export interface MergeSong {
  patterns: Pattern[];
  order: number[];
  instruments: InstrumentConfig[];
}

export type ConflictKey =
  | { kind: 'cell'; pattern: number; channel: number; row: number }
  | { kind: 'order' }
  | { kind: 'instrument'; id: number };

export interface MergeConflict {
  /** Stable text form of the key, used to pick a side. */
  key: string;
  at: ConflictKey;
  label: string;
}

export type Side = 'mine' | 'theirs';

export interface MergeResult {
  merged: MergeSong;
  conflicts: MergeConflict[];
  /** Changes taken from theirs without a clash (cells, order, instruments). */
  appliedFromTheirs: number;
}

const sortKeys = (_k: string, v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    : v;
const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a, sortKeys) === JSON.stringify(b, sortKeys);

type Pick3<T> = { value: T; conflict: boolean; fromTheirs: boolean };

function pick3<T>(base: T, mine: T, theirs: T): Pick3<T> {
  if (same(mine, theirs)) return { value: mine, conflict: false, fromTheirs: false };
  if (same(base, mine)) return { value: theirs, conflict: false, fromTheirs: true };
  if (same(base, theirs)) return { value: mine, conflict: false, fromTheirs: false };
  return { value: mine, conflict: true, fromTheirs: false };
}

export const conflictKeyText = (k: ConflictKey): string =>
  k.kind === 'cell' ? `cell:${k.pattern}:${k.channel}:${k.row}` : k.kind === 'order' ? 'order' : `instrument:${k.id}`;

/**
 * Merge. `picks` settles conflicts by key text; an unpicked conflict keeps mine.
 * shortcut: a pattern is matched by index. Patterns only theirs added are appended at their index
 * when mine has no pattern there; when both added at the same index, mine stays. Upgrade if reply
 * authors need to insert patterns while the author does too.
 */
export function mergeSongs(base: MergeSong, mine: MergeSong, theirs: MergeSong, picks: ReadonlyMap<string, Side> = new Map()): MergeResult {
  const conflicts: MergeConflict[] = [];
  let appliedFromTheirs = 0;
  const settle = <T,>(at: ConflictKey, label: string, b: T, m: T, t: T): T => {
    const r = pick3(b, m, t);
    const key = conflictKeyText(at);
    if (r.conflict) {
      conflicts.push({ key, at, label });
      return picks.get(key) === 'theirs' ? t : m;
    }
    if (r.fromTheirs) appliedFromTheirs++;
    return r.value;
  };

  const patterns: Pattern[] = mine.patterns.map((mp, pi) => {
    const bp = base.patterns[pi];
    const tp = theirs.patterns[pi];
    if (!tp) return mp;
    const length = pick3(bp?.length, mp.length, tp.length).value ?? mp.length;
    const channels = mp.channels.map((mc, ci) => {
      const rows: TrackerCell[] = [];
      for (let r = 0; r < length; r++) {
        const cell = settle<TrackerCell | undefined>(
          { kind: 'cell', pattern: pi, channel: ci, row: r },
          `Pattern ${pi}, channel ${ci + 1}, row ${r}`,
          bp?.channels[ci]?.rows[r], mc.rows[r], tp.channels[ci]?.rows[r],
        );
        if (cell) rows.push(cell);
      }
      return same(rows, mc.rows) ? mc : { ...mc, rows };
    });
    return channels.every((c, ci) => c === mp.channels[ci]) && length === mp.length ? mp : { ...mp, length, channels };
  });
  for (let pi = mine.patterns.length; pi < theirs.patterns.length; pi++) {
    if (pi >= base.patterns.length) { patterns.push(theirs.patterns[pi]); appliedFromTheirs++; }
  }

  const order = settle<number[]>({ kind: 'order' }, 'Pattern order', base.order, mine.order, theirs.order);

  const ids = [...new Set([...base.instruments, ...mine.instruments, ...theirs.instruments].map((i) => i.id))];
  const by = (list: InstrumentConfig[], id: number) => list.find((i) => i.id === id);
  const instruments: InstrumentConfig[] = [];
  for (const id of ids) {
    const chosen = settle<InstrumentConfig | undefined>({ kind: 'instrument', id }, `Instrument ${id}`, by(base.instruments, id), by(mine.instruments, id), by(theirs.instruments, id));
    if (chosen) instruments.push(chosen);
  }

  return { merged: { patterns, order, instruments }, conflicts, appliedFromTheirs };
}
