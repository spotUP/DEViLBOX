/**
 * cheeseCutterAdapter.ts — Maps CheeseCutter store data to format-agnostic FormatChannel[].
 *
 * Follows the same pattern as sf2Adapter.ts / gtuAdapter.ts — converts CC-specific
 * sequence/track list data into the shared PatternEditorCanvas format.
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';
import type { CCSequenceRow, CCTrackListEntry } from '@/stores/useCheeseCutterStore';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/**
 * Convert a CheeseCutter note value to display string.
 * CheeseCutter note encoding: 0='---', 1='OFF', 2='ON', 3=C-0, 4=C#0, ... (12 per octave starting from 3)
 */
export function ccNoteToString(note: number): string {
  if (note === 0) return '---';
  if (note === 1) return 'OFF';
  if (note === 2) return 'ON ';
  if (note < 3) return '???';
  const n = note - 3;
  const octave = Math.floor(n / 12);
  const name = NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

function ccHex2(val: number): string {
  if (val === 0) return '..';
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// Column definitions: Note | Instrument | Command
export const CC_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#ff6666',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: ccNoteToString,
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
    formatter: ccHex2,
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
    formatter: ccHex2,
  },
];

/**
 * Convert CheeseCutter sequences + track lists to FormatChannel[] for the shared pattern editor.
 *
 * At a given order position, each voice (0-2) references a sequence via its track list.
 * We look up each voice's sequence and build a FormatChannel per voice.
 */
export function cheeseCutterToFormatChannels(
  sequences: Array<{ rows: CCSequenceRow[] }>,
  trackLists: Array<CCTrackListEntry[]>,
  currentOrderPos: number,
): FormatChannel[] {
  const result: FormatChannel[] = [];
  const voiceCount = Math.min(trackLists.length, 3);
  let maxRows = 0;

  // First pass: find max sequence length at this position
  for (let v = 0; v < voiceCount; v++) {
    const tl = trackLists[v];
    if (!tl || currentOrderPos >= tl.length) continue;
    const entry = tl[currentOrderPos];
    if (entry.isEnd) continue;
    const seq = sequences[entry.sequence];
    if (seq && seq.rows.length > maxRows) maxRows = seq.rows.length;
  }
  if (maxRows === 0) maxRows = 64;

  for (let v = 0; v < voiceCount; v++) {
    const tl = trackLists[v];
    const entry = tl && currentOrderPos < tl.length ? tl[currentOrderPos] : null;
    const seqIdx = entry && !entry.isEnd ? entry.sequence : -1;
    const seq = seqIdx >= 0 && seqIdx < sequences.length ? sequences[seqIdx] : null;
    const transpose = entry ? entry.transpose : 0;
    const rows: FormatCell[] = [];

    for (let r = 0; r < maxRows; r++) {
      if (seq && r < seq.rows.length) {
        const ev = seq.rows[r];
        rows.push({
          note: ev.note,
          instrument: ev.instrument,
          command: ev.command,
        });
      } else {
        rows.push({ note: 0, instrument: 0, command: 0 });
      }
    }

    const transLabel = transpose !== 0 ? ` T${transpose > 0 ? '+' : ''}${transpose}` : '';
    const seqLabel = seqIdx >= 0 ? seqIdx.toString(16).toUpperCase().padStart(2, '0') : '--';
    result.push({
      label: `CH${v + 1} S${seqLabel}${transLabel}`,
      patternLength: maxRows,
      rows,
      isPatternChannel: true,
    });
  }

  return result;
}
