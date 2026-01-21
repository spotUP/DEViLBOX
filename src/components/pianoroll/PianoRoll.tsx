/**
 * PianoRoll - Main piano roll editor container (full width)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PianoKeyboard } from './PianoKeyboard';
import { PianoRollGrid } from './PianoRollGrid';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import { usePianoRollData } from '../../hooks/pianoroll/usePianoRollData';
import { useTransportStore } from '../../stores';
import type { Pattern } from '../../types/tracker';
import {
  ZoomIn,
  ZoomOut,
  Grid3X3,
  MousePointer2,
  Pencil,
  Eraser,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface PianoRollProps {
  channelIndex?: number;
}

export const PianoRoll: React.FC<PianoRollProps> = ({ channelIndex }) => {
  const {
    view,
    selection,
    tool,
    setHorizontalZoom,
    setVerticalZoom,
    scrollBy,
    setSnapToGrid,
    setGridDivision,
    setShowVelocity,
    setChannelIndex,
    selectNote,
    clearSelection,
    setTool,
    startDrag,
    updateDrag,
    endDrag,
  } = usePianoRollStore();

  const { notes, pattern, addNote, deleteNote, moveNote, resizeNote } = usePianoRollData(
    channelIndex ?? view.channelIndex
  );
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const currentRow = useTransportStore((state) => state.currentRow);

  // Container ref for measuring height
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  // Sync channel index from props
  useEffect(() => {
    if (channelIndex !== undefined) {
      setChannelIndex(channelIndex);
    }
  }, [channelIndex, setChannelIndex]);

  // Auto-scroll during playback to keep playhead at piano keys edge
  const prevCurrentRowRef = useRef<number | null>(null);
  const prevPatternRef = useRef<Pattern | null>(null);
  useEffect(() => {
    if (isPlaying && currentRow !== null) {
      // Check if pattern changed (handles pattern switching in pattern order)
      const patternChanged = prevPatternRef.current !== pattern;

      if (patternChanged) {
        // Pattern changed - reset scroll to start
        usePianoRollStore.setState({
          view: {
            ...usePianoRollStore.getState().view,
            scrollX: 0,
          },
        });
        prevPatternRef.current = pattern;
        prevCurrentRowRef.current = currentRow;
      } else if (prevCurrentRowRef.current === null || currentRow >= prevCurrentRowRef.current) {
        // Normal forward playback - keep playhead at piano keys edge
        const targetPlayheadX = 48; // Piano keyboard width
        const currentPlayheadX = (currentRow - view.scrollX) * view.horizontalZoom;

        // If playhead has moved past the target position, scroll forward
        if (currentPlayheadX > targetPlayheadX + view.horizontalZoom) {
          const newScrollX = currentRow - (targetPlayheadX / view.horizontalZoom);
          usePianoRollStore.setState({
            view: {
              ...usePianoRollStore.getState().view,
              scrollX: Math.max(0, newScrollX),
            },
          });
        }
        prevCurrentRowRef.current = currentRow;
      }
    } else {
      prevCurrentRowRef.current = null;
      prevPatternRef.current = null;
    }
  }, [isPlaying, currentRow, pattern, view.scrollX, view.horizontalZoom]);

  // Measure container height on mount and resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        // Subtract toolbar height (approx 44px)
        const height = containerRef.current.clientHeight - 44;
        setContainerHeight(Math.max(200, height));
      }
    };

    updateHeight();

    // Use ResizeObserver for responsive updates
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate visible notes range based on actual container height
  const visibleNotes = useMemo(() => {
    return Math.ceil(containerHeight / view.verticalZoom) + 2;
  }, [containerHeight, view.verticalZoom]);

  // Calculate how many octaves are visible
  const visibleOctaves = useMemo(() => {
    return Math.floor(visibleNotes / 12);
  }, [visibleNotes]);

  // Track which MIDI notes are currently playing at the playhead
  const activeNotes = useMemo(() => {
    if (!isPlaying || currentRow === null) return new Set<number>();

    const active = new Set<number>();
    notes.forEach((note) => {
      // Check if currentRow is within note's duration
      if (currentRow >= note.startRow && currentRow < note.endRow) {
        active.add(note.midiNote);
      }
    });
    return active;
  }, [isPlaying, currentRow, notes]);

  // Handle note selection
  const handleNoteSelect = useCallback(
    (noteId: string, addToSelection: boolean) => {
      if (tool === 'erase') {
        deleteNote(noteId);
      } else {
        selectNote(noteId, addToSelection);
      }
    },
    [tool, deleteNote, selectNote]
  );

  // Handle note drag start
  const handleNoteDragStart = useCallback(
    (noteId: string, mode: 'move' | 'resize-end', e: React.MouseEvent) => {
      startDrag(mode, e.clientX, e.clientY, noteId);
    },
    [startDrag]
  );

  // Handle grid click (add note or clear selection)
  const handleGridClick = useCallback(
    (row: number, midiNote: number) => {
      if (tool === 'draw') {
        // Add a note with default duration based on grid division
        const duration = view.snapToGrid ? 4 / view.gridDivision : 1;
        addNote(midiNote, row, Math.max(1, Math.floor(duration)), 100, view.channelIndex);
      } else if (tool === 'select') {
        clearSelection();
      }
    },
    [tool, view.snapToGrid, view.gridDivision, view.channelIndex, addNote, clearSelection]
  );

  // Handle scroll
  const handleScroll = useCallback(
    (deltaX: number, deltaY: number) => {
      scrollBy(deltaX, deltaY);
    },
    [scrollBy]
  );

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!usePianoRollStore.getState().drag.isDragging) return;
      updateDrag(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      const drag = usePianoRollStore.getState().drag;
      if (!drag.isDragging || !drag.noteId) {
        endDrag();
        return;
      }

      // Calculate delta in rows and pitch
      const deltaX = drag.currentX - drag.startX;
      const deltaY = drag.currentY - drag.startY;
      const deltaRow = Math.round(deltaX / view.horizontalZoom);
      const deltaPitch = -Math.round(deltaY / view.verticalZoom);

      if (drag.mode === 'move') {
        moveNote(drag.noteId, deltaRow, deltaPitch);
      } else if (drag.mode === 'resize-end') {
        const note = notes.find((n) => n.id === drag.noteId);
        if (note) {
          resizeNote(drag.noteId, note.endRow + deltaRow);
        }
      }

      endDrag();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [view.horizontalZoom, view.verticalZoom, notes, moveNote, resizeNote, updateDrag, endDrag]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Delete selected notes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        selection.notes.forEach((noteId) => deleteNote(noteId));
        clearSelection();
      }

      // Tool shortcuts
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'p' || e.key === 'P') setTool('draw');
      if (e.key === 'e' || e.key === 'E') setTool('erase');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection.notes, deleteNote, clearSelection, setTool]);

  const patternLength = pattern?.length || 64;

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-dark-bgSecondary">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-bgTertiary shrink-0">
        {/* Tool buttons */}
        <div className="flex items-center bg-dark-bg rounded-md p-0.5">
          <button
            onClick={() => setTool('select')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'select'
                ? 'bg-accent-primary text-text-inverse'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="Select (V)"
          >
            <MousePointer2 size={14} />
          </button>
          <button
            onClick={() => setTool('draw')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'draw'
                ? 'bg-accent-primary text-text-inverse'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="Draw (P)"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setTool('erase')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'erase'
                ? 'bg-accent-primary text-text-inverse'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="Erase (E)"
          >
            <Eraser size={14} />
          </button>
        </div>

        <div className="w-px h-4 bg-dark-border" />

        {/* Horizontal Zoom controls */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">H</span>
          <button
            onClick={() => setHorizontalZoom(view.horizontalZoom * 0.8)}
            className="p-1 text-text-muted hover:text-text-primary"
            title="Zoom out horizontally"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-text-muted w-6 text-center">
            {Math.round(view.horizontalZoom)}
          </span>
          <button
            onClick={() => setHorizontalZoom(view.horizontalZoom * 1.25)}
            className="p-1 text-text-muted hover:text-text-primary"
            title="Zoom in horizontally"
          >
            <ZoomIn size={14} />
          </button>
        </div>

        {/* Vertical Zoom controls */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">V</span>
          <button
            onClick={() => setVerticalZoom(view.verticalZoom - 2)}
            className="p-1 text-text-muted hover:text-text-primary"
            title="Zoom out vertically (show more octaves)"
          >
            <Minimize2 size={14} />
          </button>
          <span className="text-xs text-text-muted w-10 text-center" title={`${visibleOctaves} octaves visible`}>
            {visibleOctaves}oct
          </span>
          <button
            onClick={() => setVerticalZoom(view.verticalZoom + 2)}
            className="p-1 text-text-muted hover:text-text-primary"
            title="Zoom in vertically (show fewer octaves)"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <div className="w-px h-4 bg-dark-border" />

        {/* Grid snap */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSnapToGrid(!view.snapToGrid)}
            className={`p-1 rounded transition-colors ${
              view.snapToGrid ? 'text-accent-primary' : 'text-text-muted'
            }`}
            title="Snap to grid"
          >
            <Grid3X3 size={14} />
          </button>
          <select
            value={view.gridDivision}
            onChange={(e) => setGridDivision(Number(e.target.value))}
            className="px-1.5 py-0.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary"
            title="Grid division"
          >
            <option value={1}>1/1</option>
            <option value={2}>1/2</option>
            <option value={4}>1/4</option>
            <option value={8}>1/8</option>
            <option value={16}>1/16</option>
          </select>
        </div>

        <div className="w-px h-4 bg-dark-border" />

        {/* Velocity display toggle */}
        <button
          onClick={() => setShowVelocity(!view.showVelocity)}
          className={`p-1 rounded transition-colors ${
            view.showVelocity ? 'text-accent-primary' : 'text-text-muted'
          }`}
          title="Show velocity"
        >
          {view.showVelocity ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>

        {/* Channel selector (if not passed as prop) */}
        {channelIndex === undefined && pattern && (
          <>
            <div className="w-px h-4 bg-dark-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">CH</span>
              <select
                value={view.channelIndex}
                onChange={(e) => setChannelIndex(Number(e.target.value))}
                className="px-1.5 py-0.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary"
              >
                {pattern.channels.map((ch, idx) => (
                  <option key={idx} value={idx}>
                    {String(idx + 1).padStart(2, '0')} {ch.name ? `- ${ch.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Notes count */}
        <div className="flex-1" />
        <span className="text-xs text-text-muted">
          {notes.length} notes
          {selection.notes.size > 0 && ` (${selection.notes.size} selected)`}
        </span>
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex w-full overflow-hidden min-h-0">
        {/* Piano keyboard */}
        <PianoKeyboard
          verticalZoom={view.verticalZoom}
          scrollY={view.scrollY}
          visibleNotes={visibleNotes}
          containerHeight={containerHeight}
          activeNotes={activeNotes}
        />

        {/* Grid and notes */}
        <PianoRollGrid
          notes={notes}
          patternLength={patternLength}
          horizontalZoom={view.horizontalZoom}
          verticalZoom={view.verticalZoom}
          scrollX={view.scrollX}
          scrollY={view.scrollY}
          gridDivision={view.gridDivision}
          showVelocity={view.showVelocity}
          selectedNotes={selection.notes}
          playheadRow={isPlaying ? currentRow : null}
          containerHeight={containerHeight}
          onNoteSelect={handleNoteSelect}
          onNoteDragStart={handleNoteDragStart}
          onGridClick={handleGridClick}
          onScroll={handleScroll}
        />
      </div>
    </div>
  );
};

export default PianoRoll;
