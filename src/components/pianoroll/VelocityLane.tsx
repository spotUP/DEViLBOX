/**
 * VelocityLane - Velocity editing lane at bottom of piano roll
 * Shows velocity bars for each note, supports drag-to-edit and velocity ramp
 */

import React, { useRef, useCallback, useMemo, useState } from 'react';
import type { PianoRollNote } from '../../types/pianoRoll';

interface VelocityLaneProps {
  notes: PianoRollNote[];
  horizontalZoom: number;
  scrollX: number;
  selectedNotes: Set<string>;
  onVelocityChange: (noteId: string, velocity: number) => void;
  onMultiVelocityChange: (noteIds: string[], velocity: number) => void;
  onBeginDrag: () => void;
  onDragVelocity: (noteId: string, velocity: number) => void;
  onDragMultiVelocity: (noteIds: string[], velocity: number) => void;
  onEndDrag: () => void;
}

const LANE_HEIGHT = 80;

const VelocityLaneComponent: React.FC<VelocityLaneProps> = ({
  notes,
  horizontalZoom,
  scrollX,
  selectedNotes,
  onVelocityChange: _onVelocityChange,
  onMultiVelocityChange: _onMultiVelocityChange,
  onBeginDrag,
  onDragVelocity,
  onDragMultiVelocity,
  onEndDrag,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [hoverNoteId, setHoverNoteId] = useState<string | null>(null);

  // Convert Y position to velocity (0-127)
  const yToVelocity = useCallback((y: number): number => {
    const vel = Math.round(127 * (1 - y / LANE_HEIGHT));
    return Math.max(1, Math.min(127, vel));
  }, []);

  // Handle mouse down on velocity bar — snapshot undo state once
  const handleMouseDown = useCallback((noteId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingNoteId(noteId);
    onBeginDrag();

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const velocity = yToVelocity(y);

    // Use no-undo versions during drag
    if (selectedNotes.has(noteId) && selectedNotes.size > 1) {
      onDragMultiVelocity(Array.from(selectedNotes), velocity);
    } else {
      onDragVelocity(noteId, velocity);
    }
  }, [selectedNotes, onBeginDrag, onDragVelocity, onDragMultiVelocity, yToVelocity]);

  // Handle mouse move for dragging — no undo per move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingNoteId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const velocity = yToVelocity(y);

    if (selectedNotes.has(draggingNoteId) && selectedNotes.size > 1) {
      onDragMultiVelocity(Array.from(selectedNotes), velocity);
    } else {
      onDragVelocity(draggingNoteId, velocity);
    }
  }, [draggingNoteId, selectedNotes, onDragVelocity, onDragMultiVelocity, yToVelocity]);

  // Handle mouse up — commit single undo entry for entire drag
  const handleMouseUp = useCallback(() => {
    if (draggingNoteId) {
      onEndDrag();
    }
    setDraggingNoteId(null);
  }, [draggingNoteId, onEndDrag]);

  // Generate velocity bars
  const bars = useMemo(() => {
    return notes.map(note => {
      const x = (note.startRow - scrollX) * horizontalZoom;
      const width = (note.endRow - note.startRow) * horizontalZoom;
      if (x + width < 0 || x > 2000) return null;

      const barHeight = (note.velocity / 127) * LANE_HEIGHT;
      const isSelected = selectedNotes.has(note.id);
      const isHovered = hoverNoteId === note.id;

      // Color based on channel
      const channelColors = [
        '#06b6d4', '#a855f7', '#22c55e', '#f59e0b',
        '#ec4899', '#3b82f6', '#ef4444', '#14b8a6',
      ];
      const color = channelColors[note.channelIndex % channelColors.length];

      return (
        <div
          key={note.id}
          className="absolute bottom-0 cursor-ns-resize"
          style={{
            left: x,
            width: Math.max(3, width - 1),
            height: barHeight,
            backgroundColor: color,
            opacity: isSelected ? 1 : (isHovered ? 0.9 : 0.7),
            border: isSelected ? '1px solid #facc15' : 'none',
            borderRadius: '2px 2px 0 0',
            transition: 'opacity 75ms',
          }}
          onMouseDown={(e) => handleMouseDown(note.id, e)}
          onMouseEnter={() => setHoverNoteId(note.id)}
          onMouseLeave={() => setHoverNoteId(null)}
          title={`Velocity: ${note.velocity}`}
        />
      );
    }).filter(Boolean);
  }, [notes, horizontalZoom, scrollX, selectedNotes, hoverNoteId, handleMouseDown]);

  // Grid lines for velocity reference
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    [32, 64, 96, 127].forEach((vel, _i) => {
      const y = LANE_HEIGHT - (vel / 127) * LANE_HEIGHT;
      lines.push(
        <div key={vel} className="absolute left-0 right-0 pointer-events-none" style={{ top: y }}>
          <div className="border-t border-gray-700/40 w-full" />
          <span className="absolute left-1 text-[8px] text-text-muted/40 -translate-y-full">{vel}</span>
        </div>
      );
    });
    return lines;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative bg-gray-900/80 border-t border-dark-border overflow-hidden shrink-0"
      style={{ height: LANE_HEIGHT }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Grid reference lines */}
      {gridLines}

      {/* Label */}
      <div className="absolute top-1 left-1 text-[9px] text-text-muted/50 pointer-events-none z-10">VEL</div>

      {/* Velocity bars */}
      {bars}
    </div>
  );
};

export const VelocityLane = React.memo(VelocityLaneComponent);
