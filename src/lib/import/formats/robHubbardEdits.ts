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
const ROWS = 64;

export interface RhEditResult { data: Uint8Array; patched: number; warnings: string[] }

/** A note put on a blank row (G5). */
interface RhAdd { p: number; ch: number; row: number; note: number; instrument: number; where: string }

type RhGridResult = NonNullable<ReturnType<typeof buildRobHubbardGrid>>;

/**
 * Notes on blank rows: each splits the note or rest command that covers its row into the part before it
 * and the new note (the new note takes the rest of the duration), the block is rebuilt from its commands
 * and, being longer, written at the end of the module with the u32 entries of every track list that named
 * the old block pointed at it (the player reads block addresses as file offsets, so nothing after the old
 * block moves). A voice's sample is restored after a new note that changes it.
 */
function growBlocks(
  source: Uint8Array, grid: RhGridResult, adds: RhAdd[],
  noteByte: (n: number, sample: number) => number, warnings: string[],
): { data: Uint8Array; patched: number } {
  // per voice, the command each row is inside of: the last note or rest command at or before it
  const perChannel = (ch: number): Array<{ src: NonNullable<RhGridResult['cellSources'][number][number][number]>; row: number }> => {
    const out: Array<{ src: NonNullable<RhGridResult['cellSources'][number][number][number]>; row: number }> = [];
    grid.cellSources.forEach((pat, p) => pat[ch]?.forEach((s, r) => { if (s) out.push({ src: s, row: p * ROWS + r }); }));
    return out;
  };
  const cover = new Map<string, { fp: number; cmd: number; add: Array<{ k: number; note: number; sample: number; ins: number }> }>();
  for (const a of adds) {
    const at = a.p * ROWS + a.row;
    const before = perChannel(a.ch).filter((e) => e.row < at).pop();
    if (!before) { warnings.push(`${a.where}: no command of the module covers this row; not written`); continue; }
    const carrier = grid.blockRows[before.src.fp][before.src.cmd];
    const dur = carrier.period === REST ? (carrier.pan ?? 0) : (carrier.period ?? 0);
    const k = at - before.row;
    if (dur >= 0x80 || k >= dur) { warnings.push(`${a.where}: the command before it ends before this row (a rest the grid does not show); not written`); continue; }
    const sample = a.instrument > 0 ? a.instrument - 1 : before.src.sample;
    const nb = noteByte(a.note, sample);
    if (nb < 0) { warnings.push(`${a.where}: no note of the player's period table plays as note ${a.note} on sample ${sample + 1}; not written`); continue; }
    const key = `${before.src.fp}:${before.src.cmd}`;
    const g = cover.get(key) ?? { fp: before.src.fp, cmd: before.src.cmd, add: [] };
    g.add.push({ k, note: nb, sample, ins: before.src.sample });
    cover.set(key, g);
  }
  let out = new Uint8Array(source);
  let patched = 0;
  const moved = new Map<number, number>();
  const byBlock = new Map<number, Array<ReturnType<typeof cover.get> & object>>();
  for (const g of cover.values()) byBlock.set(g.fp, [...(byBlock.get(g.fp) ?? []), g]);
  for (const [fp, groups] of byBlock) {
    const addr = grid.filePatternAddrs[fp];
    const cmds = grid.blockRows[fp];
    let pos = addr;
    const bytes: number[][] = cmds.map((c) => { const b = Array.from(out.slice(pos, pos + (c.cutoff ?? 0))); pos += c.cutoff ?? 0; return b; });
    for (const g of groups.sort((x, y) => y.cmd - x.cmd)) {
      const old = bytes[g.cmd];
      const isRest = old[0] === REST;
      const total = isRest ? old[1] : old[0];
      const adding = g.add.sort((x, y) => x.k - y.k);
      const seq: number[][] = [isRest ? [REST, adding[0].k] : [adding[0].k, old[1]]];
      let inForce = adding[0].ins;
      adding.forEach((a, i) => {
        const len = (i + 1 < adding.length ? adding[i + 1].k : total) - a.k;
        if (a.sample !== inForce) { seq.push([SAMPLE_CHANGE, a.sample]); inForce = a.sample; }
        seq.push([len, a.note]);
      });
      if (inForce !== adding[0].ins) seq.push([SAMPLE_CHANGE, adding[0].ins]);
      bytes.splice(g.cmd, 1, ...seq);
    }
    // append the rebuilt block, word aligned, and repoint every track list entry that named the old one
    if (out.length % 2) out = Uint8Array.from([...out, 0]);
    const fresh = out.length;
    out = Uint8Array.from([...out, ...bytes.flat()]);
    moved.set(addr, fresh);
    patched += bytes.flat().length;
  }
  const dv = new DataView(out.buffer);
  for (const song of grid.walk.module.songs) {
    for (const list of song.tracks) {
      for (let tp = list; tp && tp + 4 <= out.length; tp += 4) {
        const v = dv.getUint32(tp);
        if (!v) break;
        const to = moved.get(v);
        if (to !== undefined) { dv.setUint32(tp, to); patched += 4; }
      }
    }
  }
  return { data: out, patched };
}

/** `subsong`: the song of the module's table the edited grid shows (the song's fileSubsongs.current). */
export function applyRhGridEdits(source: Uint8Array, edited: Pattern[], subsong = 0): RhEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const grid = buildRobHubbardGrid(source, subsong);
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
  const adds: RhAdd[] = [];
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
          // a cell the player ran no note or note-off command on: a note there splits the command that covers it
          if ((c.note ?? 0) > 0 && (c.note ?? 0) < 97) adds.push({ p, ch, row, note: c.note ?? 0, instrument: c.instrument ?? 0, where });
          else if ((c.note ?? 0) !== 0) warnings.push(`${where}: a note-off on a blank row is not written`);
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
  if (adds.length === 0) return { data: out, patched, warnings };
  const grown = growBlocks(out, grid, adds, noteByte, warnings);
  return { data: grown.data, patched: patched + grown.patched, warnings };
}
