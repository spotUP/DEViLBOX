/**
 * Wally Beben: a note typed on a row past the end of its voice's phrase (the grid pads a short phrase to the longest
 * one of the step). The phrase is copied to the end of the file with rests up to that row and the note before the
 * 0xFF end byte, and its phrase-table entry is repointed (the file grows; the table is the only reference to a phrase).
 * Every step that plays that phrase shows the longer phrase. Refused, nothing written: a note outside the 36-note
 * period table, an instrument other than the one in force, a phrase that is not padded to that row, and any result
 * that does not reparse with the same steps and rows, the note on that row and every cell of a step not playing that
 * phrase unchanged.
 */
import type { Pattern } from '@/types';
import { decodePhraseToRows, parseWallyBebenFile, readWallyBebenStructure } from './WallyBebenParser';

const REST = 0x24;
const put32 = (d: Uint8Array, o: number, v: number): void => { d[o] = v >>> 24; d[o + 1] = (v >>> 16) & 0xff; d[o + 2] = (v >>> 8) & 0xff; d[o + 3] = v & 0xff; };
const grid = (f: Uint8Array): Pattern[] => parseWallyBebenFile(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer, 'wb').patterns;

export interface WallyBebenAdd { pattern: number; channel: number; row: number; note: number; instrument: number }

/** The module with the note added, or a reason it was refused. */
export function addWallyBebenNote(file: Uint8Array, a: WallyBebenAdd): { data: Uint8Array } | { refused: string } {
  const st = readWallyBebenStructure(file);
  const k = st.voiceSeqs[a.channel]?.[a.pattern];
  if (k === undefined || st.phraseTableStart < 0 || k >= st.phraseOffsets.length) return { refused: 'no phrase plays on this voice in this step' };
  const idx = a.note - 13; // amigaNoteToXM(b + 1)
  if (idx < 0 || idx > 0x23) return { refused: `note ${a.note} is not in the player's period table` };
  const ph = decodePhraseToRows(file, st.phraseOffsets[k]);
  if (ph.end < 0 || ph.offsets.length === 0) return { refused: 'the phrase has no end byte' };
  if (a.row < ph.rows.length) return { refused: 'the row is inside the phrase' };
  if (a.instrument !== 0 && a.instrument !== ph.instrument) return { refused: 'a different instrument would need an instrument command' };
  const body = file.subarray(st.phraseOffsets[k], ph.end);
  const grown = new Uint8Array(Math.ceil((body.length + (a.row - ph.rows.length) + 2) / 2) * 2);
  grown.fill(0xff);
  grown.set(body);
  grown.fill(REST, body.length, body.length + (a.row - ph.rows.length));
  grown[body.length + (a.row - ph.rows.length)] = idx;
  const at = file.length + (file.length & 1);
  const out = new Uint8Array(at + grown.length);
  out.set(file);
  out.set(grown, at);
  put32(out, st.phraseTableStart + k * 4, (at + st.origin) >>> 0);
  const was = grid(file), now = grid(out);
  if (now.length !== was.length) return { refused: 'the song would change length' };
  for (let p = 0; p < was.length; p++) {
    if (now[p].length !== was[p].length) return { refused: 'a step would change length' };
    for (let c = 0; c < 4; c++) for (let r = 0; r < was[p].length; r++) {
      const x = now[p].channels[c].rows[r], y = was[p].channels[c].rows[r];
      if (p === a.pattern && c === a.channel && r === a.row) { if (x.note !== a.note) return { refused: 'the note does not read back on that row' }; continue; }
      if (st.voiceSeqs[c][p] === k) continue; // steps playing this phrase share it
      if (x.note !== y.note || x.instrument !== y.instrument) return { refused: 'another cell would change' };
    }
  }
  return { data: out };
}
