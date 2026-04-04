/**
 * MusicLine adapter — Maps MusicLine pattern data to format-agnostic FormatChannel[].
 *
 * MusicLine patterns are per-part (not per-channel): each channel independently
 * selects a part index from its track table at the current song position.
 * The adapter resolves each channel's part and assembles FormatChannel[].
 *
 * Cell layout in TrackerStore: note, instrument, effTyp/eff (slot 0),
 * effTyp2/eff2 (slot 1), effTyp3/eff3 (slot 2), effTyp4/eff4 (slot 3),
 * effTyp5/eff5 (slot 4) — 5 effect slots total.
 */

import type { ColumnDef, FormatCell, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import type { Pattern } from '@/types/tracker';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';
import { useTrackerStore } from '@stores';

// --------------------------------------------------------------------------
// Note / hex formatters
// --------------------------------------------------------------------------

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (!note) return '---';
  if (note === 97) return '==='; // note-off
  const n = note - 1;
  return NOTE_NAMES[n % 12] + Math.floor(n / 12);
}

function hex2(val: number): string {
  if (val === 0) return '..';
  return val.toString(16).toUpperCase().padStart(2, '0');
}

function fxToString(val: number): string {
  if (val === 0) return '...';
  // val encodes type in high nibble, param in low byte: 0xTPP
  const typ = (val >> 8) & 0xF;
  const par = val & 0xFF;
  return typ.toString(16).toUpperCase() + par.toString(16).toUpperCase().padStart(2, '0');
}

// --------------------------------------------------------------------------
// Column definitions: Note | Inst | FX1 | FX2 | FX3 | FX4 | FX5
// --------------------------------------------------------------------------

const COL_COLORS = {
  note: '#cccccc',
  inst: '#ffaa44',
  fx:   '#66aaff',
};

export const MUSICLINE_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: COL_COLORS.note,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: noteToString,
  },
  {
    key: 'instrument',
    label: 'Ins',
    charWidth: 2,
    type: 'hex',
    color: COL_COLORS.inst,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'fx0',
    label: 'FX1',
    charWidth: 3,
    type: 'hex',
    color: COL_COLORS.fx,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 3,
    formatter: fxToString,
  },
  {
    key: 'fx1',
    label: 'FX2',
    charWidth: 3,
    type: 'hex',
    color: COL_COLORS.fx,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 3,
    formatter: fxToString,
  },
  {
    key: 'fx2',
    label: 'FX3',
    charWidth: 3,
    type: 'hex',
    color: COL_COLORS.fx,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 3,
    formatter: fxToString,
  },
  {
    key: 'fx3',
    label: 'FX4',
    charWidth: 3,
    type: 'hex',
    color: COL_COLORS.fx,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 3,
    formatter: fxToString,
  },
  {
    key: 'fx4',
    label: 'FX5',
    charWidth: 3,
    type: 'hex',
    color: COL_COLORS.fx,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 3,
    formatter: fxToString,
  },
];

// --------------------------------------------------------------------------
// Effect slot key pairs on TrackerCell
// --------------------------------------------------------------------------

const FX_KEYS: Array<[string, string]> = [
  ['effTyp', 'eff'],
  ['effTyp2', 'eff2'],
  ['effTyp3', 'eff3'],
  ['effTyp4', 'eff4'],
  ['effTyp5', 'eff5'],
];

// --------------------------------------------------------------------------
// Convert store data to FormatChannel[]
// --------------------------------------------------------------------------

/**
 * Build FormatChannel[] from the TrackerStore pattern data.
 *
 * @param channelTrackTables - per-channel track tables (part index per position)
 * @param patterns - all patterns (parts) from the TrackerStore
 * @param currentPos - current song position index
 */
export function musiclineToFormatChannels(
  channelTrackTables: number[][],
  patterns: Pattern[],
  currentPos: number,
): FormatChannel[] {
  const result: FormatChannel[] = [];

  for (let ch = 0; ch < channelTrackTables.length; ch++) {
    const partIdx = channelTrackTables[ch][currentPos] ?? 0;
    const pat = patterns[partIdx];
    const numRows = pat?.length ?? 128;
    const rows: FormatCell[] = [];

    for (let row = 0; row < numRows; row++) {
      const cell = pat?.channels[0]?.rows[row];
      if (cell) {
        const cellData = cell as unknown as Record<string, number>;
        // Pack each effect slot as type*256 + param (0xTPP)
        const fxValues: Record<string, number> = {};
        for (let f = 0; f < FX_KEYS.length; f++) {
          const typ = cellData[FX_KEYS[f][0]] ?? 0;
          const par = cellData[FX_KEYS[f][1]] ?? 0;
          fxValues[`fx${f}`] = typ ? (typ << 8) | par : (par ? par : 0);
        }
        rows.push({
          note: cell.note ?? 0,
          instrument: cell.instrument ?? 0,
          ...fxValues,
        });
      } else {
        rows.push({ note: 0, instrument: 0, fx0: 0, fx1: 0, fx2: 0, fx3: 0, fx4: 0 });
      }
    }

    result.push({
      label: `CH${(ch + 1).toString().padStart(2, '0')} P:${partIdx.toString().padStart(2, '0')}`,
      patternLength: numRows,
      rows,
      isPatternChannel: true,
    });
  }

  return result;
}

// --------------------------------------------------------------------------
// Cell change callback factory
// --------------------------------------------------------------------------

/**
 * Create an OnCellChange callback that writes edits back to the TrackerStore
 * and syncs to the MusicLine WASM engine.
 */
export function makeMusicLineCellChange(
  channelTrackTables: number[][],
  currentPos: number,
): OnCellChange {
  return (channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    if (!channelTrackTables[channelIdx]) return;
    const partIdx = channelTrackTables[channelIdx][currentPos] ?? 0;
    const store = useTrackerStore.getState();
    const pat = store.patterns[partIdx];
    if (!pat?.channels[0]?.rows[rowIdx]) return;

    const cell = pat.channels[0].rows[rowIdx];
    const cellData = cell as unknown as Record<string, number>;

    if (columnKey === 'note') {
      cell.note = value;
    } else if (columnKey === 'instrument') {
      cell.instrument = value;
    } else if (columnKey.startsWith('fx')) {
      const fxIndex = parseInt(columnKey.slice(2), 10);
      if (fxIndex >= 0 && fxIndex < FX_KEYS.length) {
        const [typKey, parKey] = FX_KEYS[fxIndex];
        cellData[typKey] = (value >> 8) & 0xF;
        cellData[parKey] = value & 0xFF;
      }
    }

    // Sync to WASM engine
    try {
      const engineCell: { note?: number; inst?: number; fx?: number[] } = {};
      if (columnKey === 'note') {
        engineCell.note = value;
      } else if (columnKey === 'instrument') {
        engineCell.inst = value;
      } else if (columnKey.startsWith('fx')) {
        // Build full fx array for engine
        const fxArr: number[] = [];
        for (let i = 0; i < FX_KEYS.length; i++) {
          fxArr.push(cellData[FX_KEYS[i][0]] ?? 0);
          fxArr.push(cellData[FX_KEYS[i][1]] ?? 0);
        }
        engineCell.fx = fxArr;
      }
      MusicLineEngine.getInstance().setPatternCell(partIdx, rowIdx, engineCell);
    } catch {
      // Engine may not be running
    }

    // Force store re-render
    useTrackerStore.setState((s) => ({ patterns: [...s.patterns] }));
  };
}
