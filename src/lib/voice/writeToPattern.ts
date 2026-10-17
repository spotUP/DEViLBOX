/**
 * writeToPattern.ts - quantised notes to pattern cells, as ONE undo step.
 *
 * Goes through useTrackerStore.bulkBlockEdit (one history entry, one live
 * engine resync). Note encoding is lib/xmConversions.midiToXMNote, the same
 * function the sample editor's Audio to MIDI path uses. The commit functions
 * (voiceToNotes, drumToNotes) pick playable instruments before writing
 * (voiceInstruments.ts).
 */
import type { Pattern, TrackerCell } from '@typedefs';
import { effectNotationOf } from '@/lib/tracker/effectNotation';
import type { TrackerFormat } from '@/engine/TrackerReplayer';
import { getFormatConstraints } from '@/lib/import/formatConstraints';
import { midiToXMNote } from '@/lib/xmConversions';
import { useTrackerStore } from '@/stores/useTrackerStore';
import type { QuantisedNote } from './quantise';
import { ownCellEffects, voiceEffectSet, type EffectCommand, type VoiceEffect, type VoiceEffectSet } from './voiceEffects';

/** XM note-off */
export const NOTE_OFF = 97;

export interface WriteTarget {
  channelIndex: number;
  /** First pattern row the take's row 0 lands on */
  startRow: number;
  instrumentId: number;
}

/** Velocity 0..1 to the XM volume column (0x10..0x50). */
export function velocityToVolume(velocity: number): number {
  return 0x10 + Math.round(Math.max(0, Math.min(1, velocity)) * 64);
}

export interface WriteResult {
  written: number;
  /** Notes that fell outside the pattern */
  dropped: number;
}

export interface TakeCell {
  note: number;
  instrument: number;
  volume: number;
  /** Effect columns, first column first; at most the set's `maxColumns`. */
  effects: EffectCommand[];
}

/** The effect set a channel's cells are encoded with: its notation, capped by the song format's columns. */
export function channelEffectSet(pattern: Pattern, channel: Pattern['channels'][number]): VoiceEffectSet {
  const formatCols = getFormatConstraints((pattern.importMetadata?.sourceFormat as TrackerFormat | undefined) ?? 'XM').maxEffectCols;
  return voiceEffectSet(effectNotationOf(channel.channelMeta), Math.min(channel.channelMeta?.effectCols ?? 2, formatCols));
}

const DEFAULT_SET = voiceEffectSet('tracker', 2);

export interface TakeCells extends WriteResult {
  /** Pattern row of cells[0] */
  startRow: number;
  /** Every row from the start row to the pattern end; empty rows are all zero (the channel is cleared). */
  cells: TakeCell[];
}

/**
 * The cells a take writes on its channel: every row from `target.startRow` to
 * the pattern end, so a take replaces the channel and a shorter take leaves no
 * old notes behind its last note (owner decision 2026-10-17). The one place the
 * write rules live: the commit copies these cells and the pattern's live
 * preview draws them, so the preview shows exactly what a commit writes.
 */
export function takeCells(
  notes: readonly QuantisedNote[],
  target: WriteTarget,
  rowCount: number,
  set: VoiceEffectSet = DEFAULT_SET,
): TakeCells {
  const spanEnd = Math.max(target.startRow, rowCount);
  const out: TakeCells = { startRow: target.startRow, cells: [], written: 0, dropped: 0 };
  for (let r = target.startRow; r < spanEnd; r++) out.cells.push({ note: 0, instrument: 0, volume: 0, effects: [] });
  /** Effects per cell index, merged across notes before encoding. */
  const pending = new Map<number, VoiceEffect[]>();
  const addEffects = (index: number, effects: readonly VoiceEffect[]) => {
    if (effects.length === 0) return;
    pending.set(index, [...(pending.get(index) ?? []), ...effects]);
  };
  notes.forEach((n, k) => {
    const i = n.row;
    const xm = midiToXMNote(n.midi);
    if (target.startRow + i >= rowCount || !xm) {
      out.dropped++;
      return;
    }
    out.cells[i] = { note: xm, instrument: n.instrumentId ?? target.instrumentId, volume: velocityToVolume(n.velocity), effects: [] };
    out.written++;
    const off = i + n.lengthRows;
    if (n.noteOff !== false && off < out.cells.length && out.cells[off].note === 0) out.cells[off].note = NOTE_OFF;
    addEffects(i, ownCellEffects(n.effects));
    // Later cells of the note's span: up to the next note's row (the last note: its note-off), inside the pattern.
    const next = notes[k + 1];
    const spanLimit = Math.min(out.cells.length, next ? next.row : i + n.lengthRows + 1);
    for (const e of n.effects ?? []) {
      if (e.rowOffset <= 0) continue;
      const at = i + e.rowOffset;
      if (at >= spanLimit) continue;
      const cell = out.cells[at];
      // A tone-portamento target: the note the slide reaches, with no instrument (no retrigger).
      if (e.midi !== undefined && cell.note === 0) {
        const targetXm = midiToXMNote(e.midi);
        if (targetXm) cell.note = targetXm;
      }
      addEffects(at, [e]);
    }
  });
  for (const [index, effects] of pending) out.cells[index].effects = set.commands(effects);
  return out;
}

/** Pure part: mutate a pattern in place (replace semantics over the take's span). */
export function applyNotesToPattern(
  pattern: Pattern,
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): WriteResult {
  const channel = pattern.channels[target.channelIndex];
  if (!channel) return { written: 0, dropped: notes.length };
  const rows: TrackerCell[] = channel.rows;
  const take = takeCells(notes, target, rows.length, channelEffectSet(pattern, channel));
  take.cells.forEach((c, i) => {
    const cell = rows[take.startRow + i];
    cell.note = c.note;
    cell.instrument = c.instrument;
    cell.volume = c.volume;
    cell.effTyp = c.effects[0]?.effTyp ?? 0;
    cell.eff = c.effects[0]?.eff ?? 0;
    cell.effTyp2 = c.effects[1]?.effTyp ?? 0;
    cell.eff2 = c.effects[1]?.eff ?? 0;
  });
  return { written: take.written, dropped: take.dropped };
}

/** Store part: one undo step on the current pattern. */
export function writeNotesToPattern(
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): WriteResult {
  let result: WriteResult = { written: 0, dropped: 0 };
  useTrackerStore.getState().bulkBlockEdit('Voice to Notes', (pattern) => {
    result = applyNotesToPattern(pattern, notes, target);
  });
  return result;
}
