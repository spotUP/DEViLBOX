/**
 * ArrangementInteractionSM - Interaction state machine for arrangement canvas
 *
 * States: idle | moving-clips | resizing-clip-start | resizing-clip-end |
 *         select-box | drawing-clip | moving-playhead | editing-automation | erasing
 *
 * Plain TypeScript class (not React state) to avoid re-renders on every mousemove.
 * The RAF loop reads getRenderState() for visual feedback.
 *
 * Adapted from src/components/pianoroll/engine/InteractionStateMachine.ts
 */

import type { ArrangementClip, ArrangementToolMode } from '@/types/arrangement';
import type { HitTestResult } from './ArrangementHitTester';

export type ArrangementInteractionState =
  | 'idle'
  | 'moving-clips'
  | 'resizing-clip-start'
  | 'resizing-clip-end'
  | 'select-box'
  | 'drawing-clip'
  | 'moving-playhead'
  | 'editing-automation'
  | 'erasing'
  | 'resizing-track-height'
  | 'moving-loop-start'
  | 'moving-loop-end'
  | 'moving-automation-point'
  | 'adding-automation-point';

export interface ArrangementDragContext {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startRow: number;
  startTrackIndex: number;
  targetClipId: string | null;
  selectedAtStart: Set<string>;
  originalClips: ArrangementClip[];
  // For track height resize
  trackId?: string;
  startHeight?: number;
  // For loop region editing
  loopStart?: number;
  loopEnd?: number;
  // For automation editing
  automationLaneId?: string;
  automationPointIndex?: number;
  automationStartValue?: number;
  automationStartRow?: number;
}

export interface ArrangementRenderState {
  state: ArrangementInteractionState;
  ghostClips: ArrangementClip[];
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null;
  drawPreview: { trackId: string; startRow: number; endRow: number } | null;
  cursor: string;
  dirty: boolean;
}

export class ArrangementInteractionSM {
  private _state: ArrangementInteractionState = 'idle';
  private _tool: ArrangementToolMode = 'select';
  private _drag: ArrangementDragContext | null = null;
  private _ghostClips: ArrangementClip[] = [];
  private _selectionBox: ArrangementRenderState['selectionBox'] = null;
  private _drawPreview: ArrangementRenderState['drawPreview'] = null;
  private _cursor = 'default';
  private _dirty = true;

  get state(): ArrangementInteractionState { return this._state; }
  get tool(): ArrangementToolMode { return this._tool; }
  get drag(): ArrangementDragContext | null { return this._drag; }

  setTool(tool: ArrangementToolMode): void {
    this._tool = tool;
    this._dirty = true;
  }

  beginDrag(
    state: ArrangementInteractionState,
    canvasX: number,
    canvasY: number,
    row: number,
    trackIndex: number,
    targetClipId: string | null,
    selectedIds: Set<string>,
    originalClips: ArrangementClip[],
  ): void {
    this._state = state;
    this._drag = {
      startX: canvasX,
      startY: canvasY,
      currentX: canvasX,
      currentY: canvasY,
      startRow: row,
      startTrackIndex: trackIndex,
      targetClipId,
      selectedAtStart: new Set(selectedIds),
      originalClips: [...originalClips],
    };
    this._dirty = true;
  }

  updateDrag(canvasX: number, canvasY: number): void {
    if (!this._drag) return;
    this._drag.currentX = canvasX;
    this._drag.currentY = canvasY;
    this._dirty = true;
  }

  endDrag(): void {
    this._state = 'idle';
    this._drag = null;
    this._ghostClips = [];
    this._selectionBox = null;
    this._drawPreview = null;
    this._dirty = true;
  }

  setGhostClips(clips: ArrangementClip[]): void {
    this._ghostClips = clips;
    this._dirty = true;
  }

  setSelectionBox(box: ArrangementRenderState['selectionBox']): void {
    this._selectionBox = box;
    this._dirty = true;
  }

  setDrawPreview(preview: ArrangementRenderState['drawPreview']): void {
    this._drawPreview = preview;
    this._dirty = true;
  }

  updateCursor(hit: HitTestResult): void {
    let cursor: string;
    if (this._state !== 'idle') {
      switch (this._state) {
        case 'moving-clips': cursor = 'grabbing'; break;
        case 'resizing-clip-start':
        case 'resizing-clip-end': cursor = 'ew-resize'; break;
        case 'drawing-clip': cursor = 'crosshair'; break;
        case 'erasing': cursor = 'not-allowed'; break;
        case 'select-box': cursor = 'crosshair'; break;
        case 'moving-playhead': cursor = 'pointer'; break;
        case 'resizing-track-height': cursor = 'ns-resize'; break;
        case 'moving-loop-start':
        case 'moving-loop-end': cursor = 'ew-resize'; break;
        case 'moving-automation-point': cursor = 'move'; break;
        case 'adding-automation-point': cursor = 'crosshair'; break;
        default: cursor = 'default';
      }
    } else if (this._tool === 'draw') {
      cursor = 'crosshair';
    } else if (this._tool === 'erase') {
      cursor = 'not-allowed';
    } else if (this._tool === 'split') {
      cursor = 'col-resize';
    } else if (hit.type === 'clip') {
      switch (hit.zone) {
        case 'resize-start':
        case 'resize-end': cursor = 'ew-resize'; break;
        case 'body': cursor = 'grab'; break;
        default: cursor = 'default';
      }
    } else if (hit.type === 'ruler') {
      cursor = 'pointer';
    } else if (hit.type === 'track-resize') {
      cursor = 'ns-resize';
    } else if (hit.type === 'loop-start' || hit.type === 'loop-end') {
      cursor = 'ew-resize';
    } else if (hit.type === 'automation-point') {
      cursor = 'move';
    } else if (hit.type === 'automation-segment') {
      cursor = 'crosshair';
    } else {
      cursor = 'default';
    }

    if (cursor !== this._cursor) {
      this._cursor = cursor;
      this._dirty = true;
    }
  }

  getRenderState(): ArrangementRenderState {
    const rs: ArrangementRenderState = {
      state: this._state,
      ghostClips: this._ghostClips,
      selectionBox: this._selectionBox,
      drawPreview: this._drawPreview,
      cursor: this._cursor,
      dirty: this._dirty,
    };
    this._dirty = false;
    return rs;
  }

  getDragDelta(pixelsPerRow: number, trackEntryHeight: number): { deltaRow: number; deltaTrackIndex: number } {
    if (!this._drag) return { deltaRow: 0, deltaTrackIndex: 0 };
    const deltaRow = Math.round((this._drag.currentX - this._drag.startX) / pixelsPerRow);
    const deltaTrackIndex = Math.round((this._drag.currentY - this._drag.startY) / (trackEntryHeight || 60));
    return { deltaRow, deltaTrackIndex };
  }

  markDirty(): void {
    this._dirty = true;
  }
}
