/**
 * Cursor Store - Cursor & Selection State
 *
 * Extracted from useTrackerStore to isolate high-frequency cursor updates
 * (60fps during keyboard hold) from the main store's ~50 subscribers.
 *
 * PERF: No immer middleware — cursor state is simple enough for spread syntax,
 * and immer's proxy creation adds measurable overhead at 60 updates/sec.
 */

import { create } from 'zustand';
import type { CursorPosition, BlockSelection } from '@typedefs';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
// NOTE: Circular import (useTrackerStore also imports useCursorStore).
// Safe because both stores are initialized at module load time, and
// getTrackerState() is only called at action invocation time.
import { useTrackerStore } from './useTrackerStore';
import { notifyScrollEvent } from '../pixi/scrollPerf';

// Define column order for range selection
const COLUMN_ORDER: CursorPosition['columnType'][] = [
  'note', 'instrument', 'volume', 'effTyp', 'effTyp2', 'flag1', 'flag2', 'probability'
];

// Map column types to their digit count
const DIGIT_COUNTS: Record<string, number> = {
  instrument: 2,
  volume: 2,
  effTyp: 1,
  effParam: 2,
  effTyp2: 1,
  effParam2: 2,
  cutoff: 2,
  resonance: 2,
  envMod: 2,
  pan: 2,
  probability: 2,
  flag1: 1,
  flag2: 1,
};

interface CursorStore {
  cursor: CursorPosition;
  selection: BlockSelection | null;

  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void;
  moveCursorToRow: (row: number) => void;
  moveCursorToChannel: (channel: number) => void;
  moveCursorToColumn: (columnType: CursorPosition['columnType']) => void;
  moveCursorToChannelAndColumn: (channel: number, columnType: CursorPosition['columnType']) => void;

  startSelection: () => void;
  updateSelection: (channelIndex: number, rowIndex: number, columnType?: CursorPosition['columnType']) => void;
  endSelection: () => void;
  clearSelection: () => void;
  selectColumn: (channelIndex: number, columnType: CursorPosition['columnType']) => void;
  selectChannel: (channelIndex: number) => void;
  selectPattern: () => void;
}

function getTrackerState() {
  return useTrackerStore.getState();
}

export const useCursorStore = create<CursorStore>()((set, get) => ({
  cursor: { channelIndex: 0, rowIndex: 0, columnType: 'note', digitIndex: 0 },
  selection: null,

  moveCursor: (direction) => {
    const cur = get().cursor;
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    const numChannels = pattern.channels.length;
    const numRows = pattern.length;

    let { channelIndex, rowIndex, columnType, digitIndex } = cur;
    const currentDigits = DIGIT_COUNTS[columnType] || 0;

    switch (direction) {
      case 'up':
        rowIndex = rowIndex > 0 ? rowIndex - 1 : numRows - 1;
        break;
      case 'down':
        rowIndex = rowIndex < numRows - 1 ? rowIndex + 1 : 0;
        break;
      case 'left': {
        if (currentDigits > 0 && digitIndex > 0) { digitIndex--; break; }

        const vis = ts.columnVisibility;
        const cols: CursorPosition['columnType'][] = ['note'];
        if (vis.instrument) cols.push('instrument');
        if (vis.volume) cols.push('volume');
        if (vis.effect) { cols.push('effTyp'); cols.push('effParam'); }
        if (vis.effect2) { cols.push('effTyp2'); cols.push('effParam2'); }
        if (vis.cutoff) cols.push('cutoff');
        if (vis.resonance) cols.push('resonance');
        if (vis.envMod) cols.push('envMod');
        if (vis.pan) cols.push('pan');
        if (vis.flag1) cols.push('flag1');
        if (vis.flag2) cols.push('flag2');
        if (vis.probability) cols.push('probability');

        let ci = cols.indexOf(columnType);
        if (ci === -1) {
          // Cursor on a hidden/unknown column — find nearest visible column to the left
          ci = 0; // fall back to first column (note)
        }
        if (ci > 0) {
          columnType = cols[ci - 1];
          const nd = DIGIT_COUNTS[columnType] || 0;
          digitIndex = nd > 0 ? nd - 1 : 0;
        } else {
          channelIndex = channelIndex > 0 ? channelIndex - 1 : numChannels - 1;
          columnType = cols[cols.length - 1];
          const nd = DIGIT_COUNTS[columnType] || 0;
          digitIndex = nd > 0 ? nd - 1 : 0;
        }
        break;
      }
      case 'right': {
        if (currentDigits > 0 && digitIndex < currentDigits - 1) { digitIndex++; break; }

        const vis = ts.columnVisibility;
        const cols: CursorPosition['columnType'][] = ['note'];
        if (vis.instrument) cols.push('instrument');
        if (vis.volume) cols.push('volume');
        if (vis.effect) { cols.push('effTyp'); cols.push('effParam'); }
        if (vis.effect2) { cols.push('effTyp2'); cols.push('effParam2'); }
        if (vis.cutoff) cols.push('cutoff');
        if (vis.resonance) cols.push('resonance');
        if (vis.envMod) cols.push('envMod');
        if (vis.pan) cols.push('pan');
        if (vis.flag1) cols.push('flag1');
        if (vis.flag2) cols.push('flag2');
        if (vis.probability) cols.push('probability');

        let ci = cols.indexOf(columnType);
        if (ci === -1) {
          // Cursor on a hidden/unknown column — advance to next channel
          channelIndex = channelIndex < numChannels - 1 ? channelIndex + 1 : 0;
          columnType = 'note';
          digitIndex = 0;
          break;
        }
        if (ci < cols.length - 1) {
          columnType = cols[ci + 1];
          digitIndex = 0;
        } else {
          channelIndex = channelIndex < numChannels - 1 ? channelIndex + 1 : 0;
          columnType = 'note';
          digitIndex = 0;
        }
        break;
      }
    }

    // PERF: Skip update if nothing changed
    if (
      rowIndex === cur.rowIndex &&
      channelIndex === cur.channelIndex &&
      columnType === cur.columnType &&
      digitIndex === cur.digitIndex
    ) return;

    // PERF: Notify scroll perf manager for vertical movement (suppresses Yoga layout)
    if (direction === 'up' || direction === 'down') notifyScrollEvent();

    set({ cursor: { channelIndex, rowIndex, columnType, digitIndex } });
  },

  moveCursorToRow: (row) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    if (row >= 0 && row < pattern.length) {
      notifyScrollEvent();
      set({ cursor: { ...get().cursor, rowIndex: row } });
      const replayer = getTrackerReplayer();
      if (replayer.isPlaying()) {
        replayer.seekTo(replayer.getCurrentPosition(), row);
      }
    }
  },

  moveCursorToChannel: (channel) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    if (channel >= 0 && channel < pattern.channels.length) {
      set({ cursor: { ...get().cursor, channelIndex: channel } });
    }
  },

  moveCursorToColumn: (columnType) => {
    set({ cursor: { ...get().cursor, columnType, digitIndex: 0 } });
  },

  moveCursorToChannelAndColumn: (channel, columnType) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    if (channel >= 0 && channel < pattern.channels.length) {
      set({ cursor: { ...get().cursor, channelIndex: channel, columnType, digitIndex: 0 } });
    }
  },

  // --- Selection actions ---

  startSelection: () => {
    const c = get().cursor;
    set({
      selection: {
        startChannel: c.channelIndex, endChannel: c.channelIndex,
        startRow: c.rowIndex, endRow: c.rowIndex,
        startColumn: c.columnType, endColumn: c.columnType,
        columnTypes: [c.columnType],
      },
    });
  },

  updateSelection: (channelIndex, rowIndex, columnType) => {
    const sel = get().selection;
    if (!sel) return;

    const updated = { ...sel, endChannel: channelIndex, endRow: rowIndex };

    if (columnType) {
      updated.endColumn = columnType;
      let endCol = columnType;
      if (endCol === 'effParam') endCol = 'effTyp';
      if (endCol === 'effParam2') endCol = 'effTyp2';
      let sCol = sel.startColumn;
      if (sCol === 'effParam') sCol = 'effTyp';
      if (sCol === 'effParam2') sCol = 'effTyp2';

      const si = COLUMN_ORDER.indexOf(sCol);
      const ei = COLUMN_ORDER.indexOf(endCol);
      if (si !== -1 && ei !== -1) {
        const min = Math.min(si, ei);
        const max = Math.max(si, ei);
        const types = COLUMN_ORDER.slice(min, max + 1);
        if (types.includes('effTyp') && !types.includes('effParam')) types.push('effParam');
        if (types.includes('effTyp2') && !types.includes('effParam2')) types.push('effParam2');
        updated.columnTypes = types;
      }
    }

    set({ selection: updated });
  },

  endSelection: () => {
    const sel = get().selection;
    if (!sel) return;
    const c = get().cursor;
    set({ selection: { ...sel, endChannel: c.channelIndex, endRow: c.rowIndex, endColumn: c.columnType } });
  },

  clearSelection: () => set({ selection: null }),

  selectColumn: (channelIndex, columnType) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    set({
      selection: {
        startChannel: channelIndex, endChannel: channelIndex,
        startRow: 0, endRow: pattern.length - 1,
        startColumn: columnType, endColumn: columnType,
        columnTypes: [columnType],
      },
    });
  },

  selectChannel: (channelIndex) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    set({
      selection: {
        startChannel: channelIndex, endChannel: channelIndex,
        startRow: 0, endRow: pattern.length - 1,
        startColumn: 'note', endColumn: 'probability',
        columnTypes: ['note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2', 'flag1', 'flag2', 'probability'],
      },
    });
  },

  selectPattern: () => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    set({
      selection: {
        startChannel: 0, endChannel: pattern.channels.length - 1,
        startRow: 0, endRow: pattern.length - 1,
        startColumn: 'note', endColumn: 'probability',
        columnTypes: ['note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2', 'flag1', 'flag2', 'probability'],
      },
    });
  },
}));
