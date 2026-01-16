/**
 * PianoRollGrid - Grid background and note rendering area
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { NoteBlock } from './NoteBlock';
import type { PianoRollNote } from '../../types/pianoRoll';
import { isBlackKey } from '../../types/pianoRoll';

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
  onNoteSelect: (noteId: string, addToSelection: boolean) => void;
  onNoteDragStart: (noteId: string, mode: 'move' | 'resize-end', e: React.MouseEvent) => void;
  onGridClick: (row: number, midiNote: number) => void;
  onScroll: (deltaX: number, deltaY: number) => void;
}

export const PianoRollGrid: React.FC<PianoRollGridProps> = ({
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
  onNoteSelect,
  onNoteDragStart,
  onGridClick,
  onScroll,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate visible range
  const visibleRows = useMemo(() => {
    if (!containerRef.current) return 64;
    return Math.ceil(containerRef.current.clientWidth / horizontalZoom) + 2;
  }, [horizontalZoom]);

  const visibleNotes = useMemo(() => {
    if (!containerRef.current) return 40;
    return Math.ceil(containerRef.current.clientHeight / verticalZoom) + 2;
  }, [verticalZoom]);

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

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const gridWidth = patternLength * horizontalZoom;
    const startRow = Math.floor(scrollX);
    const endRow = Math.ceil(scrollX + visibleRows);
    const gridStep = 4 / gridDivision; // Rows per grid line based on division

    // Vertical lines (beat/measure divisions)
    for (let row = startRow; row <= Math.min(endRow, patternLength); row++) {
      const x = (row - scrollX) * horizontalZoom;
      const isGridLine = row % gridStep === 0;
      const isBeat = row % 4 === 0;
      const isMeasure = row % 16 === 0;

      // Only show lines at grid subdivisions or higher
      if (!isGridLine && !isBeat && !isMeasure) continue;

      lines.push(
        <div
          key={`v-${row}`}
          className={`absolute top-0 bottom-0 ${
            isMeasure
              ? 'bg-gray-500/50'
              : isBeat
              ? 'bg-gray-600/40'
              : 'bg-gray-700/30'
          }`}
          style={{ left: x, width: 1 }}
        />
      );
    }

    // Horizontal lines (note lanes)
    for (let note = 0; note < visibleNotes; note++) {
      const midiNote = scrollY + 60 - note;
      if (midiNote < 0 || midiNote > 127) continue;

      const y = note * verticalZoom;
      const isC = midiNote % 12 === 0;
      const black = isBlackKey(midiNote);

      lines.push(
        <div
          key={`h-${midiNote}`}
          className={`absolute left-0 ${
            black ? 'bg-gray-800/50' : 'bg-gray-900/30'
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
  }, [scrollX, scrollY, horizontalZoom, verticalZoom, patternLength, visibleRows, visibleNotes, gridDivision]);

  // Playhead position
  const playheadX = playheadRow !== null
    ? (playheadRow - scrollX) * horizontalZoom
    : null;

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-gray-900"
      onWheel={handleWheel}
      onClick={handleGridClick}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none">
        {gridLines}
      </div>

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

export default PianoRollGrid;
