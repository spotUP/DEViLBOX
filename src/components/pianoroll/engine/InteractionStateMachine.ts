/**
 * InteractionStateMachine - Tool modes + drag state machine for piano roll
 *
 * This is a plain TypeScript class (not React state) to avoid re-renders
 * on every mousemove. The RAF loop reads getRenderState() for visual feedback.
 *
 * States: Idle | Drawing | MovingNotes | ResizingStart | ResizingEnd |
 *         SelectBox | VelocityDrag | VelocityLine | Erasing
 */

import type { PianoRollNote } from '../../../types/pianoRoll';
import type { HitResult } from './HitTester';

export type InteractionState =
  | 'idle'
  | 'drawing'
  | 'moving'
  | 'resizing-start'
  | 'resizing-end'
  | 'select-box'
  | 'velocity-drag'
  | 'velocity-line'
  | 'erasing';

export type ToolMode = 'select' | 'draw' | 'erase';

export interface DragContext {
  /** Canvas-relative start position */
  startX: number;
  startY: number;
  /** Current canvas-relative position */
  currentX: number;
  currentY: number;
  /** Musical start position */
  startRow: number;
  startNote: number;
  /** The note that initiated the drag (if any) */
  targetNoteId: string | null;
  /** Snapshot of selected note IDs at drag start */
  selectedAtStart: Set<string>;
  /** Snapshot of notes before drag (for move/resize preview) */
  originalNotes: PianoRollNote[];
}

export interface RenderState {
  /** Current interaction state */
  state: InteractionState;
  /** Ghost notes to render during move/resize/draw */
  ghostNotes: PianoRollNote[];
  /** Selection box in canvas coords (during select-box) */
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Cursor style */
  cursor: string;
  /** Whether state changed since last read */
  dirty: boolean;
}

export class InteractionStateMachine {
  private _state: InteractionState = 'idle';
  private _tool: ToolMode = 'select';
  private _drag: DragContext | null = null;
  private _ghostNotes: PianoRollNote[] = [];
  private _selectionBox: RenderState['selectionBox'] = null;
  private _cursor = 'default';
  private _dirty = true;

  get state(): InteractionState { return this._state; }
  get tool(): ToolMode { return this._tool; }
  get drag(): DragContext | null { return this._drag; }

  setTool(tool: ToolMode): void {
    this._tool = tool;
    this._dirty = true;
  }

  /**
   * Begin a drag interaction.
   */
  beginDrag(
    state: InteractionState,
    canvasX: number,
    canvasY: number,
    row: number,
    note: number,
    targetNoteId: string | null,
    selectedIds: Set<string>,
    originalNotes: PianoRollNote[],
  ): void {
    this._state = state;
    this._drag = {
      startX: canvasX,
      startY: canvasY,
      currentX: canvasX,
      currentY: canvasY,
      startRow: row,
      startNote: note,
      targetNoteId,
      selectedAtStart: new Set(selectedIds),
      originalNotes: [...originalNotes],
    };
    this._dirty = true;
  }

  /**
   * Update drag position. Call on every mousemove during drag.
   */
  updateDrag(canvasX: number, canvasY: number): void {
    if (!this._drag) return;
    this._drag.currentX = canvasX;
    this._drag.currentY = canvasY;
    this._dirty = true;
  }

  /**
   * End the current drag interaction.
   */
  endDrag(): void {
    this._state = 'idle';
    this._drag = null;
    this._ghostNotes = [];
    this._selectionBox = null;
    this._dirty = true;
  }

  /**
   * Set ghost notes for visual preview.
   */
  setGhostNotes(notes: PianoRollNote[]): void {
    this._ghostNotes = notes;
    this._dirty = true;
  }

  /**
   * Set selection box for rubber-band selection.
   */
  setSelectionBox(box: RenderState['selectionBox']): void {
    this._selectionBox = box;
    this._dirty = true;
  }

  /**
   * Update cursor based on hit result and tool.
   */
  updateCursor(hit: HitResult | null): void {
    let cursor: string;
    if (this._state !== 'idle') {
      // During drag, keep appropriate cursor
      switch (this._state) {
        case 'moving': cursor = 'move'; break;
        case 'resizing-start':
        case 'resizing-end': cursor = 'ew-resize'; break;
        case 'drawing': cursor = 'crosshair'; break;
        case 'erasing': cursor = 'not-allowed'; break;
        case 'select-box': cursor = 'crosshair'; break;
        default: cursor = 'default';
      }
    } else if (this._tool === 'draw') {
      cursor = 'crosshair';
    } else if (this._tool === 'erase') {
      cursor = 'not-allowed';
    } else if (hit) {
      switch (hit.zone) {
        case 'resize-start':
        case 'resize-end': cursor = 'ew-resize'; break;
        case 'body': cursor = 'move'; break;
        default: cursor = 'default';
      }
    } else {
      cursor = 'default';
    }

    if (cursor !== this._cursor) {
      this._cursor = cursor;
      this._dirty = true;
    }
  }

  /**
   * Get current render state for the RAF loop.
   * Clears the dirty flag.
   */
  getRenderState(): RenderState {
    const rs: RenderState = {
      state: this._state,
      ghostNotes: this._ghostNotes,
      selectionBox: this._selectionBox,
      cursor: this._cursor,
      dirty: this._dirty,
    };
    this._dirty = false;
    return rs;
  }

  /**
   * Compute delta in rows and notes from drag start to current position.
   */
  getDragDelta(horizontalZoom: number, verticalZoom: number): { deltaRow: number; deltaPitch: number } {
    if (!this._drag) return { deltaRow: 0, deltaPitch: 0 };
    const deltaRow = Math.round((this._drag.currentX - this._drag.startX) / horizontalZoom);
    const deltaPitch = -Math.round((this._drag.currentY - this._drag.startY) / verticalZoom);
    return { deltaRow, deltaPitch };
  }

  /** Mark as needing redraw */
  markDirty(): void {
    this._dirty = true;
  }
}
