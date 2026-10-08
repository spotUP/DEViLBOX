/**
 * SidMon2Exporter.ts — Export TrackerSong to SidMon II native format.
 *
 * The module is the Sd2Engine WASM save when the engine runs (it holds instrument edits made on the engine) or the
 * stored sd2FileData; the grid's note edits are then written into it (G24). A SidMon II grid is the player's
 * simulation (a command lasts as many rows as its speed says), so a cell is not a place in the file: each grid note cell
 * carries the file byte of the note command that played it (the parser's `noteBytes`), and an edited note is that
 * byte moved by the cell's change, in place. A note on a row no command played, a removed note and other column
 * changes are not written and come back through `warnings`.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { Sd2Engine } from '@/engine/sidmon2/Sd2Engine';
import { editedCells } from '@/lib/song/gridBaseline';

/** The module with the note edits of `song` written into its note commands. Returns the bytes and what was not written. */
export function writeSidMon2NoteEdits(song: TrackerSong, module: ArrayBuffer): { data: ArrayBuffer; warnings: string[] } {
  const layout = song.uadeVariableLayout;
  const notes = layout?.noteBytes;
  if (!notes) return { data: module, warnings: [] };
  const out = new Uint8Array(module.slice(0));
  const at = new Map(notes.map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note > 0) warnings.push(`pattern ${pattern} voice ${channel + 1} row ${row}: a note where the player runs none needs a longer pattern; not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    const nb = (out[n.offset] ?? 0) + (cell.note - n.note);
    if (cell.note < 1 || cell.note > 96) warnings.push(`pattern ${pattern} voice ${channel + 1} row ${row}: a removed note needs a different command; not written`);
    else if (nb < 1 || nb > 72) warnings.push(`pattern ${pattern} voice ${channel + 1} row ${row}: note ${cell.note} is outside the player's 72 notes; not written`);
    else out[n.offset] = nb;
  }
  return { data: out.buffer as ArrayBuffer, warnings };
}

/**
 * Export a TrackerSong to SidMon II (.sd2) binary format.
 */
export async function exportSidMon2File(song: TrackerSong): Promise<ArrayBuffer> {
  let module: ArrayBuffer | null = null;
  // The WASM serializer captures edits made on the running engine (instruments).
  if (Sd2Engine.hasInstance()) {
    const data = await Sd2Engine.getInstance().save();
    if (data && data.byteLength > 0) module = data;
  }
  module ??= song.sd2FileData ?? null;
  if (!module) throw new Error('SidMon II export requires either a running Sd2Engine or stored file data');
  return writeSidMon2NoteEdits(song, module).data;
}
