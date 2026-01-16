/**
 * Piano Roll Store - View state and selection management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { PianoRollViewState, PianoRollSelection, DragState } from '../types/pianoRoll';
import { DEFAULT_PIANO_ROLL_VIEW, DEFAULT_SELECTION } from '../types/pianoRoll';

interface PianoRollStore {
  // View state
  view: PianoRollViewState;

  // Selection state
  selection: PianoRollSelection;

  // Drag state
  drag: DragState;

  // Tool mode
  tool: 'select' | 'draw' | 'erase';

  // Actions - View
  setHorizontalZoom: (zoom: number) => void;
  setVerticalZoom: (zoom: number) => void;
  setScroll: (scrollX: number, scrollY: number) => void;
  scrollBy: (deltaX: number, deltaY: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridDivision: (division: number) => void;
  setShowVelocity: (show: boolean) => void;
  setChannelIndex: (index: number) => void;

  // Actions - Selection
  selectNote: (noteId: string, addToSelection?: boolean) => void;
  selectNotes: (noteIds: string[]) => void;
  deselectNote: (noteId: string) => void;
  clearSelection: () => void;
  setSelectionBox: (
    startRow: number | null,
    endRow: number | null,
    startNote: number | null,
    endNote: number | null
  ) => void;

  // Actions - Drag
  startDrag: (
    mode: DragState['mode'],
    startX: number,
    startY: number,
    noteId?: string
  ) => void;
  updateDrag: (currentX: number, currentY: number) => void;
  endDrag: () => void;

  // Actions - Tool
  setTool: (tool: 'select' | 'draw' | 'erase') => void;

  // Reset
  resetView: () => void;
}

export const usePianoRollStore = create<PianoRollStore>()(
  immer((set) => ({
    // Initial state
    view: { ...DEFAULT_PIANO_ROLL_VIEW },
    selection: { ...DEFAULT_SELECTION, notes: new Set() },
    drag: {
      isDragging: false,
      mode: 'none',
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      noteId: null,
      originalNotes: [],
    },
    tool: 'select',

    // View actions
    setHorizontalZoom: (zoom) =>
      set((state) => {
        state.view.horizontalZoom = Math.max(4, Math.min(64, zoom));
      }),

    setVerticalZoom: (zoom) =>
      set((state) => {
        state.view.verticalZoom = Math.max(8, Math.min(32, zoom));
      }),

    setScroll: (scrollX, scrollY) =>
      set((state) => {
        state.view.scrollX = Math.max(0, scrollX);
        state.view.scrollY = Math.max(0, Math.min(127, scrollY));
      }),

    scrollBy: (deltaX, deltaY) =>
      set((state) => {
        state.view.scrollX = Math.max(0, state.view.scrollX + deltaX);
        state.view.scrollY = Math.max(0, Math.min(127, state.view.scrollY + deltaY));
      }),

    setSnapToGrid: (snap) =>
      set((state) => {
        state.view.snapToGrid = snap;
      }),

    setGridDivision: (division) =>
      set((state) => {
        state.view.gridDivision = division;
      }),

    setShowVelocity: (show) =>
      set((state) => {
        state.view.showVelocity = show;
      }),

    setChannelIndex: (index) =>
      set((state) => {
        state.view.channelIndex = index;
      }),

    // Selection actions
    selectNote: (noteId, addToSelection = false) =>
      set((state) => {
        if (!addToSelection) {
          state.selection.notes = new Set([noteId]);
        } else {
          state.selection.notes.add(noteId);
        }
      }),

    selectNotes: (noteIds) =>
      set((state) => {
        state.selection.notes = new Set(noteIds);
      }),

    deselectNote: (noteId) =>
      set((state) => {
        state.selection.notes.delete(noteId);
      }),

    clearSelection: () =>
      set((state) => {
        state.selection.notes = new Set();
        state.selection.startRow = null;
        state.selection.endRow = null;
        state.selection.startNote = null;
        state.selection.endNote = null;
      }),

    setSelectionBox: (startRow, endRow, startNote, endNote) =>
      set((state) => {
        state.selection.startRow = startRow;
        state.selection.endRow = endRow;
        state.selection.startNote = startNote;
        state.selection.endNote = endNote;
      }),

    // Drag actions
    startDrag: (mode, startX, startY, noteId) =>
      set((state) => {
        state.drag.isDragging = true;
        state.drag.mode = mode;
        state.drag.startX = startX;
        state.drag.startY = startY;
        state.drag.currentX = startX;
        state.drag.currentY = startY;
        state.drag.noteId = noteId || null;
      }),

    updateDrag: (currentX, currentY) =>
      set((state) => {
        state.drag.currentX = currentX;
        state.drag.currentY = currentY;
      }),

    endDrag: () =>
      set((state) => {
        state.drag.isDragging = false;
        state.drag.mode = 'none';
        state.drag.noteId = null;
        state.drag.originalNotes = [];
      }),

    // Tool actions
    setTool: (tool) =>
      set((state) => {
        state.tool = tool;
      }),

    // Reset
    resetView: () =>
      set((state) => {
        state.view = { ...DEFAULT_PIANO_ROLL_VIEW };
        state.selection = { ...DEFAULT_SELECTION, notes: new Set() };
        state.drag = {
          isDragging: false,
          mode: 'none',
          startX: 0,
          startY: 0,
          currentX: 0,
          currentY: 0,
          noteId: null,
          originalNotes: [],
        };
        state.tool = 'select';
      }),
  }))
);
