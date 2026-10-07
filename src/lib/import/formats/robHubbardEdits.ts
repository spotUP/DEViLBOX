/**
 * robHubbardEdits.ts - write the Rob Hubbard tick grid's edits back into the module's command blocks.
 *
 * The grid is the player's walk (rhWalk.ts, docs/FORMAT_COMMAND_STREAM_GRID.md): each note or
 * note-off is drawn on the row its command ran, and RobHubbardParser records which block command
 * that is (cellSources). An edited cell is a byte patch of that command, never a re-pack, so the
 * module keeps its length and every other byte:
 *   - note: the command's note byte, the table index whose period (scaled by the sample the voice
 *     plays it with) names the edited note; a note turned into a rest (and back) swaps the two
 *     bytes of the same two-byte command: [duration, note] <-> [-126, duration];
 *   - instrument: the sample-change command in force in the note's block (its byte is index - 1).
 * A command is shared by every tick that replays its block, so the edit shows wherever the block
 * plays. Edits that need a longer block (a note on a blank row, a removed note) come back as
 * warnings, never as a half-edit. Release markers are display only and are not edits.
 */
import type { Pattern } from '@/types';
import { buildRobHubbardGrid } from './RobHubbardParser';
import { rhNotePeriod, rhPeriodToNote, rhTableLength } from './robHubbardGrid';

const SAMPLE_CHANGE = 0x80; // -128
const REST = 0x82;          // -126

export interface RhEditResult { data: Uint8Array; patched: number; warnings: string[] }

export function applyRhGridEdits(source: Uint8Array, edited: Pattern[]): RhEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const grid = buildRobHubbardGrid(source);
  if (!grid) return { data: out, patched: 0, warnings: ['the module has no song to write the grid into'] };

  // file offset of every command of every block
  const cmdOff: number[][] = grid.blockRows.map((rows, fp) => {
    const offs: number[] = [];
    let o = grid.filePatternAddrs[fp];
    for (const c of rows) { offs.push(o); o += c.cutoff ?? 0; }
    return offs;
  });
  const { periods, samples } = grid.walk.module;
  const tableLen = rhTableLength(source, periods);
  /** The note byte that plays tracker note `n` on sample `sample`, or -1 when no table entry names it. */
  const noteByte = (n: number, sample: number): number => {
    const rel = samples[sample]?.relative ?? 0;
    for (let b = 0; b < tableLen; b++) if (rhPeriodToNote(rhNotePeriod(source, periods, b, rel)) === n) return b;
    return -1;
  };
  const wanted = new Map<number, { value: number; why: string }>();
  const want = (off: number, value: number, why: string): void => {
    const prev = wanted.get(off);
    if (prev && prev.value !== value) { warnings.push(`${why}: conflicts with ${prev.why} on the same command byte, kept the first`); return; }
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
          // a cell the player ran no note or note-off command on: a note there needs a command the block does not have
          if ((c.note ?? 0) !== 0) warnings.push(`${where}: a note where the module has no command needs a longer block; not written`);
          continue;
        }
        const carrier = grid.blockRows[src.fp][src.cmd];
        const o = cmdOff[src.fp][src.cmd];
        const isRest = carrier.period === REST;
        if (dNote) {
          const n = c.note ?? 0;
          if (n < 1 || n > 97) warnings.push(`${where}: a removed note needs a shorter block; not written`);
          else if (n === 97) {
            if (!isRest) { want(o, REST, `${where} rest`); want(o + 1, carrier.period ?? 0, `${where} rest`); }
          } else {
            const sample = dIns ? Math.max(0, (c.instrument ?? 1) - 1) : src.sample;
            const nb = noteByte(n, sample);
            if (nb < 0) warnings.push(`${where}: no note of the player's period table plays as note ${n} on sample ${sample + 1}; not written`);
            else if (isRest) {
              const dur = carrier.pan ?? 0;
              if (dur >= 0x80 || dur === 0) warnings.push(`${where}: a rest of ${dur} ticks cannot become a note; not written`);
              else { want(o, dur, `${where} note`); want(o + 1, nb, `${where} note`); }
            } else want(o + 1, nb, `${where} note`);
          }
        }
        if (dIns) {
          const ins = c.instrument ?? 0;
          let sc = -1;
          for (let k = src.cmd - 1; k >= 0; k--) if (grid.blockRows[src.fp][k].period === SAMPLE_CHANGE) { sc = k; break; }
          if (isRest) warnings.push(`${where}: a rest plays no instrument; not written`);
          else if (sc < 0) warnings.push(`${where}: no sample-change command in this block (the sample carries over from the block before); not written`);
          else if (ins < 1 || ins > 0x80) warnings.push(`${where}: instrument ${ins} is out of range; not written`);
          else want(cmdOff[src.fp][sc] + 1, ins - 1, `${where} instrument`);
        }
      }
    }
  }
  let patched = 0;
  for (const [off, { value }] of wanted) if (out[off] !== value) { out[off] = value; patched++; }
  return { data: out, patched, warnings };
}
