/**
 * writeToPattern.ts - quantised notes to pattern cells, as ONE undo step.
 *
 * Goes through useTrackerStore.multiPatternEdit (one history entry over every
 * pattern the take reaches, one live engine resync per changed pattern). Note encoding is lib/xmConversions.midiToXMNote, the same
 * function the sample editor's Audio to MIDI path uses. The commit functions
 * (voiceToNotes, drumToNotes) pick playable instruments before writing
 * (voiceInstruments.ts).
 */
import { EMPTY_CELL, type Pattern, type TrackerCell } from '@typedefs';
import { effectNotationOf } from '@/lib/tracker/effectNotation';
import type { TrackerFormat } from '@/engine/TrackerReplayer';
import { getFormatConstraints } from '@/lib/import/formatConstraints';
import { midiToXMNote } from '@/lib/xmConversions';
import { getActiveFormatLimits } from '@/lib/formatCompatibility';
import { idGenerator } from '@/utils/idGenerator';
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
  /** Notes that fell outside the patterns the take could reach */
  dropped: number;
}

export interface TakeWriteResult extends WriteResult {
  /** Patterns the take wrote into */
  patterns: number;
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
  /** Every row from the start row to `rowCount` (the end of the take's last pattern); empty rows are all zero (the channel is cleared). */
  cells: TakeCell[];
}

/**
 * The cells a take writes on its channel: every row from `target.startRow` to
 * `rowCount` (rows counted across the take's patterns, planTakeSegments), so a take replaces the channel and a shorter take leaves no
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

/** Copy one take cell into a pattern cell (replace semantics). */
function writeCell(cell: TrackerCell, c: TakeCell): void {
  cell.note = c.note;
  cell.instrument = c.instrument;
  cell.volume = c.volume;
  cell.effTyp = c.effects[0]?.effTyp ?? 0;
  cell.eff = c.effects[0]?.eff ?? 0;
  cell.effTyp2 = c.effects[1]?.effTyp ?? 0;
  cell.eff2 = c.effects[1]?.eff ?? 0;
}

/** The song a take writes into: the tracker store's patterns and order, or a draft of them. */
export interface TakeSong {
  patterns: Pattern[];
  patternOrder: number[];
}

/** How far a take may grow the song; null = no format limit. */
export interface TakeLimits {
  maxPatterns: number;
  maxPositions: number;
}

/** One pattern a take writes into, in play order. */
export interface TakeSegment {
  /** Song position the segment plays at; -1 when the pattern is not in the order. */
  position: number;
  /** Pattern written; for a new pattern, the index it gets when appended. */
  patternIndex: number;
  /**
   * Existing pattern written in place (null), or how a new pattern is made:
   * `copy` keeps the other channels of a pattern the take already wrote
   * earlier in the order (a repeat), `empty` is an empty pattern added at the
   * song end.
   */
  create: null | { from: number; kind: 'copy' | 'empty' };
  /** First row of the segment's pattern the take writes */
  fromRow: number;
  /** Rows written in this segment (to the pattern end) */
  rows: number;
}

/** Rows a take needs from its start row: through its last note's row. A trailing note-off never adds a pattern. */
export function takeRowsNeeded(notes: readonly QuantisedNote[]): number {
  return notes.reduce((m, n) => Math.max(m, n.row + 1), 0);
}

/**
 * The patterns a take fills, in play order (owner decision 2026-10-17: a take
 * records for as long as it records). From `position` the take walks the song
 * order; past the order's end it adds empty patterns as long as the start
 * pattern, inside the format's pattern and position limits. Every reached
 * pattern is written to its end, so the take replaces the channel up to the
 * end of its last pattern. A pattern the take already wrote earlier in the
 * order is copied, so the repeat plays the take on and not its start again.
 * `position` -1 (the pattern is not in the order) writes that one pattern.
 */
export function planTakeSegments(
  song: TakeSong,
  patternIndex: number,
  position: number,
  startRow: number,
  rowsNeeded: number,
  limits: TakeLimits | null,
): TakeSegment[] {
  const first = song.patterns[patternIndex];
  if (!first) return [];
  const segments: TakeSegment[] = [{ position, patternIndex, create: null, fromRow: startRow, rows: Math.max(0, first.length - startRow) }];
  if (position < 0) return segments;
  const maxPatterns = limits?.maxPatterns ?? Infinity;
  const maxPositions = limits?.maxPositions ?? Infinity;
  let patternCount = song.patterns.length;
  let positionCount = song.patternOrder.length;
  const written = new Set([patternIndex]);
  let covered = segments[0].rows;
  for (let pos = position + 1; covered < rowsNeeded; pos++) {
    if (pos < song.patternOrder.length) {
      const index = song.patternOrder[pos];
      const pattern = song.patterns[index];
      if (!pattern) break;
      if (written.has(index)) {
        if (patternCount >= maxPatterns) break;
        segments.push({ position: pos, patternIndex: patternCount++, create: { from: index, kind: 'copy' }, fromRow: 0, rows: pattern.length });
      } else {
        written.add(index);
        segments.push({ position: pos, patternIndex: index, create: null, fromRow: 0, rows: pattern.length });
      }
    } else {
      if (patternCount >= maxPatterns || positionCount >= maxPositions || first.length === 0) break;
      positionCount++;
      segments.push({ position: pos, patternIndex: patternCount++, create: { from: patternIndex, kind: 'empty' }, fromRow: 0, rows: first.length });
    }
    covered += segments[segments.length - 1].rows;
  }
  return segments;
}

/** A new pattern for a segment, built from plain (non-draft) patterns. */
function newSegmentPattern(source: Pattern, kind: 'copy' | 'empty'): Pattern {
  const pattern = structuredClone(source);
  pattern.id = idGenerator.generate('pattern');
  if (kind === 'empty') for (const channel of pattern.channels) channel.rows = channel.rows.map(() => ({ ...EMPTY_CELL }));
  return pattern;
}

/**
 * Pure part: write a take into a song across the planned segments (mutates
 * `song`). `built` holds the new patterns, made outside any immer draft
 * (structuredClone of a draft throws); appended ones are pushed in order.
 */
export function applyTakeToSong(
  song: TakeSong,
  notes: readonly QuantisedNote[],
  target: WriteTarget,
  segments: readonly TakeSegment[],
  built: ReadonlyMap<number, Pattern>,
): TakeWriteResult {
  const first = song.patterns[segments[0]?.patternIndex ?? -1];
  const channel = first?.channels[target.channelIndex];
  if (!first || !channel) return { written: 0, dropped: notes.length, patterns: 0 };
  const total = segments.reduce((sum, seg) => sum + seg.rows, 0);
  const take = takeCells(notes, target, target.startRow + total, channelEffectSet(first, channel));
  let offset = 0;
  for (const seg of segments) {
    const made = built.get(seg.patternIndex);
    if (seg.create && made) {
      if (seg.patternIndex >= song.patterns.length) song.patterns.push(made);
      if (seg.position < song.patternOrder.length) song.patternOrder[seg.position] = seg.patternIndex;
      else song.patternOrder.push(seg.patternIndex);
    }
    const rows = song.patterns[seg.patternIndex]?.channels[target.channelIndex]?.rows;
    if (rows) for (let r = 0; r < seg.rows; r++) writeCell(rows[seg.fromRow + r], take.cells[offset + r]);
    offset += seg.rows;
  }
  return { written: take.written, dropped: take.dropped, patterns: segments.length };
}

/** Pure part, one pattern: write a take into `pattern` only (replace semantics over the take's span). */
export function applyNotesToPattern(
  pattern: Pattern,
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): WriteResult {
  const song = { patterns: [pattern], patternOrder: [0] };
  const segments = planTakeSegments(song, 0, -1, target.startRow, takeRowsNeeded(notes), null);
  const { written, dropped } = applyTakeToSong(song, notes, target, segments, new Map());
  return { written, dropped };
}

/** Song position of the pattern being edited: the current position when it plays that pattern, else its first position, else -1. */
function editedPosition(order: readonly number[], positionIndex: number, patternIndex: number): number {
  return order[positionIndex] === patternIndex ? positionIndex : order.indexOf(patternIndex);
}

/**
 * Store part: write a take from the current pattern's start row on through
 * the song order, adding patterns at the song end as needed; one undo step
 * covers every pattern and the order (useTrackerStore.multiPatternEdit).
 */
export function writeNotesToPattern(
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): TakeWriteResult {
  const store = useTrackerStore.getState();
  const position = editedPosition(store.patternOrder, store.currentPositionIndex, store.currentPatternIndex);
  const segments = planTakeSegments(store, store.currentPatternIndex, position, target.startRow,
    takeRowsNeeded(notes), getActiveFormatLimits());
  const built = new Map<number, Pattern>();
  for (const seg of segments) if (seg.create) built.set(seg.patternIndex, newSegmentPattern(store.patterns[seg.create.from], seg.create.kind));
  let result: TakeWriteResult = { written: 0, dropped: notes.length, patterns: 0 };
  store.multiPatternEdit('Voice to Notes', (song) => {
    result = applyTakeToSong(song, notes, target, segments, built);
  });
  return result;
}
