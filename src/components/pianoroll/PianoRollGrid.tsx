/**
 * PianoRollGrid - Grid background and note rendering area
 * Supports selection box, ghost notes, scale highlighting, and multi-channel
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { NoteBlock } from './NoteBlock';
import type { PianoRollNote } from '../../types/pianoRoll';
import { isBlackKey } from '../../types/pianoRoll';
import { usePianoRollStore } from '../../stores/usePianoRollStore';

interface PianoRollGridProps {
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
  containerHeight?: number;
  scaleNotes?: Set<number>;
  onNoteSelect: (noteId: string, addToSelection: boolean) => void;
  onNoteDragStart: (noteId: string, mode: 'move' | 'resize-end', e: React.MouseEvent) => void;
  onGridClick: (row: number, midiNote: number) => void;
  onGridRightClick: (row: number, midiNote: number, x: number, y: number) => void;
  onScroll: (deltaX: number, deltaY: number) => void;
  onSelectionBoxStart: (row: number, midiNote: number, e: React.MouseEvent) => void;
}

const PianoRollGridComponent: React.FC<PianoRollGridProps> = ({
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
  onNoteSelect,
  onNoteDragStart,
  onGridClick,
  onGridRightClick,
  onScroll,
  onSelectionBoxStart,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Get ghost notes and selection box from store
  const ghostNotes = usePianoRollStore((state) => state.ghostNotes);
  const drag = usePianoRollStore((state) => state.drag);

  // Track container width for proper grid sizing
  const [containerWidth, setContainerWidth] = React.useState(800);

  React.useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate visible range
  const visibleRows = useMemo(() => {
    return Math.ceil(containerWidth / horizontalZoom) + 2;
  }, [horizontalZoom, containerWidth]);

  const visibleNotes = useMemo(() => {
    const height = containerHeight || containerRef.current?.clientHeight || 400;
    return Math.ceil(height / verticalZoom) + 2;
  }, [verticalZoom, containerHeight]);

  // Handle wheel scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      // Horizontal scroll with shift or trackpad horizontal
      const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
      const deltaY = e.shiftKey ? 0 : e.deltaY;

      // Convert pixels to rows/notes
      const rowDelta = deltaX / horizontalZoom;
      const noteDelta = -deltaY / verticalZoom; // Invert for natural scrolling

      onScroll(rowDelta, noteDelta);
    },
    [horizontalZoom, verticalZoom, onScroll]
  );

  // Handle click on grid (empty space)
  const handleGridClick = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      // Ignore right click
      if (e.button === 2) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Convert to row and note
      const row = Math.floor(x / horizontalZoom) + scrollX;
      const midiNote = scrollY + 60 - Math.floor(y / verticalZoom);

      onGridClick(Math.max(0, row), Math.max(0, Math.min(127, midiNote)));
    },
    [horizontalZoom, verticalZoom, scrollX, scrollY, onGridClick]
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const row = Math.floor(x / horizontalZoom) + scrollX;
      const midiNote = scrollY + 60 - Math.floor(y / verticalZoom);

      onGridRightClick(Math.max(0, row), Math.max(0, Math.min(127, midiNote)), e.clientX, e.clientY);
    },
    [horizontalZoom, verticalZoom, scrollX, scrollY, onGridRightClick]
  );

  // Handle mousedown for selection box
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current || e.button !== 0) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const row = Math.floor(x / horizontalZoom) + scrollX;
      const midiNote = scrollY + 60 - Math.floor(y / verticalZoom);

      onSelectionBoxStart(Math.max(0, row), Math.max(0, Math.min(127, midiNote)), e);
    },
    [horizontalZoom, verticalZoom, scrollX, scrollY, onSelectionBoxStart]
  );

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const patternPixelWidth = patternLength * horizontalZoom;
    const gridWidth = Math.max(containerWidth, patternPixelWidth);
    const startRow = Math.floor(scrollX);
    const endRow = Math.ceil(scrollX + visibleRows);
    const gridStep = 4 / gridDivision;

    const maxVisibleRow = Math.max(endRow, Math.ceil((containerWidth / horizontalZoom) + scrollX));

    // Vertical lines (beat/measure divisions)
    for (let row = startRow; row <= maxVisibleRow; row++) {
      const x = (row - scrollX) * horizontalZoom;
      const isGridLine = row % gridStep === 0;
      const isBeat = row % 4 === 0;
      const isMeasure = row % 16 === 0;

      const beyondPattern = row > patternLength;

      if (!isGridLine && !isBeat && !isMeasure) continue;

      lines.push(
        <div
          key={`v-${row}`}
          className={`absolute top-0 bottom-0 ${
            beyondPattern
              ? 'bg-gray-700/20'
              : isMeasure
              ? 'bg-gray-500/50'
              : isBeat
              ? 'bg-gray-600/40'
              : 'bg-gray-700/30'
          }`}
          style={{ left: x, width: 1 }}
        />
      );
    }

    // Horizontal lines (note lanes) with scale highlighting
    for (let note = 0; note < visibleNotes; note++) {
      const midiNote = scrollY + 60 - note;
      if (midiNote < 0 || midiNote > 127) continue;

      const y = note * verticalZoom;
      const isC = midiNote % 12 === 0;
      const black = isBlackKey(midiNote);
      const noteInOctave = midiNote % 12;
      const outOfScale = scaleNotes && !scaleNotes.has(noteInOctave);

      lines.push(
        <div
          key={`h-${midiNote}`}
          className={`absolute left-0 ${
            outOfScale
              ? 'bg-gray-900/70'
              : black ? 'bg-gray-800/50' : 'bg-gray-900/30'
          } ${isC ? 'border-t border-gray-500/50' : ''}`}
          style={{
            top: y,
            height: verticalZoom,
            width: gridWidth,
          }}
        />
      );
    }

    return lines;
  }, [scrollX, scrollY, horizontalZoom, verticalZoom, patternLength, visibleRows, visibleNotes, gridDivision, containerWidth, scaleNotes]);

  // Playhead position
  const playheadX = playheadRow !== null
    ? (playheadRow - scrollX) * horizontalZoom
    : null;

  // Get current tool for cursor
  const tool = usePianoRollStore((state) => state.tool);
  const cursorStyle = tool === 'draw' ? 'cursor-crosshair' : tool === 'erase' ? 'cursor-not-allowed' : 'cursor-default';

  // Compute selection box rectangle
  const selectionBoxRect = useMemo(() => {
    if (drag.mode !== 'select-box' || !drag.isDragging) return null;
    if (!containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();
    const sx = Math.min(drag.startX, drag.currentX) - rect.left;
    const sy = Math.min(drag.startY, drag.currentY) - rect.top;
    const sw = Math.abs(drag.currentX - drag.startX);
    const sh = Math.abs(drag.currentY - drag.startY);

    return { left: sx, top: sy, width: sw, height: sh };
  }, [drag]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 w-full h-full relative overflow-hidden bg-gray-900 ${cursorStyle}`}
      onWheel={handleWheel}
      onClick={handleGridClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      role="grid"
      aria-label="Piano roll note grid"
    >
      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none">
        {gridLines}
      </div>

      {/* Ghost notes (drag preview) */}
      {ghostNotes.map((note) => (
        <NoteBlock
          key={`ghost-${note.id}`}
          note={note}
          horizontalZoom={horizontalZoom}
          verticalZoom={verticalZoom}
          scrollX={scrollX}
          scrollY={scrollY}
          isSelected={false}
          showVelocity={false}
          isGhost={true}
        />
      ))}

      {/* Notes */}
      {notes.map((note) => (
        <NoteBlock
          key={note.id}
          note={note}
          horizontalZoom={horizontalZoom}
          verticalZoom={verticalZoom}
          scrollX={scrollX}
          scrollY={scrollY}
          isSelected={selectedNotes.has(note.id)}
          showVelocity={showVelocity}
          onSelect={onNoteSelect}
          onDragStart={onNoteDragStart}
        />
      ))}

      {/* Selection box overlay */}
      {selectionBoxRect && (
        <div
          className="absolute border-2 border-accent-primary/60 bg-accent-primary/10 pointer-events-none z-20"
          style={selectionBoxRect}
        />
      )}

      {/* Playhead */}
      {playheadX !== null && playheadX >= 0 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-accent-primary pointer-events-none z-10"
          style={{ left: playheadX }}
        />
      )}

      {/* Pattern end marker */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-red-500/50 pointer-events-none"
        style={{ left: (patternLength - scrollX) * horizontalZoom }}
      />
    </div>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const PianoRollGrid = React.memo(PianoRollGridComponent);
export default PianoRollGrid;
