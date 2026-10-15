/**
 * Klystrack adapter — Maps KlysNativeData to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';
import type { KlysNativeData } from '@/types/tracker';

// Helper formatters
function noteToString(note: number): string {
  const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  if (note === 0xFF || note === 0) return '---';
  if (note === 0xFE || note === 97) return '===';
  if (note < 0 || note > 95) return '???';
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12)}`;
}

function ctrlToString(ctrl: number): string {
  if (ctrl === 0) return '.';
  if (ctrl & 1) return 'L';
  if (ctrl & 2) return 'S';
  if (ctrl & 4) return 'V';
  return ctrl.toString(16).toUpperCase();
}

function hex2(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, '0');
}

function hex4(val: number): string {
  return val.toString(16).toUpperCase().padStart(4, '0');
}

// Column definitions for klystrack: Note | Inst | Ctrl | Vol | Cmd
export const KLYS_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: 'var(--color-text-secondary)',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0xFF,
    formatter: noteToString,
  },
  {
    key: 'instrument',
    label: 'Ins',
    charWidth: 2,
    type: 'hex',
    color: '#60e060',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0xFF,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'ctrl',
    label: 'Ct',
    charWidth: 1,
    type: 'hex',
    color: '#ff66cc',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 1,
    formatter: ctrlToString,
  },
  {
    key: 'volume',
    label: 'Vol',
    charWidth: 2,
    type: 'hex',
    color: '#55aaff',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0xFF,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'command',
    label: 'Cmd',
    charWidth: 4,
    type: 'hex',
    color: '#ffaa55',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 4,
    formatter: hex4,
  },
];

/** The song rows the pattern view shows: one sequence step, from its first song row up to the next step. */
export interface KlysWindow {
  /** First song row of the step. */
  start: number;
  /** Song rows in the step (at least 1). */
  length: number;
}

/**
 * The window of song rows holding `songRow`: the sequence step (klysSequenceSteps) it falls in, up to the next
 * step or the end of the song. The pattern view draws these song rows; the matrix highlights the same step.
 */
export function klysWindowAt(nativeData: KlysNativeData, steps: readonly number[], songRow: number): KlysWindow {
  const i = klysStepIndexAt(steps, songRow);
  const start = steps[i] ?? 0;
  const end = steps[i + 1] ?? Math.max(nativeData.songLength, start + 1);
  return { start, length: Math.max(1, end - start) };
}

/**
 * Which pattern step channel `ch` plays at song row `songRow`: its last sequence entry at or before the row,
 * and the row's offset into that pattern. Null past the pattern's end or before the channel's first entry
 * (the channel is silent there).
 */
export function klysCellAt(
  nativeData: KlysNativeData, ch: number, songRow: number,
): { patternIdx: number; stepIdx: number; noteOffset: number } | null {
  let entry: { position: number; pattern: number; noteOffset: number } | null = null;
  for (const e of nativeData.sequences[ch]?.entries ?? []) {
    if (e.position <= songRow && (!entry || e.position >= entry.position)) entry = e;
  }
  if (!entry) return null;
  const pattern = nativeData.patterns[entry.pattern];
  const stepIdx = songRow - entry.position;
  if (!pattern || stepIdx >= pattern.numSteps) return null;
  return { patternIdx: entry.pattern, stepIdx, noteOffset: entry.noteOffset };
}

const EMPTY_CELL: FormatCell = { note: 0xFF, instrument: 0xFF, ctrl: 0, volume: 0xFF, command: 0 };

/**
 * The pattern view's channels for a window of song rows. Row r of every channel is song row window.start + r,
 * and each channel shows the step IT plays there (klysCellAt): klystrack channels start their patterns at their
 * own song rows, so a channel whose entry starts mid-step is drawn at its own offset, in line with what plays
 * (KLYS-CHANNEL-ROW-OFFSET: every channel used to be drawn from row 0 of its pattern, at channel 0's row).
 */
export function klysToFormatChannels(nativeData: KlysNativeData, window: KlysWindow): FormatChannel[] {
  const result: FormatChannel[] = [];
  for (let ch = 0; ch < nativeData.channels; ch++) {
    const rows: FormatCell[] = [];
    for (let r = 0; r < window.length; r++) {
      const at = klysCellAt(nativeData, ch, window.start + r);
      const step = at ? nativeData.patterns[at.patternIdx].steps[at.stepIdx] : undefined;
      rows.push(step
        ? { note: step.note, instrument: step.instrument, ctrl: step.ctrl, volume: step.volume, command: step.command }
        : EMPTY_CELL);
    }
    const head = klysCellAt(nativeData, ch, window.start);
    const transpose = head && head.noteOffset !== 0 ? ` ${head.noteOffset > 0 ? '+' : ''}${head.noteOffset}` : '';
    result.push({
      label: head ? `${ch + 1}: Pattern ${head.patternIdx}${transpose}` : `Channel ${ch + 1}`,
      patternLength: window.length,
      rows,
      isPatternChannel: true,
    });
  }
  return result;
}

/**
 * The rows of the klystrack sequence matrix: every song row at which some
 * channel's sequence starts a pattern, ascending (the union over channels).
 *
 * A klystrack sequence entry sits at a song ROW (KlysNativeSeqEntry.position),
 * not at an order index, and songLength counts rows. A matrix with one row per
 * song row is almost all empty slots - entries every 32/64 rows - and rides the
 * play head one step per ROW; one row per sequence step shows every entry and
 * steps once per pattern.
 */
export function klysSequenceSteps(nativeData: KlysNativeData): number[] {
  const set = new Set<number>();
  for (let ch = 0; ch < nativeData.channels; ch++) {
    for (const e of nativeData.sequences[ch]?.entries ?? []) set.add(e.position);
  }
  if (set.size === 0) set.add(0);
  return [...set].sort((a, b) => a - b);
}

/** The matrix row (index into `steps`) that holds song row `songRow`: the last step at or before it. */
export function klysStepIndexAt(steps: readonly number[], songRow: number): number {
  let lo = 0;
  let hi = steps.length - 1;
  if (hi < 0 || songRow < steps[0]) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (steps[mid] <= songRow) lo = mid; else hi = mid - 1;
  }
  return lo;
}
