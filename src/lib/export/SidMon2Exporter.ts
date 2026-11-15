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
import { buildSidMon2File } from './SidMon2Writer';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

interface NewNote { at: number; hRow: number; row: number; standalone: boolean; note: number; sample: number; }

/**
 * Splits the holds the new notes fall in and grows the pattern stream: the hold's speed byte is cut to the rows before the
 * note, a [note, sample, speed] command is inserted behind it (a standalone rest hit on its first row gets the note in front),
 * every stream pointer behind the insertion moves, and the stream length (u32 at 50) and the word padding follow.
 */
function growPatternStream(module: Uint8Array, stream: NonNullable<UADEVariablePatternLayout['stream']>, adds: NewNote[], warnings: string[]): Uint8Array {
  const v = new DataView(module.buffer, module.byteOffset, module.byteLength);
  const len = v.getUint32(50);
  const pat = Array.from(module.subarray(stream.dataStart, stream.dataStart + len));
  const ptrs = Array.from({ length: stream.count }, (_, i) => v.getUint16(stream.pointersAt + 2 * i));
  const seen = new Set<string>();
  const todo = adds.filter((a) => { const k = `${a.at}:${a.row}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.at - a.at || b.row - a.row);
  for (const a of todo) {
    const rel = a.at - stream.dataStart;
    const span = ~((pat[rel] << 24) >> 24);
    let from: number, ins: number[];
    if (span < 0) { warnings.push(`row ${a.row}: the hold byte is not where the parser saw it; not written`); continue; }
    if (a.standalone && a.row === a.hRow) { from = rel; ins = [a.note, a.sample]; }
    else {
      const tail = a.hRow + span - a.row;
      if (a.row <= a.hRow || tail < 0 || a.row - a.hRow - 1 > 127) { warnings.push(`row ${a.row}: outside its hold; not written`); continue; }
      pat[rel] = ~(a.row - a.hRow - 1) & 0xFF;
      from = rel + 1; ins = [a.note, a.sample, ~tail & 0xFF];
    }
    pat.splice(from, 0, ...ins);
    // A pointer at the insertion point of an in-stream split belongs to the next stream; at a stream's own first byte it stays.
    for (let i = 0; i < ptrs.length; i++) if (from === rel ? ptrs[i] > from : ptrs[i] >= from) ptrs[i] += ins.length;
  }
  const end = stream.dataStart + len;
  const pad = stream.dataStart + pat.length & 1;
  const out = new Uint8Array(stream.dataStart + pat.length + pad + (module.length - (end + (end & 1))));
  out.set(module.subarray(0, stream.dataStart));
  out.set(pat, stream.dataStart);
  out.set(module.subarray(end + (end & 1)), stream.dataStart + pat.length + pad);
  const o = new DataView(out.buffer);
  o.setUint32(50, pat.length);
  ptrs.forEach((x, i) => o.setUint16(stream.pointersAt + 2 * i, x));
  return out;
}

/** The module with the note edits of `song` written into its note commands. Returns the bytes and what was not written. */
export function writeSidMon2NoteEdits(song: TrackerSong, module: ArrayBuffer, loaded: ArrayBuffer | null = song.sd2FileData ?? null): { data: ArrayBuffer; warnings: string[] } {
  const layout = song.uadeVariableLayout;
  const notes = layout?.noteBytes;
  if (!notes) return { data: module, warnings: [] };
  const out = new Uint8Array(module.slice(0));
  // An edited byte is the LOADED module's byte moved by the cell's change, never the running engine's: that one already carries
  // an earlier live edit of the same cell (G24), which would be added twice.
  const from = loaded ? new Uint8Array(loaded) : out;
  const at = new Map(notes.map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  const adds: NewNote[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note <= 0) continue;
      const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
      const hold = layout.holds?.find((h) => h.pattern === pattern && h.channel === channel && h.row <= row && row <= h.row + h.span && (h.standalone || row > h.row));
      // The note byte is a neighbour note of the same voice moved by the semitone difference.
      const ref = notes.filter((x) => x.pattern === pattern && x.channel === channel && x.row < row).sort((a, b) => b.row - a.row)[0];
      if (!hold || !ref) { warnings.push(`${where}: this row lies in no hold of the module and has no note to start from; not written`); continue; }
      const note = (from[ref.offset] ?? 0) + (cell.note - ref.note) + ((ref.base ?? 0) - hold.transpose);
      const sample = cell.instrument > 0 ? cell.instrument - hold.soundTranspose : 0;
      if (note < 1 || note > 72 || sample < 0 || sample > 111) { warnings.push(`${where}: note ${cell.note} or instrument ${cell.instrument} is outside the player's range; not written`); continue; }
      adds.push({ at: hold.at, hRow: hold.row, row, standalone: hold.standalone, note, sample });
      continue;
    }
    if (cell.note === n.note) continue;
    const nb = (from[n.offset] ?? 0) + (cell.note - n.note);
    if (cell.note < 1 || cell.note > 96) warnings.push(`pattern ${pattern} voice ${channel + 1} row ${row}: a removed note needs a different command; not written`);
    else if (nb < 1 || nb > 72) warnings.push(`pattern ${pattern} voice ${channel + 1} row ${row}: note ${cell.note} is outside the player's 72 notes; not written`);
    else out[n.offset] = nb;
  }
  if (adds.length && layout.stream) {
    const grown = growPatternStream(out, layout.stream, adds, warnings);
    return { data: grown.buffer as ArrayBuffer, warnings };
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
  // No module to patch (a New Song): the file is built from the song.
  if (!module) return buildSidMon2File(song).data;
  return writeSidMon2NoteEdits(song, module).data;
}
