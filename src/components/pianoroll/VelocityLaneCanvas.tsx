/**
 * VelocityLaneCanvas - Canvas-based velocity editing lane
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Mouse interaction (drag to edit, scroll-wheel adjust) stays on the main thread.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { PianoRollNote } from '../../types/pianoRoll';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import VelocityWorkerFactory from '@/workers/velocity-lane.worker.ts?worker';

import type { VelocityMsg, VelocityState } from '@engine/renderer/worker-types';

const LANE_HEIGHT = 80;

interface VelocityLaneCanvasProps {
  notes: PianoRollNote[];
  horizontalZoom: number;
  scrollX: number;
  selectedNotes: Set<string>;
  onBeginDrag: () => void;
  onDragVelocity: (noteId: string, velocity: number) => void;
  onDragMultiVelocity: (noteIds: string[], velocity: number) => void;
  onEndDrag: () => void;
  onAdjustVelocity?: (noteIds: string[], delta: number) => void;
}

const VelocityLaneCanvasComponent: React.FC<VelocityLaneCanvasProps> = ({
  notes,
  horizontalZoom,
  scrollX,
  selectedNotes,
  onBeginDrag,
  onDragVelocity,
  onDragMultiVelocity,
  onEndDrag,
  onAdjustVelocity,
}) => {
  const containerRef    = useRef<HTMLDivElement>(null);
  const bridgeRef       = useRef<OffscreenBridge<VelocityMsg, { type: string }> | null>(null);
  const containerWidthRef = useRef(800);
  const draggingNoteIdRef = useRef<string | null>(null);
  const hoverNoteIdRef    = useRef<string | null>(null);

  // Keep prop refs for use in event handlers / wheel listener
  const notesRef         = useRef(notes);
  const selectedNotesRef = useRef(selectedNotes);
  const horizontalZoomRef = useRef(horizontalZoom);
  const scrollXRef       = useRef(scrollX);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { selectedNotesRef.current = selectedNotes; }, [selectedNotes]);
  useEffect(() => { horizontalZoomRef.current = horizontalZoom; }, [horizontalZoom]);
  useEffect(() => { scrollXRef.current = scrollX; }, [scrollX]);

  // ── Bridge init ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:100%;height:${LANE_HEIGHT}px;`;
    container.appendChild(canvas);

    const w   = Math.max(1, container.clientWidth);
    const dpr = window.devicePixelRatio || 1;
    containerWidthRef.current = w;

    const offscreen = canvas.transferControlToOffscreen();
    const bridge = new OffscreenBridge<VelocityMsg, { type: string }>(
      VelocityWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init', canvas: offscreen, dpr,
      state: snapshotState(w),
    }, [offscreen]);

    // ResizeObserver
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) {
        containerWidthRef.current = w;
        bridgeRef.current?.post({ type: 'resize', w, dpr: window.devicePixelRatio || 1 });
        // Also re-send full state with new width so rendering stays correct
        bridgeRef.current?.post({ type: 'state', state: snapshotState(w) });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Forward prop changes ─────────────────────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({
      type: 'state',
      state: snapshotState(containerWidthRef.current),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, horizontalZoom, scrollX, selectedNotes]);

  function snapshotState(cw: number): VelocityState {
    return {
      notes:          notes.map((n) => ({ id: n.id, startRow: n.startRow, endRow: n.endRow, velocity: n.velocity, instrument: n.instrument })),
      horizontalZoom,
      scrollX,
      selectedNotes:  Array.from(selectedNotes),
      containerWidth: cw,
    };
  }

  // ── Mouse interaction (main thread) ──────────────────────────────────────────

  const yToVelocity = useCallback((y: number): number => {
    const vel = Math.round(127 * (1 - y / LANE_HEIGHT));
    return Math.max(1, Math.min(127, vel));
  }, []);

  const findNoteAtX = useCallback((clientX: number): PianoRollNote | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x   = clientX - rect.left;
    const row = x / horizontalZoomRef.current + scrollXRef.current;
    let best: PianoRollNote | null = null;
    let bestDist = Infinity;
    for (const note of notesRef.current) {
      if (row >= note.startRow && row < note.endRow) {
        const dist = Math.abs(x - ((note.startRow - scrollXRef.current) * horizontalZoomRef.current));
        if (dist < bestDist) { bestDist = dist; best = note; }
      }
    }
    return best;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const note = findNoteAtX(e.clientX);
    if (!note) return;
    draggingNoteIdRef.current = note.id;
    if (containerRef.current) containerRef.current.style.cursor = 'ns-resize';
    onBeginDrag();
    const y = e.clientY - rect.top;
    const velocity = yToVelocity(y);
    const sel = selectedNotesRef.current;
    if (sel.has(note.id) && sel.size > 1) {
      onDragMultiVelocity(Array.from(sel), velocity);
    } else {
      onDragVelocity(note.id, velocity);
    }
    bridgeRef.current?.post({ type: 'state', state: snapshotState(containerWidthRef.current) });
  }, [findNoteAtX, onBeginDrag, onDragVelocity, onDragMultiVelocity, yToVelocity]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const note = findNoteAtX(e.clientX);
    const newId = note?.id ?? null;
    if (newId !== hoverNoteIdRef.current) {
      hoverNoteIdRef.current = newId;
      bridgeRef.current?.post({ type: 'hover', noteId: newId });
      // Update cursor imperatively (no React re-render needed)
      if (containerRef.current && !draggingNoteIdRef.current) {
        containerRef.current.style.cursor = newId ? 'ns-resize' : 'default';
      }
    }

    const dragging = draggingNoteIdRef.current;
    if (!dragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const velocity = yToVelocity(y);
    const sel = selectedNotesRef.current;
    if (sel.has(dragging) && sel.size > 1) {
      onDragMultiVelocity(Array.from(sel), velocity);
    } else {
      onDragVelocity(dragging, velocity);
    }
    bridgeRef.current?.post({ type: 'state', state: snapshotState(containerWidthRef.current) });
  }, [findNoteAtX, onDragVelocity, onDragMultiVelocity, yToVelocity]);

  const handleMouseUp = useCallback(() => {
    if (draggingNoteIdRef.current) onEndDrag();
    draggingNoteIdRef.current = null;
    if (containerRef.current) {
      containerRef.current.style.cursor = hoverNoteIdRef.current ? 'ns-resize' : 'default';
    }
  }, [onEndDrag]);

  // Wheel velocity adjustment (non-passive)
  const onAdjustVelocityRef = useRef(onAdjustVelocity);
  useEffect(() => { onAdjustVelocityRef.current = onAdjustVelocity; }, [onAdjustVelocity]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (!onAdjustVelocityRef.current) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const row = x / horizontalZoomRef.current + scrollXRef.current;
      let target: PianoRollNote | null = null;
      for (const note of notesRef.current) {
        if (row >= note.startRow && row < note.endRow) { target = note; break; }
      }
      if (!target) return;
      const sel = selectedNotesRef.current;
      const ids = sel.has(target.id) ? Array.from(sel) : [target.id];
      onAdjustVelocityRef.current(ids, delta);
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 shrink-0 border-t border-dark-border overflow-hidden"
      style={{ height: LANE_HEIGHT }}
      title="Velocity Editor: Click or drag velocity bars to adjust. Scroll wheel for fine adjustment."
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
};

export const VelocityLaneCanvas = React.memo(VelocityLaneCanvasComponent);
export default VelocityLaneCanvas;
