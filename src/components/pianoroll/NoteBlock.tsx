/**
 * NoteBlock - Individual note visualization in piano roll
 * Supports velocity bars, slide/accent indicators, and ghost note rendering
 */

import React, { useCallback } from 'react';
import type { PianoRollNote } from '../../types/pianoRoll';
import { getNoteNameFromMidi } from '../../types/pianoRoll';

interface NoteBlockProps {
  note: PianoRollNote;
  horizontalZoom: number;    // Pixels per row
  verticalZoom: number;      // Pixels per semitone
  scrollX: number;           // Horizontal scroll offset (rows)
  scrollY: number;           // Vertical scroll offset (MIDI note)
  isSelected: boolean;
  showVelocity: boolean;
  isGhost?: boolean;         // Render as ghost/preview note
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
  isGhost = false,
  onSelect,
  onDragStart,
}) => {
  // Calculate position and size
  const x = (note.startRow - scrollX) * horizontalZoom;
  const width = (note.endRow - note.startRow) * horizontalZoom;
  const y = (scrollY + 60 - note.midiNote) * verticalZoom; // 60 notes visible range center

  // Handle mouse down for selection and drag (must be before conditional return)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isGhost) return;
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
    [note.id, width, isGhost, onSelect, onDragStart]
  );

  // Don't render if off-screen (use container-relative check)
  if (x + width < -50 || x > 3000 || y < -50 || y > 2000) {
    return null;
  }

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

  // Show note name when note is wide enough
  const showNoteName = width > 30 && verticalZoom >= 10;
  const noteName = getNoteNameFromMidi(note.midiNote);

  if (isGhost) {
    return (
      <div
        className={`absolute rounded-sm pointer-events-none ${bgColor}`}
        style={{
          left: x,
          top: y,
          width: Math.max(4, width - 1),
          height: verticalZoom - 1,
          opacity: 0.3,
          border: '1px dashed rgba(255,255,255,0.5)',
        }}
      />
    );
  }

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
      title={`${noteName} vel:${note.velocity}${note.slide ? ' [SLIDE]' : ''}${note.accent ? ' [ACCENT]' : ''}`}
      role="button"
      aria-label={`Note ${noteName}, velocity ${note.velocity}${note.slide ? ', slide' : ''}${note.accent ? ', accent' : ''}`}
      tabIndex={0}
    >
      {/* Note name label */}
      {showNoteName && (
        <span className="absolute left-1 top-0 text-[8px] text-white/80 font-mono leading-none pointer-events-none"
          style={{ lineHeight: `${verticalZoom - 1}px` }}
        >
          {noteName}
        </span>
      )}

      {/* Velocity bar */}
      {showVelocity && width > 20 && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/30 pointer-events-none"
          style={{ height: `${100 - velocityPercent}%` }}
        />
      )}

      {/* TB-303 Slide indicator */}
      {note.slide && (
        <div className="absolute top-0 right-3 w-1.5 h-full bg-yellow-400/60 pointer-events-none" />
      )}

      {/* TB-303 Accent indicator */}
      {note.accent && (
        <div className="absolute top-0 left-0 w-0 h-0 pointer-events-none"
          style={{
            borderLeft: '6px solid rgba(255,100,0,0.8)',
            borderBottom: '6px solid transparent',
          }}
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
