/**
 * History Store - Undo/Redo system for tracker edits
 * Tracks all pattern modifications with action types and state snapshots
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { idGenerator } from '../utils/idGenerator';
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
  | 'RESIZE_PATTERN';

export interface HistoryAction {
  id: string;
  type: ActionType;
  timestamp: number;
  description: string;
  patternIndex: number;
  beforeState: Pattern;
  afterState: Pattern;
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
  undo: () => Pattern | null;
  redo: () => Pattern | null;
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
      set((state) => {
        const action: HistoryAction = {
          id: idGenerator.generate('action'),
          type,
          timestamp: Date.now(),
          description,
          patternIndex,
          beforeState: JSON.parse(JSON.stringify(beforeState)), // Deep clone
          afterState: JSON.parse(JSON.stringify(afterState)), // Deep clone
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

        console.log(`History: ${type} - ${description}`, {
          undoCount: state.undoStack.length,
          redoCount: state.redoStack.length,
        });
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

          console.log(`Undo: ${poppedAction.type} - ${poppedAction.description}`, {
            undoCount: draft.undoStack.length,
            redoCount: draft.redoStack.length,
          });
        }
      });

      // Return before state to apply
      return action.beforeState;
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

          console.log(`Redo: ${poppedAction.type} - ${poppedAction.description}`, {
            undoCount: draft.undoStack.length,
            redoCount: draft.redoStack.length,
          });
        }
      });

      // Return after state to apply
      return action.afterState;
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
        console.log('History cleared');
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
 * Hook for integrating history with tracker operations
 */
export const useTrackerHistory = () => {
  const { pushAction, undo, redo, canUndo, canRedo } = useHistoryStore();

  /**
   * Record a tracker edit action
   */
  const recordEdit = (
    type: ActionType,
    description: string,
    patternIndex: number,
    beforeState: Pattern,
    afterState: Pattern
  ) => {
    pushAction(type, description, patternIndex, beforeState, afterState);
  };

  /**
   * Handle Ctrl+Z (undo)
   */
  const handleUndo = (): Pattern | null => {
    if (!canUndo()) {
      console.warn('Nothing to undo');
      return null;
    }
    return undo();
  };

  /**
   * Handle Ctrl+Shift+Z or Ctrl+Y (redo)
   */
  const handleRedo = (): Pattern | null => {
    if (!canRedo()) {
      console.warn('Nothing to redo');
      return null;
    }
    return redo();
  };

  return {
    recordEdit,
    handleUndo,
    handleRedo,
    canUndo: canUndo(),
    canRedo: canRedo(),
  };
};

/**
 * Keyboard shortcut handler for undo/redo
 */
export const useHistoryKeyboardShortcuts = (
  onUndo: (pattern: Pattern) => void,
  onRedo: (pattern: Pattern) => void
) => {
  const { handleUndo, handleRedo } = useTrackerHistory();

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore if typing in input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Ctrl+Z - Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      const pattern = handleUndo();
      if (pattern) {
        onUndo(pattern);
      }
      return;
    }

    // Ctrl+Shift+Z or Ctrl+Y - Redo
    if (
      ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
      ((e.ctrlKey || e.metaKey) && e.key === 'y')
    ) {
      e.preventDefault();
      const pattern = handleRedo();
      if (pattern) {
        onRedo(pattern);
      }
      return;
    }
  };

  // Attach listener
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }
};

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
    default:
      return 'text-gray-400';
  }
};
