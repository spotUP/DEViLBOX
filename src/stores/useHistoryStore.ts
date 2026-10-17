/**
 * History Store - Undo/Redo system for tracker edits
 * Tracks all pattern modifications with action types and state snapshots
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Pattern } from '@typedefs';

export type ActionType =
  | 'EDIT_CELL'
  | 'PASTE_BLOCK'
  | 'DELETE_BLOCK'
  | 'CUT_BLOCK'
  | 'TRANSPOSE_BLOCK'
  | 'AMPLIFY_BLOCK'
  | 'INTERPOLATE_BLOCK'
  | 'CLEAR_CELL'
  | 'CLEAR_ROW'
  | 'CLEAR_CHANNEL'
  | 'CLEAR_PATTERN'
  | 'INSERT_ROW'
  | 'DELETE_ROW'
  | 'RESIZE_PATTERN'
  | 'CUT_SELECTION'
  | 'PASTE'
  | 'PASTE_MIX'
  | 'PASTE_FLOOD'
  | 'PASTE_PUSH_FORWARD'
  | 'SWAP_SELECTION'
  | 'CUT_TRACK'
  | 'PASTE_TRACK'
  | 'CUT_PATTERN'
  | 'PASTE_PATTERN'
  | 'READ_MACRO'
  | 'TRANSPOSE'
  | 'INTERPOLATE'
  | 'HUMANIZE'
  | 'STRUM'
  | 'LEGATO'
  | 'SCALE_VOLUME'
  | 'FADE_VOLUME'
  | 'AMPLIFY'
  | 'SWAP_CHANNELS'
  | 'JOIN_PATTERNS'
  | 'CUT_COMMANDS'
  | 'PASTE_COMMANDS'
  | 'KILL_TO_END'
  | 'KILL_TO_START'
  | 'REVERSE_BLOCK'
  | 'DOUBLE_BLOCK'
  | 'HALVE_BLOCK'
  | 'BULK_BLOCK_EDIT';

/**
 * One pattern an action changed. `before: null` means the action appended this
 * pattern (undo removes it again); appended patterns sit at the end of the list.
 */
export interface PatternChange {
  patternIndex: number;
  before: Pattern | null;
  after: Pattern;
}

/**
 * One undo step: every pattern it changed and, when it changed the song order,
 * the order before and after. Undo and redo restore these exact indices, never
 * whatever pattern happens to be on screen (useTrackerStore.undoEdit/redoEdit).
 */
export interface HistoryAction {
  id: string;
  type: ActionType;
  timestamp: number;
  description: string;
  changes: PatternChange[];
  order?: { before: number[]; after: number[] };
}

interface HistoryStore {
  // State
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
  maxStackSize: number;
  currentActionId: string | null;

  // Actions
  pushAction: (
    type: ActionType,
    description: string,
    patternIndex: number,
    beforeState: Pattern,
    afterState: Pattern
  ) => void;
  /** One undo step spanning several patterns and, optionally, the song order. */
  pushMultiAction: (
    type: ActionType,
    description: string,
    changes: PatternChange[],
    order?: { before: number[]; after: number[] }
  ) => void;
  /** Pops the step and returns it; apply it with useTrackerStore.undoEdit, which calls this. */
  undo: () => HistoryAction | null;
  redo: () => HistoryAction | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  setMaxStackSize: (size: number) => void;

  // Getters
  getUndoCount: () => number;
  getRedoCount: () => number;
  getLastAction: () => HistoryAction | null;
  getActionHistory: () => HistoryAction[];
}

export const useHistoryStore = create<HistoryStore>()(
  immer((set, get) => ({
    // Initial state
    undoStack: [],
    redoStack: [],
    maxStackSize: 100,
    currentActionId: null,

    // Push new action to undo stack
    pushAction: (type, description, patternIndex, beforeState, afterState) =>
      get().pushMultiAction(type, description, [{ patternIndex, before: beforeState, after: afterState }]),

    pushMultiAction: (type, description, changes, order) =>
      set((state) => {
        const action: HistoryAction = {
          id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type,
          timestamp: Date.now(),
          description,
          // Deep clone
          changes: changes.map((c) => ({
            patternIndex: c.patternIndex,
            before: c.before ? structuredClone(c.before) : null,
            after: structuredClone(c.after),
          })),
          ...(order ? { order: { before: [...order.before], after: [...order.after] } } : {}),
        };

        // Add to undo stack
        state.undoStack.push(action);

        // Trim stack if exceeds max size
        if (state.undoStack.length > state.maxStackSize) {
          state.undoStack.shift();
        }

        // Clear redo stack when new action is pushed
        state.redoStack = [];

        state.currentActionId = action.id;
      }),

    // Undo last action
    undo: () => {
      const state = get();
      if (state.undoStack.length === 0) return null;

      const action = state.undoStack[state.undoStack.length - 1];

      set((draft) => {
        // Pop from undo stack
        const poppedAction = draft.undoStack.pop();
        if (poppedAction) {
          // Push to redo stack
          draft.redoStack.push(poppedAction);

          // Update current action ID
          draft.currentActionId =
            draft.undoStack.length > 0 ? draft.undoStack[draft.undoStack.length - 1].id : null;
        }
      });

      return action;
    },

    // Redo last undone action
    redo: () => {
      const state = get();
      if (state.redoStack.length === 0) return null;

      const action = state.redoStack[state.redoStack.length - 1];

      set((draft) => {
        // Pop from redo stack
        const poppedAction = draft.redoStack.pop();
        if (poppedAction) {
          // Push back to undo stack
          draft.undoStack.push(poppedAction);

          // Update current action ID
          draft.currentActionId = poppedAction.id;
        }
      });

      return action;
    },

    // Check if undo is available
    canUndo: () => {
      return get().undoStack.length > 0;
    },

    // Check if redo is available
    canRedo: () => {
      return get().redoStack.length > 0;
    },

    // Clear all history
    clearHistory: () =>
      set((state) => {
        state.undoStack = [];
        state.redoStack = [];
        state.currentActionId = null;
      }),

    // Set maximum stack size
    setMaxStackSize: (size) =>
      set((state) => {
        state.maxStackSize = Math.max(1, size);

        // Trim stacks if needed
        if (state.undoStack.length > state.maxStackSize) {
          state.undoStack = state.undoStack.slice(-state.maxStackSize);
        }
        if (state.redoStack.length > state.maxStackSize) {
          state.redoStack = state.redoStack.slice(-state.maxStackSize);
        }
      }),

    // Get undo count
    getUndoCount: () => {
      return get().undoStack.length;
    },

    // Get redo count
    getRedoCount: () => {
      return get().redoStack.length;
    },

    // Get last action
    getLastAction: () => {
      const stack = get().undoStack;
      return stack.length > 0 ? stack[stack.length - 1] : null;
    },

    // Get action history (last 20 actions)
    getActionHistory: () => {
      return get().undoStack.slice(-20);
    },
  }))
);

/**
 * History panel component props
 */
export interface HistoryPanelProps {
  onSelectAction?: (action: HistoryAction) => void;
}

/**
 * Get action type display name
 */
export const getActionTypeName = (type: ActionType): string => {
  const names: Record<ActionType, string> = {
    EDIT_CELL: 'Edit Cell',
    PASTE_BLOCK: 'Paste Block',
    DELETE_BLOCK: 'Delete Block',
    CUT_BLOCK: 'Cut Block',
    TRANSPOSE_BLOCK: 'Transpose Block',
    AMPLIFY_BLOCK: 'Amplify Block',
    INTERPOLATE_BLOCK: 'Interpolate Block',
    CLEAR_CELL: 'Clear Cell',
    CLEAR_ROW: 'Clear Row',
    CLEAR_CHANNEL: 'Clear Channel',
    CLEAR_PATTERN: 'Clear Pattern',
    INSERT_ROW: 'Insert Row',
    DELETE_ROW: 'Delete Row',
    RESIZE_PATTERN: 'Resize Pattern',
    CUT_SELECTION: 'Cut Selection',
    PASTE: 'Paste',
    PASTE_MIX: 'Mix Paste',
    PASTE_FLOOD: 'Flood Paste',
    PASTE_PUSH_FORWARD: 'Push-Forward Paste',
    SWAP_SELECTION: 'Swap Selection',
    CUT_TRACK: 'Cut Track',
    PASTE_TRACK: 'Paste Track',
    CUT_PATTERN: 'Cut Pattern',
    PASTE_PATTERN: 'Paste Pattern',
    READ_MACRO: 'Apply Macro',
    TRANSPOSE: 'Transpose',
    INTERPOLATE: 'Interpolate',
    HUMANIZE: 'Humanize',
    STRUM: 'Strum',
    LEGATO: 'Legato',
    SCALE_VOLUME: 'Scale Volume',
    FADE_VOLUME: 'Fade Volume',
    AMPLIFY: 'Amplify Selection',
    SWAP_CHANNELS: 'Swap Channels',
    JOIN_PATTERNS: 'Join Patterns',
    CUT_COMMANDS: 'Cut Commands',
    PASTE_COMMANDS: 'Paste Commands',
    KILL_TO_END: 'Kill to End',
    KILL_TO_START: 'Kill to Start',
    REVERSE_BLOCK: 'Reverse Block',
    DOUBLE_BLOCK: 'Double Block',
    HALVE_BLOCK: 'Halve Block',
    BULK_BLOCK_EDIT: 'Block Edit',
  };
  return names[type] || type;
};

/**
 * Get action type color for UI
 */
export const getActionTypeColor = (type: ActionType): string => {
  switch (type) {
    case 'EDIT_CELL':
      return 'text-blue-400';
    case 'PASTE_BLOCK':
    case 'CUT_BLOCK':
    case 'DELETE_BLOCK':
      return 'text-green-400';
    case 'TRANSPOSE_BLOCK':
    case 'AMPLIFY_BLOCK':
    case 'INTERPOLATE_BLOCK':
      return 'text-yellow-400';
    case 'CLEAR_CELL':
    case 'CLEAR_ROW':
    case 'CLEAR_CHANNEL':
    case 'CLEAR_PATTERN':
      return 'text-red-400';
    case 'INSERT_ROW':
    case 'DELETE_ROW':
    case 'RESIZE_PATTERN':
      return 'text-purple-400';
    case 'CUT_SELECTION':
    case 'CUT_TRACK':
    case 'CUT_PATTERN':
      return 'text-green-400';
    case 'PASTE':
    case 'PASTE_MIX':
    case 'PASTE_FLOOD':
    case 'PASTE_PUSH_FORWARD':
    case 'SWAP_SELECTION':
    case 'PASTE_TRACK':
    case 'PASTE_PATTERN':
      return 'text-green-400';
    case 'TRANSPOSE':
    case 'INTERPOLATE':
    case 'HUMANIZE':
    case 'STRUM':
    case 'LEGATO':
    case 'SCALE_VOLUME':
    case 'FADE_VOLUME':
    case 'READ_MACRO':
      return 'text-yellow-400';
    default:
      return 'text-text-secondary';
  }
};
