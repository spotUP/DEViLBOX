/**
 * Grid edits for the engines that keep their own tracks (SoundMon, Digital
 * Mugician, Sonic Arranger, Delta Music 1/2, InStereo 1/2, Synthesis).
 *
 * The grid is one pattern per song position; these replayers store their notes
 * once, in a pool of tracks / blocks / track lines that several positions and
 * channels point at. Their `set_cell` takes the replayer's own index into that
 * pool, never the grid's pattern number: handing it the pattern number (what
 * the generic `gridCellEdits` route did) edited an unrelated track.
 *
 * The parser's uadePatternLayout already knows where a grid cell lives in the
 * module (getCellFileOffset, the same lookup the chip-RAM route writes through)
 * and what bytes the cell encodes to. The replayer loads the same module, so
 * its index is that file offset in units of the format's own record, and its
 * fields are the bytes the replayer's loader reads from the record.
 */

import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from './liveCellEdits';

/** What a track-index engine's set_cell takes: the replayer's own address and fields. */
export interface TrackCellWrite {
  /** Track / block / track-line index in the replayer's pool. */
  index: number;
  /** Row inside the track or block; 0 for engines whose index is already a row. */
  row: number;
  note: number;
  instrument: number;
  arpeggio: number;
  effect: number;
  effectArg: number;
}

interface Record4Format {
  /** Rows per track/block (the index counts whole tracks); 0 = index is a flat track line. */
  rowsPerRecord: number;
  /** Bytes of one cell in the module. */
  stride: number;
  /** The replayer's fields from the cell's module bytes (its loader's reading). */
  fields: (raw: Uint8Array) => Omit<TrackCellWrite, 'index' | 'row'>;
}

/** InStereo 1, Synthesis: [note, instrument, arpeggio<<4 | effect, effectArg]. */
const nibbleArpLine = (raw: Uint8Array) => ({
  note: raw[0], instrument: raw[1], arpeggio: (raw[2] & 0xf0) >> 4, effect: raw[2] & 0x0f, effectArg: raw[3],
});
/** InStereo 2, Sonic Arranger: byte 2 carries two transpose-disable flags above a 2-bit arpeggio. */
const flaggedArpLine = (raw: Uint8Array) => ({
  note: raw[0], instrument: raw[1], arpeggio: (raw[2] & 0x30) >> 4, effect: raw[2] & 0x0f, effectArg: raw[3],
});

/** Registry key -> the module's record layout. */
const FORMATS: Record<string, Record4Format> = {
  // [note (s8), sample << 4 | effect, param]; tracks of 16 rows.
  SoundMonReplayer: {
    rowsPerRecord: 16, stride: 3,
    fields: (r) => ({ note: r[0], instrument: r[1] >> 4, arpeggio: 0, effect: r[1] & 0x0f, effectArg: r[2] }),
  },
  // [note, sample, effect, param]; tracks of 64 rows.
  DigMugReplayer: {
    rowsPerRecord: 64, stride: 4,
    fields: (r) => ({ note: r[0], instrument: r[1], arpeggio: 0, effect: r[2], effectArg: r[3] }),
  },
  // [instrument, note, effect, arg]; blocks of 16 rows.
  DeltaMusic1Replayer: {
    rowsPerRecord: 16, stride: 4,
    fields: (r) => ({ note: r[1], instrument: r[0], arpeggio: 0, effect: r[2], effectArg: r[3] }),
  },
  // [note, instrument, effect, arg]; blocks of 16 rows.
  DeltaMusic2Replayer: {
    rowsPerRecord: 16, stride: 4,
    fields: (r) => ({ note: r[0], instrument: r[1], arpeggio: 0, effect: r[2], effectArg: r[3] }),
  },
  SonicArranger: { rowsPerRecord: 0, stride: 4, fields: flaggedArpLine },
  InStereo2Replayer: { rowsPerRecord: 0, stride: 4, fields: flaggedArpLine },
  InStereo1Replayer: { rowsPerRecord: 0, stride: 4, fields: nibbleArpLine },
  SynthesisReplayer: { rowsPerRecord: 0, stride: 4, fields: nibbleArpLine },
};

/** The replayer's fields for a cell's bytes as the module stores them. */
export function moduleCellFields(key: string, raw: Uint8Array): Omit<TrackCellWrite, 'index' | 'row'> {
  return FORMATS[key].fields(raw);
}

/** True for the registry keys whose engine addresses its own tracks. */
export function isTrackIndexEngine(key: string | undefined): boolean {
  return !!key && key in FORMATS;
}

/**
 * The replayer's write for a grid edit, or null when the cell is not backed by
 * a track of the module (an empty step, a position past the song's end).
 */
export function trackCellWrite(song: TrackerSong, key: string, edit: LiveCellEdit): TrackCellWrite | null {
  const fmt = FORMATS[key];
  const layout = song.uadePatternLayout;
  if (!fmt || !layout?.getCellFileOffset) return null;
  const offset = layout.getCellFileOffset(edit.pattern, edit.row, edit.channel);
  if (offset <= 0 || offset < layout.patternDataFileOffset) return null;
  const cellNo = (offset - layout.patternDataFileOffset) / fmt.stride;
  if (!Number.isInteger(cellNo)) return null;
  const raw = layout.encodeCell(edit.cell);
  const addr = fmt.rowsPerRecord > 0
    ? { index: Math.floor(cellNo / fmt.rowsPerRecord), row: cellNo % fmt.rowsPerRecord }
    : { index: cellNo, row: 0 };
  return { ...addr, ...fmt.fields(raw) };
}

/** The setTrackCell shape the eight engines implement. */
interface TrackCellEngine {
  setTrackCell(index: number, row: number, note: number, instrument: number, arpeggio: number, effect: number, effectArg: number): void;
}

/** Send grid edits to a track-index engine through the replayer's own addressing. */
export function applyTrackIndexEdits(song: TrackerSong, key: string, engine: TrackCellEngine, edits: readonly LiveCellEdit[]): void {
  for (const edit of edits) {
    const w = trackCellWrite(song, key, edit);
    if (w) engine.setTrackCell(w.index, w.row, w.note, w.instrument, w.arpeggio, w.effect, w.effectArg);
  }
}
