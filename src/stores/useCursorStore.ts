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
// Cross-store access goes through the late-bound storeAccess registry,
// NOT through direct static imports. The previous cycle between these
// three stores caused a production TDZ when Rollup froze the aggregator
// namespace while one of the store const declarations was still pending.
// Type-only imports are erased by TypeScript at build time, so they do
// not create a runtime module cycle.
import type { useTrackerStore as _TrackerStoreType } from './useTrackerStore';
import type { useEditorStore as _EditorStoreType } from './useEditorStore';
import {
  getTrackerStoreRef,
  getEditorStoreRef,
  registerCursorStore,
} from './storeAccess';

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
  moveCursorToChannelAndColumn: (channel: number, columnType: CursorPosition['columnType'], noteColumnIndex?: number) => void;
  getColumnsForChannel: (channelIndex: number) => Array<{ type: CursorPosition['columnType']; nci: number }> | null;

  startSelection: () => void;
  updateSelection: (channelIndex: number, rowIndex: number, columnType?: CursorPosition['columnType']) => void;
  endSelection: () => void;
  clearSelection: () => void;
  selectColumn: (channelIndex: number, columnType: CursorPosition['columnType']) => void;
  selectChannel: (channelIndex: number) => void;
  selectPattern: () => void;
}

function getTrackerState(): ReturnType<typeof _TrackerStoreType.getState> {
  return getTrackerStoreRef().getState() as ReturnType<typeof _TrackerStoreType.getState>;
}

function getEditorState(): ReturnType<typeof _EditorStoreType.getState> {
  return getEditorStoreRef().getState() as ReturnType<typeof _EditorStoreType.getState>;
}

export const useCursorStore = create<CursorStore>()((set, get) => ({
  cursor: { channelIndex: 0, rowIndex: 0, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 },
  selection: null,

  moveCursor: (direction) => {
    const cur = get().cursor;
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    const numChannels = pattern.channels.length;
    const numRows = pattern.length;

    let { channelIndex, rowIndex, columnType, digitIndex } = cur;
    let noteColumnIndex = cur.noteColumnIndex ?? 0;
    const currentDigits = DIGIT_COUNTS[columnType] || 0;
    const behavior = getEditorState().activeBehavior;

    // Get total note columns for the current channel
    const getNoteCols = (ch: number) => pattern.channels[ch]?.channelMeta?.noteCols ?? 1;

    // Clamp noteColumnIndex to valid range — prevents stale values after note column changes
    const maxNci = getNoteCols(channelIndex) - 1;
    if (noteColumnIndex > maxNci) noteColumnIndex = maxNci;

    switch (direction) {
      case 'up':
        if (rowIndex > 0) {
          rowIndex--;
        } else if (behavior.cursorWrapVertical) {
          rowIndex = numRows - 1;
        }
        break;
      case 'down':
        if (rowIndex < numRows - 1) {
          rowIndex++;
        } else if (behavior.cursorWrapVertical) {
          rowIndex = 0;
        }
        break;
      case 'left': {
        if (currentDigits > 0 && digitIndex > 0) { digitIndex--; break; }

        const vis = getEditorState().columnVisibility;
        // Build column order for a single note column group
        const noteGroupCols: CursorPosition['columnType'][] = ['note'];
        if (vis.instrument) noteGroupCols.push('instrument');
        if (vis.volume) noteGroupCols.push('volume');

        // Build full column list: [noteGroup * noteCols] + effects + flags
        const totalNoteCols = getNoteCols(channelIndex);
        const cols: Array<{ type: CursorPosition['columnType']; nci: number }> = [];
        for (let nc = 0; nc < totalNoteCols; nc++) {
          for (const t of noteGroupCols) cols.push({ type: t, nci: nc });
        }
        if (vis.effect) { cols.push({ type: 'effTyp', nci: 0 }); cols.push({ type: 'effParam', nci: 0 }); }
        if (vis.effect2) { cols.push({ type: 'effTyp2', nci: 0 }); cols.push({ type: 'effParam2', nci: 0 }); }
        if (vis.cutoff) cols.push({ type: 'cutoff', nci: 0 });
        if (vis.resonance) cols.push({ type: 'resonance', nci: 0 });
        if (vis.envMod) cols.push({ type: 'envMod', nci: 0 });
        if (vis.pan) cols.push({ type: 'pan', nci: 0 });
        if (vis.flag1) cols.push({ type: 'flag1', nci: 0 });
        if (vis.flag2) cols.push({ type: 'flag2', nci: 0 });
        if (vis.probability) cols.push({ type: 'probability', nci: 0 });

        let ci = cols.findIndex(c => c.type === columnType && c.nci === noteColumnIndex);
        if (ci === -1) ci = 0;
        if (ci > 0) {
          columnType = cols[ci - 1].type;
          noteColumnIndex = cols[ci - 1].nci;
          const nd = DIGIT_COUNTS[columnType] || 0;
          digitIndex = nd > 0 ? nd - 1 : 0;
        } else {
          // Wrap to previous channel
          channelIndex = channelIndex > 0 ? channelIndex - 1 : numChannels - 1;
          // Build cols for new channel's last column
          const prevNoteCols = getNoteCols(channelIndex);
          const prevCols: Array<{ type: CursorPosition['columnType']; nci: number }> = [];
          for (let nc = 0; nc < prevNoteCols; nc++) {
            for (const t of noteGroupCols) prevCols.push({ type: t, nci: nc });
          }
          if (vis.effect) { prevCols.push({ type: 'effTyp', nci: 0 }); prevCols.push({ type: 'effParam', nci: 0 }); }
          if (vis.effect2) { prevCols.push({ type: 'effTyp2', nci: 0 }); prevCols.push({ type: 'effParam2', nci: 0 }); }
          if (vis.cutoff) prevCols.push({ type: 'cutoff', nci: 0 });
          if (vis.resonance) prevCols.push({ type: 'resonance', nci: 0 });
          if (vis.envMod) prevCols.push({ type: 'envMod', nci: 0 });
          if (vis.pan) prevCols.push({ type: 'pan', nci: 0 });
          if (vis.flag1) prevCols.push({ type: 'flag1', nci: 0 });
          if (vis.flag2) prevCols.push({ type: 'flag2', nci: 0 });
          if (vis.probability) prevCols.push({ type: 'probability', nci: 0 });
          const last = prevCols[prevCols.length - 1];
          columnType = last.type;
          noteColumnIndex = last.nci;
          const nd = DIGIT_COUNTS[columnType] || 0;
          digitIndex = nd > 0 ? nd - 1 : 0;
        }
        break;
      }
      case 'right': {
        if (currentDigits > 0 && digitIndex < currentDigits - 1) { digitIndex++; break; }

        const vis = getEditorState().columnVisibility;
        const noteGroupCols: CursorPosition['columnType'][] = ['note'];
        if (vis.instrument) noteGroupCols.push('instrument');
        if (vis.volume) noteGroupCols.push('volume');

        const totalNoteCols = getNoteCols(channelIndex);
        const cols: Array<{ type: CursorPosition['columnType']; nci: number }> = [];
        for (let nc = 0; nc < totalNoteCols; nc++) {
          for (const t of noteGroupCols) cols.push({ type: t, nci: nc });
        }
        if (vis.effect) { cols.push({ type: 'effTyp', nci: 0 }); cols.push({ type: 'effParam', nci: 0 }); }
        if (vis.effect2) { cols.push({ type: 'effTyp2', nci: 0 }); cols.push({ type: 'effParam2', nci: 0 }); }
        if (vis.cutoff) cols.push({ type: 'cutoff', nci: 0 });
        if (vis.resonance) cols.push({ type: 'resonance', nci: 0 });
        if (vis.envMod) cols.push({ type: 'envMod', nci: 0 });
        if (vis.pan) cols.push({ type: 'pan', nci: 0 });
        if (vis.flag1) cols.push({ type: 'flag1', nci: 0 });
        if (vis.flag2) cols.push({ type: 'flag2', nci: 0 });
        if (vis.probability) cols.push({ type: 'probability', nci: 0 });

        let ci = cols.findIndex(c => c.type === columnType && c.nci === noteColumnIndex);
        if (ci === -1) {
          // Stale cursor position — snap to first column of current channel
          columnType = cols[0]?.type ?? 'note';
          noteColumnIndex = 0;
          digitIndex = 0;
          break;
        }
        if (ci < cols.length - 1) {
          columnType = cols[ci + 1].type;
          noteColumnIndex = cols[ci + 1].nci;
          digitIndex = 0;
        } else {
          channelIndex = channelIndex < numChannels - 1 ? channelIndex + 1 : 0;
          columnType = 'note';
          noteColumnIndex = 0;
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
      digitIndex === cur.digitIndex &&
      noteColumnIndex === (cur.noteColumnIndex ?? 0)
    ) return;

    set({ cursor: { channelIndex, rowIndex, noteColumnIndex, columnType, digitIndex } });
  },

  moveCursorToRow: (row) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    if (row >= 0 && row < pattern.length) {
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
      const cur = get().cursor;
      const maxNci = (pattern.channels[channel]?.channelMeta?.noteCols ?? 1) - 1;
      const nci = Math.min(cur.noteColumnIndex ?? 0, maxNci);
      set({ cursor: { ...cur, channelIndex: channel, noteColumnIndex: nci } });
    }
  },

  moveCursorToColumn: (columnType) => {
    set({ cursor: { ...get().cursor, columnType, digitIndex: 0 } });
  },

  moveCursorToChannelAndColumn: (channel, columnType, noteColumnIndex) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    if (channel >= 0 && channel < pattern.channels.length) {
      const maxNci = (pattern.channels[channel]?.channelMeta?.noteCols ?? 1) - 1;
      const nci = Math.min(noteColumnIndex ?? 0, maxNci);
      set({ cursor: { ...get().cursor, channelIndex: channel, columnType, digitIndex: 0, noteColumnIndex: nci } });
    }
  },

  // Get the visible column list for a channel (used by IT Home/End double-press)
  getColumnsForChannel: (channelIndex) => {
    const ts = getTrackerState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    if (!pattern || channelIndex < 0 || channelIndex >= pattern.channels.length) return null;
    const vis = getEditorState().columnVisibility;
    const noteGroupCols: CursorPosition['columnType'][] = ['note'];
    if (vis.instrument) noteGroupCols.push('instrument');
    if (vis.volume) noteGroupCols.push('volume');
    const totalNoteCols = pattern.channels[channelIndex]?.channelMeta?.noteCols ?? 1;
    const cols: Array<{ type: CursorPosition['columnType']; nci: number }> = [];
    for (let nc = 0; nc < totalNoteCols; nc++) {
      for (const t of noteGroupCols) cols.push({ type: t, nci: nc });
    }
    if (vis.effect) { cols.push({ type: 'effTyp', nci: 0 }); cols.push({ type: 'effParam', nci: 0 }); }
    if (vis.effect2) { cols.push({ type: 'effTyp2', nci: 0 }); cols.push({ type: 'effParam2', nci: 0 }); }
    if (vis.cutoff) cols.push({ type: 'cutoff', nci: 0 });
    if (vis.resonance) cols.push({ type: 'resonance', nci: 0 });
    if (vis.envMod) cols.push({ type: 'envMod', nci: 0 });
    if (vis.pan) cols.push({ type: 'pan', nci: 0 });
    if (vis.flag1) cols.push({ type: 'flag1', nci: 0 });
    if (vis.flag2) cols.push({ type: 'flag2', nci: 0 });
    if (vis.probability) cols.push({ type: 'probability', nci: 0 });
    return cols;
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

// Register with the cross-store access leaf so useTrackerStore/useEditorStore
// can reach us without a static import cycle.
registerCursorStore(useCursorStore);
