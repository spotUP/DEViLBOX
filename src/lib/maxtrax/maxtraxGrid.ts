import type { MaxTraxScore } from '@/lib/import/formats/maxtrax/maxtraxFormat';
import type { GridColumn, GridNoteCell, GridEffectCell, MaxTraxGrid } from './maxtraxGrid.types';

export type { GridColumn, GridNoteCell, GridEffectCell, MaxTraxGrid } from './maxtraxGrid.types';

const NOTE_MAX = 0x7f;
const CMD_END = 0xff;
const channelOf = (command: number, data: number): number | 'global' => {
  if (command <= NOTE_MAX) return data & 0x0f;         // note: channel in data lo-nibble
  if (command >= 0xb0 && command < 0xf0) return data & 0x0f; // CC/prog/bend carry channel in data
  return 'global';                                     // tempo(0x80)/special(0xA0)/end(0xFF)
};

/** Accumulate startTime deltas into an absolute tick per event (max.asm:1343-1348). */
function absoluteTicks(score: MaxTraxScore): number[] {
  const t = new Array<number>(score.events.length);
  let cur = 0;
  for (let i = 0; i < score.events.length; i++) { cur += score.events[i].startTime; t[i] = cur; }
  return t;
}

export function deriveGrid(score: MaxTraxScore, ticksPerRow: number): MaxTraxGrid {
  const TPR = Math.max(1, ticksPerRow);
  const abs = absoluteTicks(score);

  // Greedy voice allocation: per channel, a list of columns each tracking the
  // absolute tick at which its current note ends. A note reuses the lowest column
  // whose previous note has ended (endTick <= this note's start).
  const columns: GridColumn[] = [];
  const colEnd: number[] = [];                 // parallel to columns: end tick of the last note placed
  const colByChannel = new Map<number, number[]>(); // channel -> column indices, in voice order
  const noteCells: GridNoteCell[] = [];
  const effectCells: GridEffectCell[] = [];
  let maxRow = 0;

  for (let i = 0; i < score.events.length; i++) {
    const ev = score.events[i];
    if (ev.command === CMD_END) { effectCells.push({ eventIndex: i, channel: 'global', row: Math.floor(abs[i]/TPR), offset: abs[i]%TPR, command: ev.command, data: ev.data, stopTime: ev.stopTime }); maxRow = Math.max(maxRow, Math.floor(abs[i]/TPR)); continue; }
    const ch = channelOf(ev.command, ev.data);

    if (ev.command <= NOTE_MAX) {
      const channel = ch as number;
      const start = abs[i];
      const end = start + ev.stopTime;
      let cols = colByChannel.get(channel);
      if (!cols) { cols = []; colByChannel.set(channel, cols); }
      let colIdx = cols.find((c) => colEnd[c] <= start);
      if (colIdx === undefined) {
        colIdx = columns.length;
        columns.push({ channel, voice: cols.length });
        colEnd.push(-1);
        cols.push(colIdx);
      }
      colEnd[colIdx] = end;
      const velocity = (ev.data >> 4) & 0x0f;
      const onRow = Math.floor(start / TPR), offRow = Math.floor(end / TPR);
      noteCells.push({ kind: 'noteOn',  eventIndex: i, column: colIdx, row: onRow,  offset: start % TPR, pitch: ev.command, velocity, channel, duration: ev.stopTime });
      noteCells.push({ kind: 'noteOff', eventIndex: i, column: colIdx, row: offRow, offset: end % TPR,   pitch: ev.command, velocity, channel, duration: ev.stopTime });
      maxRow = Math.max(maxRow, offRow);
    } else {
      const row = Math.floor(abs[i] / TPR);
      effectCells.push({ eventIndex: i, channel: ch, row, offset: abs[i] % TPR, command: ev.command, data: ev.data, stopTime: ev.stopTime });
      maxRow = Math.max(maxRow, row);
    }
  }

  // Sort columns for stable display: by channel, then voice.
  const order = columns.map((_, i) => i).sort((a, b) => columns[a].channel - columns[b].channel || columns[a].voice - columns[b].voice);
  const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  const sortedColumns = order.map((i) => columns[i]);
  for (const c of noteCells) c.column = remap.get(c.column)!;

  return { ticksPerRow: TPR, rowCount: maxRow + 1, columns: sortedColumns, noteCells, effectCells };
}
