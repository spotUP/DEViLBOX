/**
 * FC adapter — Maps FCConfig synth macro and arpeggio tables to FormatChannel[]
 * for rendering in PatternEditorCanvas.
 */

import type { ColumnDef, FormatCell, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import type { FCConfig } from '@/types/instrument';

function hex1(val: number): string {
  return (val & 0xF).toString(16).toUpperCase();
}

function hex2signed(val: number): string {
  // Display signed values as two hex digits (two's complement)
  const byte = val < 0 ? (val + 256) & 0xFF : val & 0xFF;
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function hex2(val: number): string {
  return (val & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Synth Macro Table
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Column definitions for the FC synth macro table.
 * Columns: Waveform (1 hex digit), Transposition (2 hex digits signed), Effect (2 hex digits)
 */
export const FC_SYNTH_MACRO_COLUMNS: ColumnDef[] = [
  {
    key: 'waveNum',
    label: 'Wav',
    charWidth: 1,
    type: 'hex',
    color: '#66ccff',       // Light blue — waveform
    emptyColor: '#334455',
    emptyValue: 0,
    hexDigits: 1,
    formatter: hex1,
  },
  {
    key: 'transposition',
    label: 'Trn',
    charWidth: 2,
    type: 'hex',
    color: '#ffcc44',       // Yellow — transposition
    emptyColor: '#334455',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2signed,
  },
  {
    key: 'effect',
    label: 'FX',
    charWidth: 2,
    type: 'hex',
    color: '#ff8844',       // Orange — effect
    emptyColor: '#334455',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
];

/**
 * Convert FCConfig synth macro table to a single FormatChannel for PatternEditorCanvas.
 */
export function fcSynthMacroToFormatChannel(config: FCConfig): FormatChannel[] {
  const rows: FormatCell[] = config.synthTable.map((step) => ({
    waveNum: step.waveNum,
    transposition: step.transposition < 0 ? (step.transposition + 256) & 0xFF : step.transposition & 0xFF,
    effect: step.effect,
  }));

  return [{
    label: 'Synth Macro',
    patternLength: config.synthTable.length,
    rows,
    isPatternChannel: false,
  }];
}

/**
 * Create an OnCellChange callback for the synth macro table.
 */
export function makeSynthMacroCellChange(
  config: FCConfig,
  onChange: (updates: Partial<FCConfig>) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    const table = [...config.synthTable];
    const step = { ...table[rowIdx] };

    switch (columnKey) {
      case 'waveNum':
        step.waveNum = value & 0xF;
        break;
      case 'transposition': {
        // Convert unsigned hex back to signed (-64..63)
        const signed = value > 127 ? value - 256 : value;
        step.transposition = Math.max(-64, Math.min(63, signed));
        break;
      }
      case 'effect':
        step.effect = value & 0xFF;
        break;
    }

    table[rowIdx] = step;
    onChange({ synthTable: table });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Arpeggio Table
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Column definitions for the FC arpeggio table.
 * Single column: Semitone offset (2 hex digits signed)
 */
export const FC_ARPEGGIO_COLUMNS: ColumnDef[] = [
  {
    key: 'semitone',
    label: 'Semi',
    charWidth: 2,
    type: 'hex',
    color: '#88ff88',       // Green — semitone offset
    emptyColor: '#334455',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2signed,
  },
];

/**
 * Convert FCConfig arpeggio table to a single FormatChannel for PatternEditorCanvas.
 */
export function fcArpeggioToFormatChannel(config: FCConfig): FormatChannel[] {
  const rows: FormatCell[] = config.arpTable.map((v) => ({
    semitone: v < 0 ? (v + 256) & 0xFF : v & 0xFF,
  }));

  return [{
    label: 'Arpeggio',
    patternLength: config.arpTable.length,
    rows,
    isPatternChannel: false,
  }];
}

/**
 * Create an OnCellChange callback for the arpeggio table.
 */
export function makeArpeggioCellChange(
  config: FCConfig,
  onChange: (updates: Partial<FCConfig>) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, _columnKey: string, value: number) => {
    const arr = [...config.arpTable];
    // Convert unsigned hex back to signed (-64..63)
    const signed = value > 127 ? value - 256 : value;
    arr[rowIdx] = Math.max(-64, Math.min(63, signed));
    onChange({ arpTable: arr });
  };
}
