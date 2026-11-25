/**
 * Grid edits for a PT3 song playing on the aylet engine (the real S.V. Bulba player reads the module in Z80 memory).
 *
 * A grid note is the note byte the decoder found on that line (pt3NoteOffsets); the C++ module encodes the new note
 * (pt3_encode_note, the song's own note table) and the byte goes into the running tune's memory (AyletEngine.poke),
 * the .ay wrapper (next load) and the module file (save, export). Every encoded byte ends the line like the note byte
 * it replaces, so the line layout stays. Lines with no note byte, instruments, volumes and effects are not edited.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyPt3ModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<void> {
  const offsets = song.pt3NoteOffsets;
  if (!offsets || !song.zxtuneFileData || !song.ayFileData) return;
  const file = new Uint8Array(song.zxtuneFileData);
  const ay = new Uint8Array(song.ayFileData);
  const { pt3EncodeNotes } = await import('./pt3EditWasm');
  const { bytes, moduleAddr, xmOf } = await pt3EncodeNotes(file, edits.map((e) => e.cell.note ?? 0));
  const modAt = ay.length - file.length;  // the wrapper ends with the untouched module
  const pokes: Array<[number, number]> = [];
  edits.forEach(({ pattern, row, channel }, i) => {
    const off = offsets[pattern]?.[row]?.[channel] ?? -1;
    if (off < 0 || bytes[i] < 0 || off >= file.length || xmOf(file[off]) === (edits[i].cell.note ?? 0)) return;
    file[off] = bytes[i];
    ay[modAt + off] = bytes[i];
    pokes.push([moduleAddr + off, bytes[i]]);
  });
  if (pokes.length === 0) return;
  const { AyletEngine } = await import('../aylet/AyletEngine');
  if (AyletEngine.hasInstance()) AyletEngine.getInstance().poke(pokes);
}
