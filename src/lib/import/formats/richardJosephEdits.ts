/**
 * Richard Joseph: a note on the first blank row after a pattern's last event. The grid has one row per event, so the
 * blank rows are padding: the note byte is inserted in the pattern stream before its end-of-pattern byte. The pattern
 * chunk is the last chunk of the file, so its size long grows by one and every pattern pointer that lies behind the
 * insertion moves by one. A row further down than the first blank one, a note outside the period table and a note
 * that does not read back on its row are refused with a warning and nothing is written. The pattern is shared by
 * every step that plays it, so the new note shows wherever it plays; the instrument stays the one in force.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseChunks, parseRJPFile, rjpNoteByte, type RJPLayout } from './RichardJosephParser';

const be32 = (d: Uint8Array, o: number): number => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const put32 = (d: Uint8Array, o: number, v: number): void => { d[o] = v >>> 24; d[o + 1] = (v >>> 16) & 0xff; d[o + 2] = (v >>> 8) & 0xff; d[o + 3] = v & 0xff; };

export interface RJPAdd { pattern: number; row: number; channel: number; note: number }

/** `file` with the note inserted, or `file` itself and a warning. */
export async function addRichardJosephNote(file: Uint8Array, name: string, a: RJPAdd, warnings: string[]): Promise<Uint8Array> {
  const refuse = (why: string): Uint8Array => { warnings.push(`Richard Joseph voice ${a.channel + 1}, pattern ${a.pattern}, row ${a.row}: ${why}; the note was not written.`); return file; };
  const song = await parseRJPFile(file.slice().buffer as ArrayBuffer, name);
  const slot = (song.uadePatternLayout as RJPLayout).appendSlot(a.pattern, a.row, a.channel);
  if (!slot) return refuse('only the first blank row after the last note of a pattern can take a note');
  const byte = rjpNoteByte(a.note);
  if (byte < 0) return refuse(`note ${a.note} is not in the module's period table`);
  const chunks = parseChunks(file);
  if (!chunks) return refuse('the chunk layout is not known');
  if (chunks.patternData.offset + chunks.patternData.size !== file.length) return refuse('the pattern chunk is not the end of the file');
  const out = new Uint8Array(file.length + 1);
  out.set(file.subarray(0, slot.eopAt));
  out[slot.eopAt] = byte;
  out.set(file.subarray(slot.eopAt), slot.eopAt + 1);
  put32(out, chunks.patternData.offset - 4, chunks.patternData.size + 1);
  const rel = slot.eopAt - chunks.patternData.offset;
  for (let at = chunks.patternPtrs.offset; at < chunks.patternPtrs.offset + chunks.patternPtrs.size; at += 4) if (be32(out, at) > rel) put32(out, at, be32(out, at) + 1);
  const back = await parseRJPFile(out.slice().buffer as ArrayBuffer, name);
  if (back.patterns[a.pattern]?.channels[a.channel]?.rows[a.row]?.note !== a.note) return refuse('the note does not read back on this row');
  return out;
}

/** The adds the in-place patch could not place, each written in turn (rows of one pattern in ascending order). */
export async function addRichardJosephNotes(file: Uint8Array, name: string, song: TrackerSong, unplaced: Array<Omit<RJPAdd, 'note'>>, warnings: string[]): Promise<Uint8Array> {
  let data = file;
  for (const u of unplaced) data = await addRichardJosephNote(data, name, { ...u, note: song.patterns[u.pattern].channels[u.channel].rows[u.row].note }, warnings);
  return data;
}
