/**
 * PixiDragManager — Drag state machine for knobs, sliders, and crossfaders.
 * Handles vertical/horizontal delta tracking, sensitivity, snapping, and double-click reset.
 */

import type { FederatedPointerEvent, Container } from 'pixi.js';

export interface DragConfig {
  /** Drag axis: 'vertical' for knobs/vertical sliders, 'horizontal' for crossfader */
  axis: 'vertical' | 'horizontal' | 'both';
  /** Pixels of mouse movement for a full 0→1 range */
  sensitivity: number;
  /** Current value (0-1 normalized) */
  value: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Optional step quantization (e.g., 0.01 for 100 steps) */
  step?: number;
  /** Optional center detent value (for bipolar controls) */
  detent?: number;
  /** Detent snap range in value units */
  detentRange?: number;
  /** Whether to invert the drag direction */
  invert?: boolean;
}

export interface DragCallbacks {
  onDragStart?: (value: number) => void;
  onDragMove?: (value: number, delta: number) => void;
  onDragEnd?: (value: number) => void;
  onDoubleClick?: () => void;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startValue: number;
  lastClickTime: number;
}

/**
 * Attaches drag interaction to a PixiJS display object.
 * Returns a cleanup function.
 */
export function attachDrag(
  target: Container,
  config: DragConfig,
  callbacks: DragCallbacks,
  getConfig?: () => DragConfig,
): () => void {
  const state: DragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startValue: 0,
    lastClickTime: 0,
  };

  const DOUBLE_CLICK_THRESHOLD = 300;

  function getActiveConfig(): DragConfig {
    return getConfig ? getConfig() : config;
  }

  function clampAndSnap(value: number, cfg: DragConfig): number {
    let v = Math.max(cfg.min, Math.min(cfg.max, value));

    // Step quantization
    if (cfg.step) {
      v = Math.round(v / cfg.step) * cfg.step;
    }

    // Center detent snapping
    if (cfg.detent !== undefined && cfg.detentRange) {
      if (Math.abs(v - cfg.detent) < cfg.detentRange) {
        v = cfg.detent;
      }
    }

    return v;
  }

  function onPointerDown(e: FederatedPointerEvent) {
    const now = Date.now();

    // Double-click detection
    if (now - state.lastClickTime < DOUBLE_CLICK_THRESHOLD) {
      callbacks.onDoubleClick?.();
      state.lastClickTime = 0;
      return;
    }
    state.lastClickTime = now;

    const cfg = getActiveConfig();
    state.isDragging = true;
    state.startX = e.globalX;
    state.startY = e.globalY;
    state.startValue = cfg.value;

    target.cursor = 'grabbing';
    callbacks.onDragStart?.(cfg.value);

    // Listen on the stage for move/up so drag continues outside the target
    const stage = target.stage;
    if (stage) {
      stage.on('pointermove', onPointerMove);
      stage.on('pointerup', onPointerUp);
      stage.on('pointerupoutside', onPointerUp);
    }
  }

  function onPointerMove(e: FederatedPointerEvent) {
    if (!state.isDragging) return;

    const cfg = getActiveConfig();
    const range = cfg.max - cfg.min;

    let delta: number;
    if (cfg.axis === 'vertical') {
      const dy = state.startY - e.globalY; // Up = positive
      delta = (cfg.invert ? -dy : dy) / cfg.sensitivity * range;
    } else if (cfg.axis === 'horizontal') {
      const dx = e.globalX - state.startX; // Right = positive
      delta = (cfg.invert ? -dx : dx) / cfg.sensitivity * range;
    } else {
      const dy = state.startY - e.globalY;
      const dx = e.globalX - state.startX;
      delta = ((cfg.invert ? -1 : 1) * (dy + dx)) / cfg.sensitivity * range;
    }

    // Fine mode: shift key = 10x precision
    if (e.shiftKey) {
      delta *= 0.1;
    }

    const newValue = clampAndSnap(state.startValue + delta, cfg);
    callbacks.onDragMove?.(newValue, delta);
  }

  function onPointerUp(_e: FederatedPointerEvent) {
    if (!state.isDragging) return;
    state.isDragging = false;
    target.cursor = 'pointer';

    const cfg = getActiveConfig();
    callbacks.onDragEnd?.(cfg.value);

    const stage = target.stage;
    if (stage) {
      stage.off('pointermove', onPointerMove);
      stage.off('pointerup', onPointerUp);
      stage.off('pointerupoutside', onPointerUp);
    }
  }

  // Set up the target
  target.eventMode = 'static';
  target.cursor = 'pointer';
  target.on('pointerdown', onPointerDown);

  // Cleanup function
  return () => {
    target.off('pointerdown', onPointerDown);
    const stage = target.stage;
    if (stage) {
      stage.off('pointermove', onPointerMove);
      stage.off('pointerup', onPointerUp);
      stage.off('pointerupoutside', onPointerUp);
    }
  };
}
