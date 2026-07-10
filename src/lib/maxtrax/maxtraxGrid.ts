import type { MaxTraxScore, MaxTraxEvent } from '@/lib/import/formats/maxtrax/maxtraxFormat';
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

// ---------------------------------------------------------------------------
// Edit ops — all pure: take a MaxTraxScore, return a NEW MaxTraxScore, never mutate input.
// ---------------------------------------------------------------------------

const clampU16 = (n: number) => Math.max(0, Math.min(0xffff, Math.round(n)));
const cloneEvents = (score: MaxTraxScore): MaxTraxEvent[] => score.events.map((e) => ({ ...e }));

/** Exported helper: accumulate startTime deltas into absolute ticks. */
export function absoluteTicksOf(score: MaxTraxScore): number[] {
  const t = new Array<number>(score.events.length);
  let cur = 0;
  for (let i = 0; i < score.events.length; i++) { cur += score.events[i].startTime; t[i] = cur; }
  return t;
}

export function setNoteField(score: MaxTraxScore, eventIndex: number, patch: { pitch?: number; velocity?: number; channel?: number }): MaxTraxScore {
  const events = cloneEvents(score);
  const e = events[eventIndex];
  if (patch.pitch !== undefined) e.command = patch.pitch & 0x7f;
  const vel = patch.velocity ?? ((e.data >> 4) & 0x0f);
  const ch = patch.channel ?? (e.data & 0x0f);
  e.data = ((vel & 0x0f) << 4) | (ch & 0x0f);
  return { events };
}

export function setNoteDuration(score: MaxTraxScore, eventIndex: number, durationTicks: number): MaxTraxScore {
  const events = cloneEvents(score);
  events[eventIndex].stopTime = Math.max(1, clampU16(durationTicks));
  return { events };
}

export function setEffectField(score: MaxTraxScore, eventIndex: number, patch: { data?: number; stopTime?: number }): MaxTraxScore {
  const events = cloneEvents(score);
  const e = events[eventIndex];
  if (patch.data !== undefined) e.data = patch.data & 0xff;
  if (patch.stopTime !== undefined) e.stopTime = clampU16(patch.stopTime);
  return { events };
}

/**
 * Move one event to newAbsTick. Since startTime is a delta, changing event i's
 * delta shifts every later event; to keep all OTHER absolute ticks fixed we also
 * adjust event i+1's delta by the opposite amount. Deltas are clamped to [0, 0xffff];
 * the moved event cannot precede the previous event.
 */
export function moveNote(score: MaxTraxScore, eventIndex: number, newAbsTick: number): MaxTraxScore {
  const abs = absoluteTicksOf(score);
  const events = cloneEvents(score);
  const prevAbs = eventIndex > 0 ? abs[eventIndex - 1] : 0;
  const target = Math.max(prevAbs, newAbsTick); // cannot precede the previous event
  const delta = target - abs[eventIndex];
  events[eventIndex].startTime = clampU16(events[eventIndex].startTime + delta);
  if (eventIndex + 1 < events.length) {
    events[eventIndex + 1].startTime = clampU16(events[eventIndex + 1].startTime - delta);
  }
  return { events };
}
