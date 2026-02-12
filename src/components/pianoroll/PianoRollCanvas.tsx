/**
 * PianoRollCanvas - Main canvas-based piano roll grid
 *
 * Replaces PianoRollGrid + NoteBlock with a single <canvas> element.
 * Uses RAF loop, OffscreenCanvas grid caching, DPR-aware rendering,
 * and ResizeObserver for responsive sizing.
 *
 * Render data is stored in refs to keep the RAF callback stable.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Viewport } from './engine/Viewport';
import { GridRenderer } from './engine/GridRenderer';
import { NoteRenderer } from './engine/NoteRenderer';
import { HitTester } from './engine/HitTester';
import type { PianoRollNote } from '../../types/pianoRoll';
import type { DragState } from '../../types/pianoRoll';
import { usePianoRollStore } from '../../stores/usePianoRollStore';

interface PianoRollCanvasProps {
  notes: PianoRollNote[];
  patternLength: number;
  horizontalZoom: number;
  verticalZoom: number;
  scrollX: number;
  scrollY: number;
  gridDivision: number;
  showVelocity: boolean;
  selectedNotes: Set<string>;
  playheadRow: number | null;
  containerHeight: number;
  scaleNotes?: Set<number>;
  tool: 'select' | 'draw' | 'erase';
  onNoteSelect: (noteId: string, addToSelection: boolean) => void;
  onNoteDragStart: (noteId: string, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => void;
  onGridClick: (row: number, midiNote: number) => void;
  onGridRightClick: (row: number, midiNote: number, x: number, y: number) => void;
  onScroll: (deltaX: number, deltaY: number) => void;
  onSelectionBoxStart: (row: number, midiNote: number, e: React.MouseEvent) => void;
  onNoteErase: (noteId: string) => void;
  onGridDraw?: (row: number, midiNote: number) => void;
}

/** Render data stored in a ref to avoid re-creating the RAF callback */
interface RenderData {
  notes: PianoRollNote[];
  selectedNotes: Set<string>;
  showVelocity: boolean;
  ghostNotes: PianoRollNote[];
  playheadRow: number | null;
  gridDivision: number;
  patternLength: number;
  scaleNotes: Set<number> | undefined;
  containerHeight: number;
  drag: DragState;
}

const PianoRollCanvasComponent: React.FC<PianoRollCanvasProps> = ({
  notes,
  patternLength,
  horizontalZoom,
  verticalZoom,
  scrollX,
  scrollY,
  gridDivision,
  showVelocity,
  selectedNotes,
  playheadRow,
  containerHeight,
  scaleNotes,
  tool,
  onNoteSelect,
  onNoteDragStart,
  onGridClick,
  onGridRightClick,
  onScroll,
  onSelectionBoxStart,
  onNoteErase,
  onGridDraw,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const widthRef = useRef(800);

  // Engine instances (stable refs)
  const viewportRef = useRef(new Viewport());
  const gridRendererRef = useRef(new GridRenderer());
  const noteRendererRef = useRef(new NoteRenderer());
  const hitTesterRef = useRef(new HitTester());
  const lastPaintedCellRef = useRef<string | null>(null); // "row_midi" for draw-continuous

  // Render data ref (updated each render, read by RAF loop)
  const renderDataRef = useRef<RenderData>({
    notes: [],
    selectedNotes: new Set(),
    showVelocity: true,
    ghostNotes: [],
    playheadRow: null,
    gridDivision: 4,
    patternLength: 64,
    scaleNotes: undefined,
    containerHeight: 400,
    drag: { isDragging: false, mode: 'none', startX: 0, startY: 0, currentX: 0, currentY: 0, noteId: null, originalNotes: [] },
  });

  // Track dirty state (separate flags for main canvas vs playhead overlay)
  const dirtyRef = useRef(true);
  const playheadDirtyRef = useRef(true);
  const prevPropsRef = useRef<string>('');
  const prevPlayheadRef = useRef<number | null>(null);

  // Ghost notes from store
  const ghostNotes = usePianoRollStore((state) => state.ghostNotes);
  const drag = usePianoRollStore((state) => state.drag);

  // Sync render data ref via effect (not during render)
  useEffect(() => {
    renderDataRef.current.notes = notes;
    renderDataRef.current.selectedNotes = selectedNotes;
    renderDataRef.current.showVelocity = showVelocity;
    renderDataRef.current.ghostNotes = ghostNotes;
    renderDataRef.current.playheadRow = playheadRow;
    renderDataRef.current.gridDivision = gridDivision;
    renderDataRef.current.patternLength = patternLength;
    renderDataRef.current.scaleNotes = scaleNotes;
    renderDataRef.current.containerHeight = containerHeight;
    renderDataRef.current.drag = drag;
  });

  // Update viewport when props change
  useEffect(() => {
    const vp = viewportRef.current;
    vp.update({
      scrollX, scrollY,
      horizontalZoom, verticalZoom,
      width: widthRef.current,
      height: containerHeight,
    });
    dirtyRef.current = true;
  }, [scrollX, scrollY, horizontalZoom, verticalZoom, containerHeight]);

  // Rebuild hit tester when notes or viewport changes
  useEffect(() => {
    hitTesterRef.current.rebuild(notes, viewportRef.current);
    dirtyRef.current = true;
  }, [notes, scrollX, scrollY, horizontalZoom, verticalZoom]);

  // Mark dirty when relevant props change (playhead tracked separately)
  useEffect(() => {
    const key = `${scrollX}_${scrollY}_${horizontalZoom}_${verticalZoom}_${gridDivision}_${patternLength}_${notes.length}_${selectedNotes.size}_${showVelocity}_${ghostNotes.length}_${drag.isDragging}_${drag.currentX}_${drag.currentY}`;
    if (key !== prevPropsRef.current) {
      prevPropsRef.current = key;
      dirtyRef.current = true;
      playheadDirtyRef.current = true; // viewport changed, playhead position shifts too
    }
    // Playhead-only changes (no main canvas redraw needed)
    if (playheadRow !== prevPlayheadRef.current) {
      prevPlayheadRef.current = playheadRow;
      playheadDirtyRef.current = true;
    }
  });

  // ---- ResizeObserver ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      widthRef.current = w;
      viewportRef.current.update({ width: w });
      hitTesterRef.current.rebuild(notes, viewportRef.current);
      dirtyRef.current = true;
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [notes]);

  // ---- RAF render loop (defined inside effect to avoid self-referencing) ----
  useEffect(() => {
    dirtyRef.current = true;

    const tick = () => {
      const canvas = canvasRef.current;
      const phCanvas = playheadCanvasRef.current;
      if (!canvas || !phCanvas) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const ctx = canvas.getContext('2d');
      const phCtx = phCanvas.getContext('2d');
      if (!ctx || !phCtx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const vp = viewportRef.current;
      const dpr = window.devicePixelRatio || 1;
      const rd = renderDataRef.current;

      // Resize canvases if needed
      const displayW = widthRef.current;
      const displayH = rd.containerHeight;
      const bufferW = Math.ceil(displayW * dpr);
      const bufferH = Math.ceil(displayH * dpr);

      if (canvas.width !== bufferW || canvas.height !== bufferH) {
        canvas.width = bufferW;
        canvas.height = bufferH;
        canvas.style.width = `${displayW}px`;
        canvas.style.height = `${displayH}px`;
        dirtyRef.current = true;
      }

      if (phCanvas.width !== bufferW || phCanvas.height !== bufferH) {
        phCanvas.width = bufferW;
        phCanvas.height = bufferH;
        phCanvas.style.width = `${displayW}px`;
        phCanvas.style.height = `${displayH}px`;
        playheadDirtyRef.current = true;
      }

      // Main canvas: grid + notes + selection box
      if (dirtyRef.current) {
        dirtyRef.current = false;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // 1. Draw cached grid
        const gridCanvas = gridRendererRef.current.render(
          vp, rd.gridDivision, rd.patternLength, rd.scaleNotes, dpr,
        );
        if (gridCanvas) {
          ctx.drawImage(gridCanvas, 0, 0, displayW, displayH);
        }

        // 2. Draw notes
        noteRendererRef.current.render(
          ctx, vp, rd.notes, rd.selectedNotes, rd.showVelocity, rd.ghostNotes,
        );

        // 3. Draw selection box (from drag state)
        if (rd.drag.isDragging && rd.drag.mode === 'select-box') {
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            const sx1 = rd.drag.startX - containerRect.left;
            const sy1 = rd.drag.startY - containerRect.top;
            const sx2 = rd.drag.currentX - containerRect.left;
            const sy2 = rd.drag.currentY - containerRect.top;
            noteRendererRef.current.drawSelectionBox(ctx, sx1, sy1, sx2, sy2);
          }
        }
      }

      // Playhead overlay canvas (redraws independently)
      if (playheadDirtyRef.current) {
        playheadDirtyRef.current = false;

        phCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        phCtx.clearRect(0, 0, displayW, displayH);

        if (rd.playheadRow !== null) {
          noteRendererRef.current.drawPlayhead(phCtx, vp, rd.playheadRow);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // ---- Mouse event handlers ----

  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number; row: number; midiNote: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, row: 0, midiNote: 60 };
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const vp = viewportRef.current;
    const row = Math.floor(vp.pixelXToRow(x));
    const midiNote = Math.floor(vp.pixelYToNote(y));
    return {
      x, y,
      row: Math.max(0, row),
      midiNote: Math.max(0, Math.min(127, midiNote)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return; // Context menu handled separately
    if (e.button !== 0) return;

    const { x, y, row, midiNote } = getCanvasCoords(e);
    const hit = hitTesterRef.current.hitTest(x, y);

    if (tool === 'erase') {
      if (hit) {
        onNoteErase(hit.note.id);
      }
      return;
    }

    if (tool === 'draw') {
      if (hit) {
        // Clicking on existing note in draw mode - select it
        onNoteSelect(hit.note.id, e.shiftKey || e.ctrlKey || e.metaKey);
      } else {
        // Click on empty space - add note
        onGridClick(row, midiNote);
        lastPaintedCellRef.current = `${row}_${midiNote}`;
      }
      return;
    }

    // Select tool
    if (hit) {
      // Select the note
      onNoteSelect(hit.note.id, e.shiftKey || e.ctrlKey || e.metaKey);

      // Start drag (move or resize)
      const mode = hit.zone === 'resize-end' ? 'resize-end'
        : hit.zone === 'resize-start' ? 'resize-start'
        : 'move';
      onNoteDragStart(hit.note.id, mode as 'move' | 'resize-start' | 'resize-end', e);
    } else {
      // Click on empty space - start selection box
      onSelectionBoxStart(row, midiNote, e);
    }
  }, [tool, getCanvasCoords, onNoteSelect, onNoteDragStart, onGridClick, onSelectionBoxStart, onNoteErase]);

  // Tooltip ref for showing note info on hover
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e);

    // Update cursor based on tool and hit
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = hitTesterRef.current.getCursor(x, y, tool);
    }

    // Tooltip: show note info on hover (only when not dragging)
    const tooltip = tooltipRef.current;
    if (tooltip && e.buttons === 0) {
      const hit = hitTesterRef.current.hitTest(x, y);
      if (hit) {
        const n = hit.note;
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(n.midiNote / 12) - 1;
        const name = `${names[n.midiNote % 12]}${octave}`;
        const len = n.endRow - n.startRow;
        tooltip.textContent = `${name}  vel:${n.velocity}  len:${len}`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${x + 12}px`;
        tooltip.style.top = `${y - 24}px`;
      } else if (tooltip) {
        tooltip.style.display = 'none';
      }
    } else if (tooltip) {
      tooltip.style.display = 'none';
    }

    // Erase on drag
    if (tool === 'erase' && e.buttons === 1) {
      const hit = hitTesterRef.current.hitTest(x, y);
      if (hit) {
        onNoteErase(hit.note.id);
      }
    }

    // Draw-continuous: paint notes while dragging in draw mode
    if (tool === 'draw' && e.buttons === 1 && onGridDraw) {
      const { row, midiNote } = getCanvasCoords(e);
      const cellKey = `${row}_${midiNote}`;
      if (cellKey !== lastPaintedCellRef.current) {
        // Only paint if no note exists at this position
        const hit2 = hitTesterRef.current.hitTest(x, y);
        if (!hit2) {
          onGridDraw(row, midiNote);
          lastPaintedCellRef.current = cellKey;
        }
      }
    }
  }, [tool, getCanvasCoords, onNoteErase, onGridDraw]);

  const handleMouseUp = useCallback(() => {
    lastPaintedCellRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (tooltip) tooltip.style.display = 'none';
    lastPaintedCellRef.current = null;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { row, midiNote } = getCanvasCoords(e);
    onGridRightClick(row, midiNote, e.clientX, e.clientY);
  }, [getCanvasCoords, onGridRightClick]);

  // Ref for onScroll callback (used by non-passive wheel handler)
  const onScrollRef = useRef(onScroll);
  useEffect(() => { onScrollRef.current = onScroll; }, [onScroll]);

  // Non-passive wheel handler (React onWheel is passive, can't preventDefault)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
      const deltaY = e.shiftKey ? 0 : e.deltaY;
      const rowDelta = deltaX / vp.horizontalZoom;
      const noteDelta = -deltaY / vp.verticalZoom;
      onScrollRef.current(rowDelta, noteDelta);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full relative overflow-hidden"
      style={{ height: containerHeight }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        role="grid"
        aria-label="Piano roll note grid"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      <canvas
        ref={playheadCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.85)',
          color: '#e8e8ec',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 10,
          fontFamily: 'Inter, system-ui, sans-serif',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}
      />
    </div>
  );
};

export const PianoRollCanvas = React.memo(PianoRollCanvasComponent);
export default PianoRollCanvas;
