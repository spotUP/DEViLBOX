/**
 * seanConranGrid.ts - Sean Conran (SCR.*) command streams as an editable tick grid.
 *
 * The Rob Hubbard recipe (docs/FORMAT_COMMAND_STREAM_GRID.md):
 *  - each stream (a track list entry's commands up to the command that reads the next entry, or a call target up to
 *    its return) decodes to one carrier cell per command on `blockRows`: cutoff = length, period/pan/resonance/
 *    envMod/flag1 = bytes 0..4. Concatenating the carriers gives the stream back byte for byte.
 *  - the display grid is carrier-less: one row per player tick, every voice walking its own track list.
 *
 * The command grammar mirrors third-party/nuade/players/seanconran/seanconran.c (run_command): the command byte is a
 * slot times 4, and the build's command table (sc_code.c, picked by the code hash through nw_scr_layout) names the
 * command of each slot. The build is never guessed here.
 */
import type { TrackerCell } from '@/types';
import type { ScrLayout } from '@/engine/nuade/nuadeScrLayout';

/** Bytes of each command, the opcode included (seanconran.c run_command). Next-stream commands and '-' take 1. */
const COMMAND_BYTES: Record<string, number> = {
  N: 3, O: 3, T: 2, E: 2, X: 2, V: 2, S: 2, M: 2, P: 3, Q: 3, C: 3, L: 3, A: 5, B: 5, R: 1,
};
const NEXT_COMMANDS = 'JKHGFDZ';
const MAX_BLOCK_COMMANDS = 4096;
/** shortcut: one pass of each track list is capped at this many ticks; raise it if a real song is cut. */
const MAX_PASS_TICKS = 64 * 512;
export const SCR_ROWS_PER_PATTERN = 64;

const blank = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function s16(buf: Uint8Array, at: number): number {
  if (at < 0 || at + 1 >= buf.length) return -1;
  return ((buf[at] << 8) | buf[at + 1]) << 16 >> 16;
}

/** The command letter of a byte for a voice: '' when the byte is no command (the replayer halts the voice). */
export function scrCommandLetter(layout: ScrLayout, voice: number, byte: number): string {
  if (byte % 4 !== 0 || byte / 4 >= 15) return '';
  return layout.commands[voice][byte / 4] ?? '';
}

export function scrCommandBytes(letter: string): number {
  return COMMAND_BYTES[letter] ?? 1;
}

/** Ticks a length byte holds the voice for. */
export function scrTicks(layout: ScrLayout, length: number): number {
  return layout.lengthEndsAtZero ? (length === 0 ? 256 : length) : length + 1;
}

/** The pitch bias as a shown note: the period table index plus 1 (not a measured pitch). */
export function scrBiasToNote(layout: ScrLayout, bias: number): number {
  const index = layout.pitchIndexBytes ? bias >> 1 : bias;
  return index + 1 <= 96 ? index + 1 : 0;
}

export function scrNoteToBias(layout: ScrLayout, note: number): number {
  return layout.pitchIndexBytes ? (note - 1) << 1 : note - 1;
}

/** One stream as carrier cells, from `start` to and including its ending command. */
export function decodeScrBlock(
  buf: Uint8Array, layout: ScrLayout, voice: number, start: number, subroutine: boolean,
): { rows: TrackerCell[]; size: number; calls: number[] } {
  const rows: TrackerCell[] = [];
  const calls: number[] = [];
  let at = start;
  for (let i = 0; i < MAX_BLOCK_COMMANDS && at < buf.length; i++) {
    const letter = scrCommandLetter(layout, voice, buf[at]);
    const len = Math.min(letter ? scrCommandBytes(letter) : 1, buf.length - at);
    const cell = blank();
    cell.cutoff = len;
    cell.period = buf[at];
    if (len >= 2) cell.pan = buf[at + 1];
    if (len >= 3) cell.resonance = buf[at + 2];
    if (len >= 4) cell.envMod = buf[at + 3];
    if (len >= 5) cell.flag1 = buf[at + 4];
    rows.push(cell);
    if (letter === 'C') {
      const target = s16(buf, at + 1);
      if (target >= 0) calls.push(target);
    }
    at += len;
    if (!letter || letter === '-' || NEXT_COMMANDS.includes(letter) || (subroutine && letter === 'R')) break;
  }
  return { rows, size: at - start, calls };
}

export interface ScrGrid {
  filePatternAddrs: number[];
  filePatternSizes: number[];
  blockRows: TrackerCell[][];
  /** timeline[voice][tick]: the shown cell. */
  timeline: TrackerCell[][];
  /** biasAt[voice][tick]: the file offset of the pitch bias byte of the note starting on that tick, or -1. */
  biasAt: number[][];
  /** blockAt[voice][tick]: the file pattern (stream) that tick plays, or -1. */
  blockAt: number[][];
  ticks: number;
  instrumentCount: number;
}

interface ScrEvent { ticks: number; note: number; instrument: number; bias: number; fp: number }

/** Decode every stream of one subsong and lay the voices on one tick timeline. */
export function buildScrGrid(buf: Uint8Array, layout: ScrLayout, subsong: number): ScrGrid {
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const blockRows: TrackerCell[][] = [];
  const fpByKey = new Map<string, number>();
  const block = (voice: number, addr: number, subroutine: boolean): number => {
    const key = `${voice}:${addr}`;
    const known = fpByKey.get(key);
    if (known !== undefined) return known;
    const fp = filePatternAddrs.length;
    fpByKey.set(key, fp);
    const d = decodeScrBlock(buf, layout, voice, addr, subroutine);
    filePatternAddrs.push(addr);
    filePatternSizes.push(d.size);
    blockRows.push(d.rows);
    for (const target of d.calls) block(voice, target, true);
    return fp;
  };

  const samples = new Map<number, number>();
  const instrumentOf = (offset: number): number => {
    let n = samples.get(offset);
    if (n === undefined) { n = samples.size + 1; samples.set(offset, n); }
    return n;
  };

  const lists = layout.trackLists[subsong] ?? layout.trackLists[0];
  const passes: ScrEvent[][] = [];
  for (let voice = 0; voice < 4; voice++) {
    const events: ScrEvent[] = [];
    let ticks = 0;
    let instrument = 0;
    let lastNote = 0;
    let at = lists[voice];
    const scale = layout.entriesDoubled ? 2 : 1;
    for (let entries = 0; at >= 0 && at < buf.length && ticks < MAX_PASS_TICKS && entries < 4096; entries++) {
      const entry = buf[at++];
      if (entry & 0x80) break; // the marker: the list loops from here
      let pc = s16(buf, layout.trackTables[voice] + scale * entry);
      if (pc < 0) break;
      let fp = block(voice, pc, false);
      let callReturn = -1;
      let callerFp = -1;
      let ended = false;
      for (let steps = 0; steps < MAX_BLOCK_COMMANDS && pc < buf.length && ticks < MAX_PASS_TICKS; steps++) {
        const letter = scrCommandLetter(layout, voice, buf[pc]);
        if (!letter || letter === '-') { ended = true; break; } // the replayer halts the voice
        if (NEXT_COMMANDS.includes(letter)) break;
        const len = scrCommandBytes(letter);
        if (letter === 'N' || letter === 'O') {
          lastNote = scrBiasToNote(layout, buf[pc + 1]);
          const t = scrTicks(layout, buf[pc + 2]);
          events.push({ ticks: t, note: lastNote, instrument, bias: pc + 1, fp });
          ticks += t;
        } else if (letter === 'T' || letter === 'E' || letter === 'X') {
          const t = scrTicks(layout, buf[pc + 1]);
          // E restarts the sample at the held pitch, X mutes, T holds
          const note = letter === 'E' ? lastNote : letter === 'X' ? 97 : 0;
          events.push({ ticks: t, note, instrument: letter === 'E' ? instrument : 0, bias: -1, fp });
          ticks += t;
        } else if (letter === 'A' || letter === 'B') {
          instrument = instrumentOf((buf[pc + 2] << 16) | (buf[pc + 3] << 8) | buf[pc + 4]);
        } else if (letter === 'L') {
          instrument = instrumentOf(s16(buf, pc + 1));
        } else if (letter === 'C') {
          const target = s16(buf, pc + 1);
          if (target < 0) { ended = true; break; }
          callReturn = pc + len;
          callerFp = fp;
          fp = block(voice, target, true);
          pc = target;
          continue;
        } else if (letter === 'R' && callReturn >= 0) {
          pc = callReturn;
          fp = callerFp;
          callReturn = -1;
          continue;
        }
        pc += len;
      }
      if (ended) break;
    }
    passes.push(events);
  }

  const passTicks = passes.map((events) => events.reduce((n, e) => n + e.ticks, 0));
  const total = Math.max(1, ...passTicks);
  const timeline: TrackerCell[][] = [];
  const biasAt: number[][] = [];
  const blockAt: number[][] = [];
  for (let voice = 0; voice < 4; voice++) {
    const cells = Array.from({ length: total }, blank);
    const bias = new Array<number>(total).fill(-1);
    const blocks = new Array<number>(total).fill(-1);
    const events = passes[voice];
    // each voice loops its own list to the longest pass, so no voice falls silent
    for (let tick = 0, i = 0; passTicks[voice] > 0 && tick < total; i = (i + 1) % events.length) {
      const e = events[i];
      const end = Math.min(total, tick + e.ticks);
      if (e.note) cells[tick] = { ...blank(), note: e.note, instrument: e.instrument };
      bias[tick] = e.bias;
      for (let t = tick; t < end; t++) blocks[t] = e.fp;
      // a release marker on the last row of a held note keeps a sustained voice readable
      if (e.note > 0 && e.note !== 97 && end - 1 > tick) cells[end - 1] = { ...blank(), note: 97 };
      tick = end;
    }
    timeline.push(cells);
    biasAt.push(bias);
    blockAt.push(blocks);
  }
  return {
    filePatternAddrs, filePatternSizes, blockRows, timeline, biasAt, blockAt, ticks: total,
    instrumentCount: Math.max(1, samples.size),
  };
}
