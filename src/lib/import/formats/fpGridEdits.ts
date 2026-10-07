/**
 * fpGridEdits.ts - write the Future Player grid's edits back into the module's command streams.
 *
 * The grid is the player's walk (fpWalk.ts, fpGrid.ts, docs/FORMAT_COMMAND_STREAM_GRID.md): each note is
 * drawn on the row its command ran, and the grid builder records which command that is (cellSources).
 * An edited cell is a byte patch of that command, never a re-pack, so the module keeps its length and
 * every other byte:
 *   - note: the command's note byte, the table index whose period names the edited note once the
 *     sample's base note, both transposes and the arpeggio's step are added (the byte is that index
 *     minus them, mod 128); a note byte of 0 is a rest, so a note that would need it is refused;
 *   - instrument: the pointer of the set-instrument command in force at the note.
 * A command is shared by every row that replays its block (a subroutine), so the edit shows wherever
 * the block plays. Edits that need a longer block (a note on a blank row, a removed note, a note-off)
 * come back as warnings, never as a half-edit.
 */
import type { Pattern } from '@/types';
import { buildFuturePlayerGrid } from './FuturePlayerParser';
import { fpTableIndexOfPitch } from './fpGrid';
import { noteValueToPitch } from '@/lib/tracker/noteValue';

export interface FpEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * `source` is the module's file; `edited` the song's patterns as they are now; `instrumentPtr` maps an instrument
 * slot to the pointer it stands for (the parsed song's instrument metadata).
 */
export function applyFpGridEdits(source: Uint8Array, edited: Pattern[], instrumentPtr: (id: number) => number | undefined): FpEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const m = buildFuturePlayerGrid(source);
  if (!m.grid) return { data: out, patched: 0, warnings: [`the module has no matched grid to write edits into (${m.unmatched ?? 'no walk'})`] };
  const grid = m.grid;
  const base = m.code.byteOffset - source.byteOffset; // file offset of the code section
  const wanted = new Map<number, { value: number; why: string }>();
  const want = (off: number, value: number, why: string): void => {
    const prev = wanted.get(off);
    if (prev && prev.value !== value) { warnings.push(`${why}: conflicts with ${prev.why} on the same byte, kept the first`); return; }
    wanted.set(off, { value: value & 0xff, why });
  };

  for (let p = 0; p < edited.length; p++) {
    const bp = grid.patterns[p];
    if (!bp) { warnings.push(`pattern ${p} is past the end of the module's song; not written`); continue; }
    for (let ch = 0; ch < bp.channels.length; ch++) {
      const eRows = edited[p].channels[ch]?.rows;
      if (!eRows) continue;
      for (let row = 0; row < bp.length; row++) {
        const b = bp.channels[ch].rows[row];
        const c = eRows[row];
        if (!c) continue;
        const dNote = (c.note ?? 0) !== (b.note ?? 0);
        const dIns = (c.instrument ?? 0) !== (b.instrument ?? 0);
        if (!dNote && !dIns) continue;
        const where = `pattern ${p} voice ${ch + 1} row ${row}`;
        const src = grid.cellSources[p][ch][row];
        if (!src) {
          if ((c.note ?? 0) !== 0) warnings.push(`${where}: a note where the module has no note command needs a longer block; not written`);
          continue;
        }
        if (dNote) {
          const n = c.note ?? 0;
          const pitch = noteValueToPitch(n);
          if (pitch === null) warnings.push(`${where}: ${n === 0 ? 'a removed note needs a shorter block' : 'a note-off is a rest, which has no note byte to patch'}; not written`);
          else {
            const idx = fpTableIndexOfPitch(pitch);
            if (idx < 0) warnings.push(`${where}: no entry of the player's period table plays note ${n}; not written`);
            else {
              const byte = (idx - src.delta + 256) & 0x7f;
              if (byte === 0) warnings.push(`${where}: note ${n} would need note byte 0, which is a rest; not written`);
              else want(base + src.off, byte, `${where} note`);
            }
          }
        }
        if (dIns) {
          const ptr = instrumentPtr(c.instrument ?? 0);
          if (!src.retrigger) warnings.push(`${where}: a legato note plays no instrument; not written`);
          else if (src.instrCmd < 0) warnings.push(`${where}: no set-instrument command ran on this voice before the note; not written`);
          else if (ptr === undefined) warnings.push(`${where}: instrument ${c.instrument ?? 0} has no pointer in the module; not written`);
          else for (let k = 0; k < 4; k++) want(base + src.instrCmd + 2 + k, (ptr >>> (24 - 8 * k)) & 0xff, `${where} instrument`);
        }
      }
    }
  }
  let patched = 0;
  for (const [off, { value }] of wanted) if (out[off] !== value) { out[off] = value; patched++; }
  return { data: out, patched, warnings };
}
