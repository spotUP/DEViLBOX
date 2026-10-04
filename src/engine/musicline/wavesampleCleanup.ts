/**
 * MusicLine wavesample cleanup: the plan behind "Remove Unused Wavesamples"
 * and "Merge Equal Wavesamples" (ledger F35).
 *
 * In DEViLBOX a MusicLine instrument carries its INST parameters and its SMPL
 * data as one InstrumentConfig, and the .ml exporter writes one INST+SMPL pair
 * per instrument, numbered by position. A wavesample is therefore removed by
 * removing its instrument and renumbering the rest, and two wavesamples are
 * equal when the bytes the exporter would write for them are equal, so
 * merging them changes no sound and loses no parameter.
 *
 * Pure: plans are computed from pattern and instrument data; the stores apply
 * them.
 */
import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import { findUsedInstruments } from '@/lib/analysis/SongCleanupAnalyzer';

export interface WavesampleCleanupPlan {
  /** Instrument ids to remove; empty when there is nothing to do. */
  removeIds: number[];
  /** Every instrument id a cell may carry, to its new 1-based id. */
  idMap: Map<number, number>;
}

const NOTHING: WavesampleCleanupPlan = { removeIds: [], idMap: new Map() };

/**
 * Survivors keep their order and take ids 1..N; a removed duplicate maps to
 * its keeper's new id. Never removes every instrument.
 */
function planFor(instruments: InstrumentConfig[], remove: Map<number, number | null>): WavesampleCleanupPlan {
  if (remove.size === 0 || remove.size >= instruments.length) return NOTHING;
  const idMap = new Map<number, number>();
  let next = 1;
  for (const inst of instruments) if (!remove.has(inst.id)) idMap.set(inst.id, next++);
  for (const [id, keeper] of remove) {
    const kept = keeper === null ? undefined : idMap.get(keeper);
    if (kept !== undefined) idMap.set(id, kept);
  }
  return { removeIds: [...remove.keys()], idMap };
}

/** Instruments no cell references, in any instrument column. */
export function planUnusedWavesampleRemoval(patterns: Pattern[], instruments: InstrumentConfig[]): WavesampleCleanupPlan {
  const used = findUsedInstruments(patterns);
  const remove = new Map<number, number | null>();
  for (const inst of instruments) if (inst.id > 0 && !used.has(inst.id)) remove.set(inst.id, null);
  return planFor(instruments, remove);
}

function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Instruments whose `bytesOf` is byte-equal to an earlier instrument's; the
 * earlier one keeps the cells. The hash only buckets; equality is the bytes.
 */
export function planEqualWavesampleMerge(instruments: InstrumentConfig[], bytesOf: (inst: InstrumentConfig) => Uint8Array): WavesampleCleanupPlan {
  const buckets = new Map<number, { id: number; bytes: Uint8Array }[]>();
  const remove = new Map<number, number | null>();
  for (const inst of instruments) {
    if (inst.id <= 0) continue;
    const bytes = bytesOf(inst);
    const bucket = buckets.get(fnv1a(bytes)) ?? [];
    const keeper = bucket.find((e) => bytesEqual(e.bytes, bytes));
    if (keeper) remove.set(inst.id, keeper.id);
    else { bucket.push({ id: inst.id, bytes }); buckets.set(fnv1a(bytes), bucket); }
  }
  return planFor(instruments, remove);
}

/** Rewrite every instrument column through the map; returns the cells changed. */
export function applyWavesampleIdMap(patterns: Pattern[], idMap: Map<number, number>): number {
  let changed = 0;
  const map = (v: number | undefined | null): number | undefined => {
    if (v == null || v <= 0) return undefined;
    const n = idMap.get(v);
    return n !== undefined && n !== v ? n : undefined;
  };
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        let n = map(cell.instrument); if (n !== undefined) { cell.instrument = n; changed++; }
        n = map(cell.instrument2); if (n !== undefined) { cell.instrument2 = n; changed++; }
        n = map(cell.instrument3); if (n !== undefined) { cell.instrument3 = n; changed++; }
        n = map(cell.instrument4); if (n !== undefined) { cell.instrument4 = n; changed++; }
      }
    }
  }
  return changed;
}
