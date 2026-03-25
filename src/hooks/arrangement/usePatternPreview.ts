/**
 * usePatternPreview — Shared hook for generating pattern preview data.
 *
 * Used by both DOM and Pixi tooltip components to show a mini tracker grid
 * when hovering over a clip in the arrangement view.
 *
 * Returns a compact representation of the pattern's first N rows for display.
 */

import { useMemo } from 'react';
import { useTrackerStore } from '@stores';

export interface PatternPreviewCell {
  note: string;       // "C-4", "---", "==="
  instrument: string; // "01", ".."
  volume: string;     // "40", ".."
  effect: string;     // "C40", "..."
}

export interface PatternPreviewData {
  patternName: string;
  patternIndex: number;
  rows: PatternPreviewCell[][];  // [rowIndex][channelIndex]
  channelCount: number;
  totalRows: number;
  previewRows: number;
}

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function xmNoteToStr(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return '===';
  if (note < 1 || note > 96) return '---';
  const semitone = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[semitone]}${octave}`;
}

function toHex2(n: number): string {
  return n > 0 ? n.toString(16).toUpperCase().padStart(2, '0') : '..';
}

function effectToStr(typ: number, val: number): string {
  if (typ === 0 && val === 0) return '...';
  return typ.toString(16).toUpperCase() + val.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Get pattern preview data for a given pattern ID.
 * Non-reactive version for imperative use (Pixi tooltips).
 */
export function getPatternPreviewData(
  patternId: string,
  maxRows: number = 8,
  offsetRows: number = 0,
): PatternPreviewData | null {
  const { patterns } = useTrackerStore.getState();
  const patternIndex = patterns.findIndex(p => p.id === patternId);
  if (patternIndex < 0) return null;

  const pattern = patterns[patternIndex];
  const previewRows = Math.min(maxRows, pattern.length - offsetRows);
  const rows: PatternPreviewCell[][] = [];

  for (let r = 0; r < previewRows; r++) {
    const row: PatternPreviewCell[] = [];
    const actualRow = offsetRows + r;
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const cell = pattern.channels[ch].rows[actualRow];
      if (!cell) {
        row.push({ note: '---', instrument: '..', volume: '..', effect: '...' });
        continue;
      }
      row.push({
        note: xmNoteToStr(cell.note),
        instrument: toHex2(cell.instrument ?? 0),
        volume: cell.volume > 0 ? toHex2(cell.volume) : '..',
        effect: effectToStr(cell.effTyp ?? 0, cell.eff ?? 0),
      });
    }
    rows.push(row);
  }

  return {
    patternName: pattern.name,
    patternIndex,
    rows,
    channelCount: pattern.channels.length,
    totalRows: pattern.length,
    previewRows,
  };
}

/**
 * React hook version — subscribes to pattern changes.
 */
export function usePatternPreview(
  patternId: string | null,
  maxRows: number = 8,
  offsetRows: number = 0,
): PatternPreviewData | null {
  const patterns = useTrackerStore(s => s.patterns);

  return useMemo(() => {
    if (!patternId) return null;
    return getPatternPreviewData(patternId, maxRows, offsetRows);
  }, [patternId, maxRows, offsetRows, patterns]);
}
