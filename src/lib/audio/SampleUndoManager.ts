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

/** Default heap budget for retained undo/redo snapshots (256 MB). */
export const DEFAULT_UNDO_MAX_BYTES = 256 * 1024 * 1024;

export class SampleUndoManager {
  private undoStack: UndoState[] = [];
  private redoStack: UndoState[] = [];
  private maxHistory: number;
  private maxBytes: number;

  constructor(maxHistory: number = 20, maxBytes: number = DEFAULT_UNDO_MAX_BYTES) {
    this.maxHistory = maxHistory;
    this.maxBytes = maxBytes;
  }

  /**
   * Approximate retained size of one snapshot: the AudioBuffer's Float32 backing
   * store is `length` frames × `channels` × 4 bytes. This is what actually sits
   * in the renderer heap for a snapshot (labels/loop points are negligible).
   */
  private static stateBytes(state: UndoState): number {
    const b = state.buffer;
    return b.length * b.numberOfChannels * 4;
  }

  /** Total heap retained across both stacks. Exposed for UI / diagnostics. */
  getRetainedBytes(): number {
    let sum = 0;
    for (const s of this.undoStack) sum += SampleUndoManager.stateBytes(s);
    for (const s of this.redoStack) sum += SampleUndoManager.stateBytes(s);
    return sum;
  }

  /**
   * Evict oldest snapshots until within BOTH the entry-count cap and the byte
   * budget. The byte budget is the important one: with large samples a single
   * snapshot is tens of MB, so an entry-count-only cap (the old behaviour) let
   * 20–40 full-buffer clones accumulate to 1–2.5 GB and OOM-crash the tab,
   * losing all unsaved work. Oldest undo history is dropped first, then oldest
   * redo; the single most-recent undo snapshot is always kept so one undo
   * remains possible even for a sample larger than the whole budget.
   */
  private enforceBudget(): void {
    // Entry-count cap (oldest-first) — secondary bound.
    while (this.undoStack.length > this.maxHistory) this.undoStack.shift();

    // Byte budget — primary bound. Never drop the last remaining undo snapshot.
    while (
      this.getRetainedBytes() > this.maxBytes &&
      this.undoStack.length + this.redoStack.length > 1
    ) {
      if (this.undoStack.length > 1) {
        this.undoStack.shift();
      } else if (this.redoStack.length > 0) {
        this.redoStack.shift();
      } else {
        break;
      }
    }
  }

  /**
   * Save current state before an operation
   */
  pushState(state: UndoState): void {
    // Clear redo stack on new action
    this.redoStack = [];

    // Add to undo stack
    this.undoStack.push(state);

    this.enforceBudget();
  }

  /**
   * Undo: Pop from undo stack, push current state to redo
   */
  undo(currentState: UndoState): UndoState | null {
    if (this.undoStack.length === 0) return null;

    // Push current state to redo stack
    this.redoStack.push(currentState);

    // Pop the previous state (removed from the stack, so not counted below).
    const prev = this.undoStack.pop()!;
    this.enforceBudget();
    return prev;
  }

  /**
   * Redo: Pop from redo stack, push current state to undo
   */
  redo(currentState: UndoState): UndoState | null {
    if (this.redoStack.length === 0) return null;

    // Push current state to undo stack
    this.undoStack.push(currentState);

    // Pop the next state (removed from the stack, so not counted below).
    const next = this.redoStack.pop()!;
    this.enforceBudget();
    return next;
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
