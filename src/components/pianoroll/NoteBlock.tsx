/**
 * NoteBlock - Individual note visualization in piano roll
 */

import React, { useCallback } from 'react';
import type { PianoRollNote } from '../../types/pianoRoll';

interface NoteBlockProps {
  note: PianoRollNote;
  horizontalZoom: number;    // Pixels per row
  verticalZoom: number;      // Pixels per semitone
  scrollX: number;           // Horizontal scroll offset (rows)
  scrollY: number;           // Vertical scroll offset (MIDI note)
  isSelected: boolean;
  showVelocity: boolean;
  onSelect?: (noteId: string, addToSelection: boolean) => void;
  onDragStart?: (noteId: string, mode: 'move' | 'resize-end', e: React.MouseEvent) => void;
}

const NoteBlockComponent: React.FC<NoteBlockProps> = ({
  note,
  horizontalZoom,
  verticalZoom,
  scrollX,
  scrollY,
  isSelected,
  showVelocity,
  onSelect,
  onDragStart,
}) => {
  // Calculate position and size
  const x = (note.startRow - scrollX) * horizontalZoom;
  const width = (note.endRow - note.startRow) * horizontalZoom;
  const y = (scrollY + 60 - note.midiNote) * verticalZoom; // 60 notes visible range center

  // Don't render if off-screen
  if (x + width < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
    return null;
  }

  // Handle mouse down for selection and drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;

      // Check if clicking on resize handle (right edge)
      const isResizeHandle = relativeX > width - 8;

      // Select note
      onSelect?.(note.id, e.shiftKey || e.ctrlKey || e.metaKey);

      // Start drag
      if (onDragStart) {
        onDragStart(note.id, isResizeHandle ? 'resize-end' : 'move', e);
      }
    },
    [note.id, width, onSelect, onDragStart]
  );

  // Velocity as percentage for visual indicator
  const velocityPercent = (note.velocity / 127) * 100;

  // Color based on channel
  const channelColors = [
    'bg-cyan-500',
    'bg-purple-500',
    'bg-green-500',
    'bg-amber-500',
    'bg-pink-500',
    'bg-blue-500',
    'bg-red-500',
    'bg-teal-500',
  ];
  const bgColor = channelColors[note.channelIndex % channelColors.length];

  return (
    <div
      className={`
        absolute rounded-sm cursor-move select-none
        ${bgColor}
        ${isSelected ? 'ring-2 ring-accent-primary ring-opacity-100 brightness-125 z-10' : 'ring-1 ring-black/30'}
        hover:brightness-125 hover:ring-accent-primary/50 hover:z-20
        transition-all duration-75
        shadow-md hover:shadow-lg
      `}
      style={{
        left: x,
        top: y,
        width: Math.max(4, width - 1), // Minimum visible width, gap between notes
        height: verticalZoom - 1,
        opacity: 0.8 + (note.velocity / 127) * 0.2, // Velocity affects opacity
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Velocity bar */}
      {showVelocity && width > 20 && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/30"
          style={{ height: `${100 - velocityPercent}%` }}
        />
      )}

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors"
      />
    </div>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const NoteBlock = React.memo(NoteBlockComponent);
export default NoteBlock;
