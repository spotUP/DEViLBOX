/**
 * Live edit sync for a composed Neo Geo song playing on the C++ sequencer from a derived native.
 *
 * The derived native is a snapshot taken at Play. This file decides how an edit made while it
 * plays reaches the sequencer. It never sequences: the cell conversion is the exporter's own
 * `cellToFile` (tracker Cxx to the volume column, instrument id to file index), so a live edit
 * and a fresh derive of the edited song hand the sequencer the same value.
 *
 * Routing:
 *  (a) cell edit            -> seqSetCell for all 19 columns of the cell (+ seqSetEffectCols when a column opens)
 *  (b) order list, same length -> seqSetOrder for each changed position on every channel
 *      order list length changed -> re-derive and reload (the sequencer's orders length is fixed at load)
 *  (c) pattern added         -> nothing until it is placed in the order (cells arrive as (a), the sequencer allocates lazily)
 *      pattern length changed -> re-derive and reload (one pattern length per song, fixed at load)
 *  (d) instrument parameter  -> re-derive INS2, loadIns2 for each changed slot (+ forceIns)
 *      instrument set changed -> re-derive and reload (file indices shift)
 */
import type { TrackerCell, ChannelData } from '@/types/tracker';
import { cellToFile, FILE_NOTE_OFF, NEO_GEO_SYNTH_TYPE, type FurnaceModuleSong } from '@/lib/export/FurnaceModuleExporter';
import { effectNotationOf } from '@/lib/tracker/effectNotation';

/** One write for the sequencer: FurnaceDispatchEngine.seqSetCell(ch, pat, row, col, val). */
export interface SeqCellWrite { ch: number; pat: number; row: number; col: number; val: number }

export interface DerivedCellSync {
  writes: SeqCellWrite[];
  /** Effect columns the cell needs open on its channel. */
  effectCols: number;
  problems: string[];
}

/** Sequencer note value of a file note: file notes are native + 60, note off passes as 253. */
function seqNoteOfFile(note: number): number {
  if (note < 0) return -1;
  return note === FILE_NOTE_OFF ? 253 : note;
}

/**
 * The sequencer writes for one store cell. Every column is written, empty ones as -1, so a
 * cleared or replaced value cannot leave an old one behind. Store pattern index = Furnace
 * pattern index and store channel = Furnace channel (the exporter writes them that way).
 */
export function derivedCellSeqWrites(
  cell: TrackerCell,
  channelMeta: ChannelData['channelMeta'],
  instrumentIds: readonly number[],
  ch: number,
  pat: number,
  row: number,
): DerivedCellSync {
  const insIndexById = new Map<number, number>();
  instrumentIds.forEach((id, i) => insIndexById.set(id, i));
  const problems: string[] = [];
  const f = cellToFile(cell, insIndexById, `pattern ${pat} channel ${ch + 1} row ${row}`, problems, effectNotationOf(channelMeta));
  const writes: SeqCellWrite[] = [];
  const put = (col: number, val: number) => writes.push({ ch, pat, row, col, val });
  put(0, seqNoteOfFile(f.note));
  put(1, f.ins);
  put(2, f.vol);
  let effectCols = 1;
  f.fx.forEach((e, k) => {
    put(3 + k * 2, e.type);
    put(4 + k * 2, e.val);
    if (e.type >= 0 || e.val >= 0) effectCols = Math.max(effectCols, k + 1);
  });
  return { writes, effectCols, problems };
}

/** What the running sequencer was loaded from, for deciding how a later edit reaches it. */
export interface DerivedPlayState {
  instrumentIds: number[];
  patLen: number;
  /** Pattern index per order position. */
  order: number[];
  /** Instrument config object per store id: a changed reference is a changed parameter. */
  insConfig: Map<number, unknown>;
}

export function derivedPlayState(
  song: Pick<FurnaceModuleSong, 'patterns' | 'songPositions' | 'instruments'>,
  instrumentIds: readonly number[],
): DerivedPlayState {
  const insConfig = new Map<number, unknown>();
  for (const i of song.instruments) insConfig.set(i.id, i.furnace);
  return {
    instrumentIds: [...instrumentIds],
    patLen: Math.max(1, ...song.patterns.map((p) => p.length)),
    order: [...song.songPositions],
    insConfig,
  };
}

export interface StructuralPlan {
  /** Non-null: the edit cannot be patched in place; re-derive the whole native and reload it. */
  rederive: string | null;
  /** (b) same-length order change: positions to rewrite, applied to every channel. */
  orderWrites: Array<{ pos: number; pat: number }>;
  /** (d) store ids of instruments whose parameters changed. */
  changedInstrumentIds: number[];
}

export function planStructuralEdit(before: DerivedPlayState, now: DerivedPlayState): StructuralPlan {
  const plan: StructuralPlan = { rederive: null, orderWrites: [], changedInstrumentIds: [] };
  if (before.instrumentIds.join() !== now.instrumentIds.join()) {
    plan.rederive = 'instrument set changed';
    return plan;
  }
  if (before.patLen !== now.patLen) {
    plan.rederive = 'pattern length changed';
    return plan;
  }
  if (before.order.length !== now.order.length) {
    plan.rederive = 'order list length changed';
    return plan;
  }
  now.order.forEach((pat, pos) => { if (before.order[pos] !== pat) plan.orderWrites.push({ pos, pat }); });
  for (const id of now.instrumentIds) {
    if (before.insConfig.get(id) !== now.insConfig.get(id)) plan.changedInstrumentIds.push(id);
  }
  return plan;
}

export function isStructuralNoop(plan: StructuralPlan): boolean {
  return plan.rederive === null && plan.orderWrites.length === 0 && plan.changedInstrumentIds.length === 0;
}


/** Store ids of the Neo Geo voices in song order: native instrument index to store id (as deriveFurnaceNative returns it). */
export function neoGeoInstrumentIds(instruments: readonly { id: number; synthType?: string; furnace?: unknown }[]): number[] {
  return instruments.filter((i) => i.synthType === NEO_GEO_SYNTH_TYPE && !!i.furnace).map((i) => i.id);
}
