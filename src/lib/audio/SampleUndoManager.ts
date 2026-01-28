/**
 * SampleUndoManager - Undo/Redo system for sample editor operations
 *
 * Stores AudioBuffer snapshots with operation labels.
 * Uses a circular buffer to limit memory usage.
 */

export interface UndoState {
  buffer: AudioBuffer;
  label: string;
  loopStart: number;
  loopEnd: number;
  loopType: 'off' | 'forward' | 'pingpong';
}

export class SampleUndoManager {
  private undoStack: UndoState[] = [];
  private redoStack: UndoState[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 20) {
    this.maxHistory = maxHistory;
  }

  /**
   * Save current state before an operation
   */
  pushState(state: UndoState): void {
    // Clear redo stack on new action
    this.redoStack = [];

    // Add to undo stack
    this.undoStack.push(state);

    // Limit stack size
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo: Pop from undo stack, push current state to redo
   */
  undo(currentState: UndoState): UndoState | null {
    if (this.undoStack.length === 0) return null;

    // Push current state to redo stack
    this.redoStack.push(currentState);

    // Pop and return previous state
    return this.undoStack.pop()!;
  }

  /**
   * Redo: Pop from redo stack, push current state to undo
   */
  redo(currentState: UndoState): UndoState | null {
    if (this.redoStack.length === 0) return null;

    // Push current state to undo stack
    this.undoStack.push(currentState);

    // Pop and return next state
    return this.redoStack.pop()!;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get the label of the next undo operation
   */
  getUndoLabel(): string | null {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1].label;
  }

  /**
   * Get the label of the next redo operation
   */
  getRedoLabel(): string | null {
    if (this.redoStack.length === 0) return null;
    return this.redoStack[this.redoStack.length - 1].label;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Get current stack sizes (for debugging/UI)
   */
  getStackSizes(): { undo: number; redo: number } {
    return {
      undo: this.undoStack.length,
      redo: this.redoStack.length,
    };
  }

  /**
   * Clone an AudioBuffer (needed for storing snapshots)
   */
  static cloneBuffer(buffer: AudioBuffer): AudioBuffer {
    const newBuffer = new AudioBuffer({
      length: buffer.length,
      numberOfChannels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
    });

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const sourceData = buffer.getChannelData(ch);
      const destData = newBuffer.getChannelData(ch);
      destData.set(sourceData);
    }

    return newBuffer;
  }
}
