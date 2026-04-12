/**
 * PreTracker adapter — Maps instrument command patterns to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import type { PreTrackerInstPattern } from '@/engine/pretracker/PreTrackerEngine';
import { PreTrackerEngine } from '@/engine/pretracker/PreTrackerEngine';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0) return '---';
  const n = note - 1;
  if (n < 0 || n >= 60) return '???';
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12)}`;
}

function hex1(val: number): string { return (val & 0xF).toString(16).toUpperCase(); }
function hex2(val: number): string { return val.toString(16).toUpperCase().padStart(2, '0'); }

export const PRETRACKER_INSTSEQ_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#ffffff',
    emptyColor: '#443322',
    emptyValue: 0,
    formatter: (val: number) => noteToString(val),
  },
  {
    key: 'stitch',
    label: 'S',
    charWidth: 1,
    type: 'hex',
    color: '#ffcc00',
    emptyColor: '#443322',
    emptyValue: 0,
    hexDigits: 1,
    formatter: (val: number) => val ? 'S' : '.',
  },
  {
    key: 'pin',
    label: 'P',
    charWidth: 1,
    type: 'hex',
    color: '#ff8866',
    emptyColor: '#443322',
    emptyValue: 0,
    hexDigits: 1,
    formatter: (val: number) => val ? 'P' : '.',
  },
  {
    key: 'cmd',
    label: 'Cmd',
    charWidth: 1,
    type: 'hex',
    color: '#88ccff',
    emptyColor: '#443322',
    emptyValue: 0,
    hexDigits: 1,
    formatter: hex1,
  },
  {
    key: 'cmdData',
    label: 'Val',
    charWidth: 2,
    type: 'hex',
    color: '#88ccff',
    emptyColor: '#443322',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
];

export function instPatternToFormatChannel(
  pattern: PreTrackerInstPattern | null,
  instName: string,
): FormatChannel[] {
  if (!pattern || pattern.steps === 0) {
    return [{
      label: instName || 'Cmd Seq',
      patternLength: 0,
      rows: [],
      isPatternChannel: false,
    }];
  }

  const rows: FormatCell[] = pattern.entries.map((step) => ({
    note: step.note,
    stitch: step.stitched ? 1 : 0,
    pin: step.pinned ? 1 : 0,
    cmd: step.cmd,
    cmdData: step.cmdData,
  }));

  return [{
    label: instName || 'Cmd Seq',
    patternLength: pattern.steps,
    rows,
    isPatternChannel: false,
  }];
}

export function makeInstSeqCellChange(
  instIdx: number,
  pattern: PreTrackerInstPattern | null,
  onPatternUpdate: (updated: PreTrackerInstPattern) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    if (!pattern) return;
    const entries = [...pattern.entries];
    const step = { ...entries[rowIdx] };

    switch (columnKey) {
      case 'note':
        step.note = value;
        step.pitchByte = (step.pitchByte & 0xC0) | (value & 0x3F);
        break;
      case 'stitch':
        step.stitched = value !== 0;
        step.pitchByte = value ? (step.pitchByte | 0x80) : (step.pitchByte & 0x7F);
        break;
      case 'pin':
        step.pinned = value !== 0;
        step.pitchByte = value ? (step.pitchByte | 0x40) : (step.pitchByte & 0xBF);
        break;
      case 'cmd':
        step.cmd = value & 0x0F;
        step.cmdByte = (step.cmdByte & 0xF0) | (value & 0x0F);
        break;
      case 'cmdData':
        step.cmdData = value;
        break;
    }

    entries[rowIdx] = step;
    const updated = { ...pattern, entries };
    onPatternUpdate(updated);

    // Push to WASM for live update
    if (PreTrackerEngine.hasInstance()) {
      PreTrackerEngine.getInstance().setInstPatternStep(
        instIdx, rowIdx, step.pitchByte, step.cmdByte, step.cmdData
      );
    }
  };
}
