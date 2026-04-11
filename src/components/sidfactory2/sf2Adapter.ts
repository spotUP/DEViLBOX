/**
 * sf2Adapter.ts — Maps SF2 store data to format-agnostic FormatChannel[].
 *
 * Follows the same pattern as gtuAdapter.ts — converts SF2-specific
 * sequence/order data into the shared PatternEditorCanvas format.
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';
import type { SF2SeqEvent, SF2OrderList } from '@/stores/useSF2Store';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

export function sf2NoteToString(note: number): string {
  if (note === 0) return '---';      // rest (matches original)
  if (note === 0x7E) return '+++';   // tie/hold (matches original)
  if (note >= 0x70) return '---';    // reserved
  const n = note - 1;
  const octave = Math.floor(n / 12);
  const name = NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

function sf2InstToString(val: number): string {
  if (val === 0 || val === 0x80) return '--'; // no change / empty
  if (val === 0x90) return '**';              // tie instrument (matches original)
  return (val & 0x1F).toString(16).toUpperCase().padStart(2, '0');
}

function sf2CmdToString(val: number): string {
  if (val === 0 || val === 0x80) return '--'; // no command / empty
  return (val & 0x3F).toString(16).toUpperCase().padStart(2, '0');
}

// Column definitions: Note | Instrument | Command
// Matches original SF2 editor display: "---" rest, "+++" tie, "--" empty
export const SF2_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#ff6666',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: sf2NoteToString,
  },
  {
    key: 'instrument',
    label: 'Ins',
    charWidth: 2,
    type: 'hex',
    color: '#60e060',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: sf2InstToString,
  },
  {
    key: 'command',
    label: 'Cmd',
    charWidth: 2,
    type: 'hex',
    color: '#ffcc00',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: sf2CmdToString,
  },
];

/**
 * Convert SF2 sequences + order lists to FormatChannel[] for the shared pattern editor.
 *
 * At a given order position, each track plays a specific sequence.
 * We look up each track's sequence and build a FormatChannel per track.
 */
export function sf2ToFormatChannels(
  trackCount: number,
  orderLists: SF2OrderList[],
  sequences: Map<number, SF2SeqEvent[]>,
  currentOrderPos: number,
): FormatChannel[] {
  const result: FormatChannel[] = [];
  let maxRows = 0;

  // First pass: find max sequence length at this position
  for (let t = 0; t < trackCount; t++) {
    const ol = orderLists[t];
    if (!ol || currentOrderPos >= ol.entries.length) continue;
    const seqIdx = ol.entries[currentOrderPos].seqIdx;
    const seq = sequences.get(seqIdx);
    if (seq && seq.length > maxRows) maxRows = seq.length;
  }
  if (maxRows === 0) maxRows = 64;

  for (let t = 0; t < trackCount; t++) {
    const ol = orderLists[t];
    const entry = ol && currentOrderPos < ol.entries.length ? ol.entries[currentOrderPos] : null;
    const seqIdx = entry?.seqIdx ?? 0;
    const seq = sequences.get(seqIdx);
    const rows: FormatCell[] = [];

    for (let r = 0; r < maxRows; r++) {
      if (seq && r < seq.length) {
        const ev = seq[r];
        rows.push({
          note: ev.note,
          instrument: ev.instrument,
          command: ev.command,
        });
      } else {
        rows.push({ note: 0, instrument: 0, command: 0 });
      }
    }

    const transStr = entry ? ` T${(((entry.transpose & 0x7F) - 0x20) | 0).toString(16).toUpperCase()}` : '';
    result.push({
      label: `CH${t + 1} S${String(seqIdx).padStart(2, '0')}${transStr}`,
      patternLength: maxRows,
      rows,
      isPatternChannel: true,
    });
  }

  return result;
}
