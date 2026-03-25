/**
 * usePatternMatrix — Shared data for the Renoise-style pattern matrix view.
 *
 * Matrix layout:
 *   Rows = song positions (pattern order entries)
 *   Columns = channels
 *   Cells = pattern number/name at that position
 *
 * Used by both DOM and Pixi pattern matrix components.
 */

import { useMemo } from 'react';
import { useTrackerStore } from '@stores';

export interface PatternMatrixCell {
  patternIndex: number;
  patternName: string;
  channelIndex: number;
  positionIndex: number;
  hasData: boolean;   // true if any notes in this channel/pattern
  isEmpty: boolean;   // true if all rows are empty
}

export interface PatternMatrixData {
  positions: number[];        // patternOrder array
  channelCount: number;
  cells: PatternMatrixCell[][]; // [positionIndex][channelIndex]
  currentPosition: number;
  currentPatternIndex: number;
}

/**
 * Get pattern matrix data (non-reactive).
 */
export function getPatternMatrixData(): PatternMatrixData {
  const { patterns, patternOrder, currentPositionIndex, currentPatternIndex } = useTrackerStore.getState();

  if (patterns.length === 0 || patternOrder.length === 0) {
    return {
      positions: [],
      channelCount: 0,
      cells: [],
      currentPosition: 0,
      currentPatternIndex: 0,
    };
  }

  const channelCount = patterns[0]?.channels.length ?? 4;
  const cells: PatternMatrixCell[][] = [];

  for (let pos = 0; pos < patternOrder.length; pos++) {
    const patIdx = patternOrder[pos];
    const pattern = patterns[patIdx];
    const row: PatternMatrixCell[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const channel = pattern?.channels[ch];
      let hasData = false;
      let isEmpty = true;

      if (channel) {
        for (const cell of channel.rows) {
          if (cell.note > 0 || (cell.instrument ?? 0) > 0 || (cell.effTyp ?? 0) > 0) {
            hasData = true;
            isEmpty = false;
            break;
          }
        }
      }

      row.push({
        patternIndex: patIdx,
        patternName: pattern?.name ?? `P${patIdx}`,
        channelIndex: ch,
        positionIndex: pos,
        hasData,
        isEmpty,
      });
    }

    cells.push(row);
  }

  return {
    positions: patternOrder,
    channelCount,
    cells,
    currentPosition: currentPositionIndex,
    currentPatternIndex,
  };
}

/**
 * React hook — subscribes to tracker store changes.
 */
export function usePatternMatrix(): PatternMatrixData {
  const patterns = useTrackerStore(s => s.patterns);
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);

  return useMemo(
    () => getPatternMatrixData(),
    [patterns, patternOrder, currentPositionIndex, currentPatternIndex],
  );
}
