/**
 * writeToPattern.ts - quantised notes to pattern cells, as ONE undo step.
 *
 * Goes through useTrackerStore.bulkBlockEdit (one history entry, one live
 * engine resync). Note encoding is lib/xmConversions.midiToXMNote, the same
 * function the sample editor's Audio to MIDI path uses.
 */
import type { Pattern, TrackerCell } from '@typedefs';
import { midiToXMNote } from '@/lib/xmConversions';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import type { QuantisedNote } from './quantise';

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

/** Pure part: mutate a pattern in place. */
export function applyNotesToPattern(
  pattern: Pattern,
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): WriteResult {
  const channel = pattern.channels[target.channelIndex];
  const result: WriteResult = { written: 0, dropped: 0 };
  if (!channel) {
    result.dropped = notes.length;
    return result;
  }
  const rows: TrackerCell[] = channel.rows;
  const last = notes.length ? notes[notes.length - 1] : null;
  if (last) {
    // Replace semantics: the take's span is cleared of notes first.
    const spanEnd = Math.min(rows.length, target.startRow + last.row + last.lengthRows + 1);
    for (let r = target.startRow; r < spanEnd; r++) {
      rows[r].note = 0;
      rows[r].instrument = 0;
      rows[r].volume = 0;
    }
  }
  for (const n of notes) {
    const row = target.startRow + n.row;
    const xm = midiToXMNote(n.midi);
    if (row >= rows.length || !xm) {
      result.dropped++;
      continue;
    }
    rows[row].note = xm;
    rows[row].instrument = n.instrumentId ?? target.instrumentId;
    rows[row].volume = velocityToVolume(n.velocity);
    result.written++;
    const off = row + n.lengthRows;
    if (n.noteOff !== false && off < rows.length && rows[off].note === 0) rows[off].note = NOTE_OFF;
  }
  return result;
}

/**
 * Every instrument the notes point at must exist, or they play silent. A fresh
 * song has no instruments at all, and the panel's default target is 1, so a
 * missing id gets a new default instrument (one per distinct missing id).
 */
export function resolveInstruments(
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): { notes: QuantisedNote[]; target: WriteTarget } {
  const store = useInstrumentStore.getState();
  const existing = new Set(store.instruments.map((i) => i.id));
  const remap = new Map<number, number>();
  const resolve = (id: number): number => {
    if (existing.has(id)) return id;
    let created = remap.get(id);
    if (created === undefined) {
      created = useInstrumentStore.getState().createInstrument();
      // -1: the format's instrument limit refused it; keep the original id
      if (created < 0) created = id;
      remap.set(id, created);
    }
    return created;
  };
  const resolvedTarget = { ...target, instrumentId: resolve(target.instrumentId) };
  const resolvedNotes = notes.map((n) =>
    n.instrumentId === undefined ? n : { ...n, instrumentId: resolve(n.instrumentId) },
  );
  return { notes: resolvedNotes, target: resolvedTarget };
}

/** Store part: one undo step on the current pattern. */
export function writeNotesToPattern(
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): WriteResult {
  const resolved = resolveInstruments(notes, target);
  let result: WriteResult = { written: 0, dropped: 0 };
  useTrackerStore.getState().bulkBlockEdit('Voice to Notes', (pattern) => {
    result = applyNotesToPattern(pattern, resolved.notes, resolved.target);
  });
  return result;
}
