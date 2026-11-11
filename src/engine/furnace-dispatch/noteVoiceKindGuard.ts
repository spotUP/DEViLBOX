/**
 * Where a pattern edit meets the voice-kind check: reads the instrument of the
 * cell from the instrument store and asks checkNoteVoiceKind. Used by the
 * tracker store's cell write (the editor and every composing tool reach it) and
 * by the MCP write handlers, which return the text as their error.
 */
import type { TrackerCell } from '@typedefs';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { checkNoteVoiceKind } from './chipVoiceKinds';

type CellNote = Pick<TrackerCell, 'note' | 'instrument'>;

/** Error text when the cell (after the update) puts a note on a channel of the wrong voice kind, else null. */
export function noteVoiceKindError(
  trackerChannel: number,
  update: Partial<CellNote>,
  existing?: Partial<CellNote>,
): string | null {
  if (update.note === undefined && update.instrument === undefined) return null;
  const note = update.note ?? existing?.note;
  const instrumentId = update.instrument ?? existing?.instrument;
  if (!note || !instrumentId) return null;
  const instrument = useInstrumentStore.getState().getInstrument(instrumentId);
  const result = checkNoteVoiceKind(instrument, trackerChannel, note);
  return result.ok ? null : result.error;
}

/**
 * One error for a whole batch (a paste or a transpose): the first cell that
 * lands on a channel of the wrong kind names the problem; the rest are not listed.
 */
export function firstNoteVoiceKindError(
  cells: Iterable<{ channel: number; cell: Partial<CellNote> }>,
): string | null {
  for (const { channel, cell } of cells) {
    const err = noteVoiceKindError(channel, cell);
    if (err) return err;
  }
  return null;
}
