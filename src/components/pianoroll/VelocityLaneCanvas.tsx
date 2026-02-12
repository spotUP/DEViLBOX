/**
 * VelocityLaneCanvas - Canvas-based velocity editing lane
 *
 * Replaces DOM-based VelocityLane.tsx. Shows velocity bars for each note,
 * supports drag-to-edit with batched undo.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PianoRollNote } from '../../types/pianoRoll';

const LANE_HEIGHT = 80;

/** Channel colors matching NoteRenderer */
const CHANNEL_COLORS = [
  '#06b6d4', '#a855f7', '#22c55e', '#f59e0b',
  '#ec4899', '#3b82f6', '#ef4444', '#14b8a6',
];

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(true);
  const prevKeyRef = useRef('');
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const hoverNoteIdRef = useRef<string | null>(null);

  // ResizeObserver for width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) {
        setContainerWidth(w);
        dirtyRef.current = true;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Mark dirty on prop changes
  useEffect(() => {
    const key = `${horizontalZoom}_${scrollX}_${notes.length}_${selectedNotes.size}_${hoverNoteIdRef.current}_${containerWidth}`;
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      dirtyRef.current = true;
    }
  });

  // Refs for values needed inside the animation loop
  const notesRef = useRef(notes);
  const selectedNotesRef = useRef(selectedNotes);
  const horizontalZoomRef = useRef(horizontalZoom);
  const scrollXRef = useRef(scrollX);
  const containerWidthRef = useRef(containerWidth);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { selectedNotesRef.current = selectedNotes; }, [selectedNotes]);
  useEffect(() => { horizontalZoomRef.current = horizontalZoom; }, [horizontalZoom]);
  useEffect(() => { scrollXRef.current = scrollX; }, [scrollX]);
  useEffect(() => { containerWidthRef.current = containerWidth; }, [containerWidth]);

  // RAF render loop - defined inside effect to avoid self-referencing
  useEffect(() => {
    dirtyRef.current = true;

    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!dirtyRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      dirtyRef.current = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const cw = containerWidthRef.current;
      const dpr = window.devicePixelRatio || 1;
      const bufferW = Math.ceil(cw * dpr);
      const bufferH = Math.ceil(LANE_HEIGHT * dpr);

      if (canvas.width !== bufferW || canvas.height !== bufferH) {
        canvas.width = bufferW;
        canvas.height = bufferH;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${LANE_HEIGHT}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.fillStyle = '#0d0d0e';
      ctx.fillRect(0, 0, cw, LANE_HEIGHT);

      // Grid reference lines
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      for (const vel of [32, 64, 96, 127]) {
        const y = LANE_HEIGHT - (vel / 127) * LANE_HEIGHT;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(vel), 2, y);
      }

      // Velocity bars
      const hz = horizontalZoomRef.current;
      const sx = scrollXRef.current;
      const sel = selectedNotesRef.current;
      for (const note of notesRef.current) {
        const x = (note.startRow - sx) * hz;
        const w = (note.endRow - note.startRow) * hz;
        if (x + w < 0 || x > cw) continue;

        const barH = (note.velocity / 127) * LANE_HEIGHT;
        const barW = Math.max(3, w - 1);
        const isSelected = sel.has(note.id);
        const isHovered = hoverNoteIdRef.current === note.id;
        const color = CHANNEL_COLORS[note.channelIndex % CHANNEL_COLORS.length];

        ctx.globalAlpha = isSelected ? 1 : (isHovered ? 0.9 : 0.7);
        ctx.fillStyle = color;

        const barY = LANE_HEIGHT - barH;
        const r = Math.min(3, barW / 2, barH / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, barY);
        ctx.lineTo(x + barW - r, barY);
        ctx.quadraticCurveTo(x + barW, barY, x + barW, barY + r);
        ctx.lineTo(x + barW, LANE_HEIGHT);
        ctx.lineTo(x, LANE_HEIGHT);
        ctx.lineTo(x, barY + r);
        ctx.quadraticCurveTo(x, barY, x + r, barY);
        ctx.closePath();
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      }

      // VEL label
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('VEL', 4, 4);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ---- Mouse interaction ----

  const yToVelocity = useCallback((y: number): number => {
    const vel = Math.round(127 * (1 - y / LANE_HEIGHT));
    return Math.max(1, Math.min(127, vel));
  }, []);

  const findNoteAtX = useCallback((clientX: number): PianoRollNote | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const row = x / horizontalZoom + scrollX;

    // Find note closest to this row
    let best: PianoRollNote | null = null;
    let bestDist = Infinity;
    for (const note of notes) {
      if (row >= note.startRow && row < note.endRow) {
        const dist = Math.abs(x - ((note.startRow - scrollX) * horizontalZoom));
        if (dist < bestDist) {
          bestDist = dist;
          best = note;
        }
      }
    }
    return best;
  }, [notes, horizontalZoom, scrollX]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const note = findNoteAtX(e.clientX);
    if (!note) return;

    setDraggingNoteId(note.id);
    onBeginDrag();

    const y = e.clientY - rect.top;
    const velocity = yToVelocity(y);

    if (selectedNotes.has(note.id) && selectedNotes.size > 1) {
      onDragMultiVelocity(Array.from(selectedNotes), velocity);
    } else {
      onDragVelocity(note.id, velocity);
    }
    dirtyRef.current = true;
  }, [findNoteAtX, selectedNotes, onBeginDrag, onDragVelocity, onDragMultiVelocity, yToVelocity]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Hover tracking (uses ref to avoid re-renders)
    const note = findNoteAtX(e.clientX);
    const newHoverId = note?.id ?? null;
    if (newHoverId !== hoverNoteIdRef.current) {
      hoverNoteIdRef.current = newHoverId;
      dirtyRef.current = true;
    }

    if (!draggingNoteId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const velocity = yToVelocity(y);

    if (selectedNotes.has(draggingNoteId) && selectedNotes.size > 1) {
      onDragMultiVelocity(Array.from(selectedNotes), velocity);
    } else {
      onDragVelocity(draggingNoteId, velocity);
    }
    dirtyRef.current = true;
  }, [draggingNoteId, findNoteAtX, selectedNotes, onDragVelocity, onDragMultiVelocity, yToVelocity]);

  const handleMouseUp = useCallback(() => {
    if (draggingNoteId) {
      onEndDrag();
    }
    setDraggingNoteId(null);
  }, [draggingNoteId, onEndDrag]);

  // Scroll-wheel velocity adjustment (non-passive for preventDefault)
  const onAdjustVelocityRef = useRef(onAdjustVelocity);
  useEffect(() => { onAdjustVelocityRef.current = onAdjustVelocity; }, [onAdjustVelocity]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!onAdjustVelocityRef.current) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;

      // Find note under cursor
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const row = x / horizontalZoom + scrollX;
      let targetNote: PianoRollNote | null = null;
      for (const note of notes) {
        if (row >= note.startRow && row < note.endRow) {
          targetNote = note;
          break;
        }
      }
      if (!targetNote) return;

      // If note is in selection, adjust all selected; otherwise just this one
      const sel = selectedNotesRef.current;
      const ids = sel.has(targetNote.id) ? Array.from(sel) : [targetNote.id];
      onAdjustVelocityRef.current(ids, delta);
      dirtyRef.current = true;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [notes, horizontalZoom, scrollX]);

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 border-t border-dark-border overflow-hidden"
      style={{ height: LANE_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: LANE_HEIGHT }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
};

export const VelocityLaneCanvas = React.memo(VelocityLaneCanvasComponent);
export default VelocityLaneCanvas;
