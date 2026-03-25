/**
 * Hively adapter — Maps HivelyNativeData to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import type { HivelyNativeData } from '@/types/tracker';
import type { HivelyConfig } from '@/types/instrument';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number, transpose: number): string {
  if (note === 0) return '---';
  const t = note + transpose;
  if (t < 1 || t > 60) return '???';
  const n = t - 1;
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12)}`;
}

function fxToString(fx: number, param: number): string {
  if (fx === 0 && param === 0) return '000';
  return `${fx.toString(16).toUpperCase()}${param.toString(16).toUpperCase().padStart(2, '0')}`;
}

function hex2(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// Column definitions for Hively: Note | Inst | FX1 | FX2
export const HIVELY_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: 'var(--color-text-secondary)',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: (val: number) => noteToString(val, 0), // transpose applied during rendering
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
    formatter: hex2,
  },
  {
    key: 'fx1',
    label: 'Fx1',
    charWidth: 3,
    type: 'hex',
    color: '#ffaa55',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 3,
    formatter: (val: number) => fxToString((val >> 8) & 0xF, val & 0xFF),
  },
  {
    key: 'fx2',
    label: 'Fx2',
    charWidth: 3,
    type: 'hex',
    color: '#55aaff',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 3,
    formatter: (val: number) => fxToString((val >> 8) & 0xF, val & 0xFF),
  },
];

/**
 * Convert HivelyNativeData to FormatChannel[] for pattern editing.
 *
 * Hively stores a pool of reusable tracks. Each position entry references
 * one track per channel with an optional transpose value.
 */
export function hivelyToFormatChannels(
  nativeData: HivelyNativeData,
  currentPosition: number
): FormatChannel[] {
  const result: FormatChannel[] = [];
  const numCh = nativeData.channels || 4;

  // Get current position entry
  const posEntry = nativeData.positions?.[currentPosition];

  for (let ch = 0; ch < Math.min(numCh, 8); ch++) {
    const trackIdx = posEntry?.track?.[ch] ?? -1;
    const transpose = posEntry?.transpose?.[ch] ?? 0;

    // Build rows from track's steps array
    const rows: FormatCell[] = [];
    if (trackIdx >= 0 && trackIdx < nativeData.tracks.length) {
      const track = nativeData.tracks[trackIdx];
      const steps = track?.steps ?? [];
      for (let rowIdx = 0; rowIdx < steps.length; rowIdx++) {
        const step = steps[rowIdx];
        const note = step?.note ?? 0;
        const ins = step?.instrument ?? 0;
        // Pack fx + fxParam into a single value for the 3-digit hex column
        const fx1 = step ? ((step.fx & 0xF) << 8) | (step.fxParam & 0xFF) : 0;
        const fx2 = step ? ((step.fxb & 0xF) << 8) | (step.fxbParam & 0xFF) : 0;
        rows.push({ note, instrument: ins, fx1, fx2 });
      }
    }

    const patternLength = rows.length || 64;
    const label = trackIdx >= 0
      ? `CH${(ch + 1).toString().padStart(2, '0')}:T${trackIdx.toString().padStart(3, '0')}${transpose ? (transpose > 0 ? `+${transpose}` : `${transpose}`) : ''}`
      : `CH${(ch + 1).toString().padStart(2, '0')}`;

    result.push({ label, patternLength, rows, trackIndex: trackIdx >= 0 ? trackIdx : undefined, isPatternChannel: true });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Performance List Adapter
// ═══════════════════════════════════════════════════════════════════════════════

function hex1(val: number): string { return (val & 0xF).toString(16).toUpperCase(); }

/** Column definitions for the Hively performance list editor */
export const HIVELY_PERFLIST_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: 'var(--color-text-secondary)',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: (val: number) => noteToString(val, 0),
  },
  {
    key: 'fixed',
    label: 'F',
    charWidth: 1,
    type: 'hex',
    color: '#ffaa00',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 1,
    formatter: (val: number) => val ? '*' : '·',
  },
  {
    key: 'waveform',
    label: 'Wav',
    charWidth: 1,
    type: 'hex',
    color: '#aaddff',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 1,
    formatter: hex1,
  },
  {
    key: 'fx1',
    label: 'Fx1',
    charWidth: 1,
    type: 'hex',
    color: '#ffcc66',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 1,
    formatter: hex1,
  },
  {
    key: 'fxParam1',
    label: 'P1',
    charWidth: 2,
    type: 'hex',
    color: '#ffcc66',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'fx2',
    label: 'Fx2',
    charWidth: 1,
    type: 'hex',
    color: '#cc99ff',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 1,
    formatter: hex1,
  },
  {
    key: 'fxParam2',
    label: 'P2',
    charWidth: 2,
    type: 'hex',
    color: '#cc99ff',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
];

/**
 * Convert Hively performance list entries to a FormatChannel for PatternEditorCanvas.
 * Returns a single-channel array (the perf list is one sequence).
 */
export function hivelyPerfListToFormatChannel(config: HivelyConfig): FormatChannel[] {
  const entries = config.performanceList.entries;
  const rows: FormatCell[] = entries.map((e) => ({
    note: e.note,
    fixed: e.fixed ? 1 : 0,
    waveform: e.waveform,
    fx1: e.fx[0],
    fxParam1: e.fxParam[0],
    fx2: e.fx[1],
    fxParam2: e.fxParam[1],
  }));

  return [{
    label: 'Perf List',
    patternLength: entries.length,
    rows,
    isPatternChannel: false,
  }];
}

/**
 * Create an OnCellChange callback that updates the Hively config's performance list.
 */
export function makePerfListCellChange(
  config: HivelyConfig,
  onChange: (updates: Partial<HivelyConfig>) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    const entries = [...config.performanceList.entries];
    const entry = { ...entries[rowIdx] };

    switch (columnKey) {
      case 'note': entry.note = value; break;
      case 'fixed': entry.fixed = value !== 0; break;
      case 'waveform': entry.waveform = value; break;
      case 'fx1': entry.fx = [value, entry.fx[1]]; break;
      case 'fxParam1': entry.fxParam = [value, entry.fxParam[1]]; break;
      case 'fx2': entry.fx = [entry.fx[0], value]; break;
      case 'fxParam2': entry.fxParam = [entry.fxParam[0], value]; break;
    }

    entries[rowIdx] = entry;
    onChange({ performanceList: { ...config.performanceList, entries } });
  };
}
