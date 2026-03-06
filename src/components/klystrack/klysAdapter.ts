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
    color: '#e0e0e0',
    emptyColor: '#333',
    emptyValue: 0xFF,
    formatter: noteToString,
  },
  {
    key: 'instrument',
    label: 'Ins',
    charWidth: 2,
    type: 'hex',
    color: '#60e060',
    emptyColor: '#333',
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
    emptyColor: '#333',
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
    emptyColor: '#333',
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
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 4,
    formatter: hex4,
  },
];

/**
 * Convert KlysNativeData at a song position to FormatChannel[] for pattern editing.
 *
 * For each channel, finds the last sequence entry at or before currentPosition,
 * then maps that pattern's steps to FormatCell[] using column keys.
 */
export function klysToFormatChannels(
  nativeData: KlysNativeData,
  currentPosition: number
): FormatChannel[] {
  const result: FormatChannel[] = [];

  for (let ch = 0; ch < nativeData.channels; ch++) {
    // Find the pattern assigned to this channel at currentPosition
    const seq = nativeData.sequences[ch];
    let patternIdx = -1;
    let noteOffset = 0;

    if (seq) {
      // Find last sequence entry at or before currentPosition
      for (const entry of seq.entries) {
        if (entry.position <= currentPosition) {
          patternIdx = entry.pattern;
          noteOffset = entry.noteOffset;
        }
      }
    }

    // Build channel rows
    const rows: FormatCell[] = [];
    if (patternIdx >= 0 && patternIdx < nativeData.patterns.length) {
      const pattern = nativeData.patterns[patternIdx];
      for (let rowIdx = 0; rowIdx < pattern.numSteps; rowIdx++) {
        const step = pattern.steps[rowIdx];
        if (step) {
          rows.push({
            note: step.note,
            instrument: step.instrument,
            ctrl: step.ctrl,
            volume: step.volume,
            command: step.command,
          });
        } else {
          // Empty step
          rows.push({
            note: 0xFF,
            instrument: 0xFF,
            ctrl: 0,
            volume: 0xFF,
            command: 0,
          });
        }
      }
    }

    // Fallback pattern length
    const patternLength = rows.length || 64;

    // Build label
    const trStr = noteOffset === 0 ? '' : (noteOffset > 0 ? `+${noteOffset}` : `${noteOffset}`);
    const label = patternIdx >= 0
      ? `CH${(ch + 1).toString().padStart(2, '0')}:P${patternIdx.toString().padStart(3, '0')}${trStr ? ` ${trStr}` : ''}`
      : `CH${(ch + 1).toString().padStart(2, '0')}`;

    result.push({
      label,
      patternLength,
      rows,
    });
  }

  return result;
}
