/**
 * PianoRoll - Main piano roll editor container (full width)
 *
 * Features:
 * - Draw/Select/Erase tools
 * - Rubber-band selection box
 * - Copy/Paste (Ctrl+C/V)
 * - Undo/Redo integration (Ctrl+Z/Y)
 * - Velocity editing lane
 * - Note preview on piano keys
 * - QWERTY keyboard note input
 * - Right-click context menu
 * - Drag preview (ghost notes)
 * - TB-303 slide/accent toggles
 * - Scale-constrained draw mode
 * - Note length presets
 * - Multi-channel view
 * - Quantize tool
 * - Playback from timeline click
 * - ARIA accessibility
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { PianoKeyboardCanvas } from './PianoKeyboardCanvas';
import { PianoRollCanvas } from './PianoRollCanvas';
import { VelocityLaneCanvas } from './VelocityLaneCanvas';
import { PianoRollContextMenu } from './PianoRollContextMenu';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import { usePianoRollData } from '../../hooks/pianoroll/usePianoRollData';
import { useTransportStore } from '../../stores';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useTrackerStore } from '../../stores';
import { useInstrumentStore } from '../../stores';
import { getToneEngine } from '../../engine/ToneEngine';
import type { Pattern } from '../../types/tracker';
import type { PianoRollNote } from '../../types/pianoRoll';
import { NOTE_LENGTH_PRESETS, getNoteNameFromMidi } from '../../types/pianoRoll';
import { SCALES, getScaleNotes } from '../../lib/scales';
import { AcidPatternGeneratorDialog } from '@components/dialogs/AcidPatternGeneratorDialog';
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
  Wand2,
  BarChart3,
  Music,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { useUIStore } from '../../stores';
import { focusPopout } from '../ui/PopOutWindow';

// QWERTY keyboard note mapping (defined outside component to avoid re-creation per render)
const QWERTY_NOTE_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

interface PianoRollProps {
  channelIndex?: number;
}

export const PianoRoll: React.FC<PianoRollProps> = ({ channelIndex }) => {
  const {
    view,
    selection,
    tool,
    drag,
    clipboard,
    setHorizontalZoom,
    setVerticalZoom,
    setScroll,
    setSnapToGrid,
    setGridDivision,
    setShowVelocity,
    setShowVelocityLane,
    setChannelIndex,
    setMultiChannel,
    setScaleKey,
    setScaleRoot,
    setNoteLengthPreset,
    selectNote,
    selectNotes,
    selectAll,
    clearSelection,
    setTool,
    startDrag,
    updateDrag,
    endDrag,
    copyNotes,
    showContextMenu,
    hideContextMenu,
    setGhostNotes,
  } = usePianoRollStore();

  const {
    notes, pattern, addNote, deleteNote, deleteNotes, moveNote, resizeNote, resizeNoteStart,
    beginVelocityDrag, setVelocityNoUndo, setMultipleVelocitiesNoUndo, endVelocityDrag,
    setMultipleVelocities, toggleSlide, toggleAccent,
    quantizeNotes, transposeNotes, adjustNoteLengths, duplicateNotes, adjustVelocities,
    pasteNotes,
  } = usePianoRollData(
    view.multiChannel ? undefined : (channelIndex ?? view.channelIndex)
  );

  const isPlaying = useTransportStore((state) => state.isPlaying);
  const currentRow = useTransportStore((state) => state.currentRow);

  const { instruments, currentInstrumentId } = useInstrumentStore();

  // Container ref for measuring height
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  // Acid pattern generator state
  const [showAcidGenerator, setShowAcidGenerator] = useState(false);

  // Note preview state
  const previewingNote = useRef<string | null>(null);

  // Sync channel index from props
  useEffect(() => {
    if (channelIndex !== undefined) {
      setChannelIndex(channelIndex);
    }
  }, [channelIndex, setChannelIndex]);

  // Auto-scroll to center on notes when they first appear or pattern changes
  const autoScrollDoneForPattern = useRef<number | null>(null);
  useEffect(() => {
    if (notes.length === 0) return;
    // Only auto-scroll once per pattern
    const patIdx = useTrackerStore.getState().currentPatternIndex;
    if (autoScrollDoneForPattern.current === patIdx) return;
    autoScrollDoneForPattern.current = patIdx;

    // Find the center of the note range
    const midiNotes = notes.map(n => n.midiNote);
    const minNote = Math.min(...midiNotes);
    const maxNote = Math.max(...midiNotes);
    const centerNote = (minNote + maxNote) / 2;

    // Scroll so centerNote is in the middle of the viewport
    // noteToPixelY(centerNote) = (scrollY + 60 - centerNote) * verticalZoom = gridHeight / 2
    // scrollY = centerNote - 60 + gridHeight / (2 * verticalZoom)
    const viewHeight = containerHeight - (view.showVelocityLane ? 80 : 0);
    const newScrollY = centerNote - 60 + viewHeight / (2 * view.verticalZoom);
    setScroll(0, Math.max(0, Math.min(127, newScrollY)));
  }, [notes, containerHeight, view.showVelocityLane, view.verticalZoom, setScroll]);

  // Pattern length and virtual row tracking
  const patternLength = pattern?.length || 64;
  const virtualRowOffsetRef = useRef<number>(0);

  // Auto-scroll during playback to keep playhead at piano keys edge
  const prevCurrentRowRef = useRef<number | null>(null);
  const prevPatternRef = useRef<Pattern | null>(null);
  const targetScrollXRef = useRef<number>(0);
  const currentScrollXRef = useRef<number>(0);
  const scrollRafRef = useRef<number>(0);

  // Update target scroll position when playhead moves
  useEffect(() => {
    if (isPlaying && currentRow !== null) {
      const patternChanged = prevPatternRef.current !== pattern;

      if (patternChanged) {
        // Reset on pattern change
        virtualRowOffsetRef.current = 0;
        prevPatternRef.current = pattern;
        prevCurrentRowRef.current = currentRow;
      } else {
        // Detect wrap-around: when currentRow < prevCurrentRow, pattern has looped
        if (prevCurrentRowRef.current !== null && currentRow < prevCurrentRowRef.current) {
          // Add pattern length to offset to create continuous scroll
          virtualRowOffsetRef.current += patternLength;
        }
        
        // Calculate virtual row (continuous, doesn't reset on loop)
        const virtualRow = currentRow + virtualRowOffsetRef.current;
        
        const targetPlayheadX = 72;
        const currentPlayheadX = (virtualRow - currentScrollXRef.current) * view.horizontalZoom;

        if (currentPlayheadX > targetPlayheadX + view.horizontalZoom) {
          const newScrollX = virtualRow - (targetPlayheadX / view.horizontalZoom);
          targetScrollXRef.current = Math.max(0, newScrollX);
        }
        
        prevCurrentRowRef.current = currentRow;
      }
    } else {
      prevCurrentRowRef.current = null;
      prevPatternRef.current = null;
      virtualRowOffsetRef.current = 0;
    }
  }, [isPlaying, currentRow, pattern, view.horizontalZoom, patternLength]);

  // RAF smooth scroll animation
  useEffect(() => {
    if (!isPlaying) {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
      return;
    }

    const animate = () => {
      const target = targetScrollXRef.current;
      const current = currentScrollXRef.current;
      const diff = target - current;

      // Ease-out-cubic for smooth deceleration: t = 1 - (1-t)^3
      if (Math.abs(diff) > 0.05) {
        const t = Math.min(Math.abs(diff) / 100, 1); // Normalize distance
        const eased = 1 - Math.pow(1 - t, 3); // Cubic ease-out
        const lerpFactor = Math.max(0.3, eased); // Min 0.3 for responsiveness
        const newScroll = current + diff * lerpFactor;
        currentScrollXRef.current = newScroll;
        usePianoRollStore.setState({
          view: {
            ...usePianoRollStore.getState().view,
            scrollX: newScroll,
          },
        });
      } else if (Math.abs(diff) > 0.001) {
        // Snap to target when very close
        currentScrollXRef.current = target;
        usePianoRollStore.setState({
          view: {
            ...usePianoRollStore.getState().view,
            scrollX: target,
          },
        });
      }

      scrollRafRef.current = requestAnimationFrame(animate);
    };

    currentScrollXRef.current = view.scrollX;
    scrollRafRef.current = requestAnimationFrame(animate);

    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, [isPlaying]);

  // Measure container height
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.clientHeight - 44;
        setContainerHeight(Math.max(200, height));
      }
    };
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate visible notes range
  const visibleNotes = useMemo(() => {
    return Math.ceil(containerHeight / view.verticalZoom) + 2;
  }, [containerHeight, view.verticalZoom]);

  const visibleOctaves = useMemo(() => {
    return Math.floor(visibleNotes / 12);
  }, [visibleNotes]);

  // Track active MIDI notes during playback
  // Piano keys light up when playhead crosses left edge (startRow)
  // and turn off when it crosses right edge (endRow)
  const activeNotes = useMemo(() => {
    if (!isPlaying || currentRow === null) return new Set<number>();
    
    const active = new Set<number>();
    const normalizedRow = currentRow % patternLength; // Handle pattern wrapping
    
    notes.forEach((note) => {
      // Note is active when playhead is at or past left edge (startRow)
      // and before right edge (endRow)
      if (normalizedRow >= note.startRow && normalizedRow < note.endRow) {
        active.add(note.midiNote);
      }
    });
    
    return active;
  }, [isPlaying, currentRow, notes, patternLength]);

  // Compute scale notes for grid highlighting
  const scaleNotesSet = useMemo(() => {
    if (view.scaleKey === 'chromatic') return undefined;
    const scale = SCALES[view.scaleKey];
    if (!scale) return undefined;
    return new Set(getScaleNotes(view.scaleRoot, scale));
  }, [view.scaleKey, view.scaleRoot]);

  // Compute drag target MIDI note for piano keyboard highlight
  const dragTargetMidi = useMemo(() => {
    if (!drag.isDragging || drag.mode !== 'move' || !drag.noteId) return null;
    const note = notes.find(n => n.id === drag.noteId);
    if (!note) return null;
    const deltaPitch = -Math.round((drag.currentY - drag.startY) / view.verticalZoom);
    return Math.max(0, Math.min(127, note.midiNote + deltaPitch));
  }, [drag.isDragging, drag.mode, drag.noteId, drag.currentY, drag.startY, view.verticalZoom, notes]);

  // Get effective note length
  const getEffectiveNoteLength = useCallback(() => {
    if (view.noteLengthPreset > 0) return view.noteLengthPreset;
    return view.snapToGrid ? Math.max(1, Math.floor(4 / view.gridDivision)) : 1;
  }, [view.noteLengthPreset, view.snapToGrid, view.gridDivision]);

  // Snap MIDI note to nearest scale note
  const snapToScale = useCallback((midiNote: number): number => {
    if (!scaleNotesSet) return midiNote;
    if (scaleNotesSet.has(midiNote % 12)) return midiNote;

    // Find nearest note in scale
    for (let offset = 1; offset <= 6; offset++) {
      if (scaleNotesSet.has((midiNote + offset) % 12)) return midiNote + offset;
      if (scaleNotesSet.has((midiNote - offset + 12) % 12)) return midiNote - offset;
    }
    return midiNote;
  }, [scaleNotesSet]);

  // ============ NOTE PREVIEW ============

  const previewNoteSound = useCallback(async (midiNote: number) => {
    if (currentInstrumentId === null) return;
    const engine = getToneEngine();
    const instrument = instruments.find((i) => i.id === currentInstrumentId);
    if (!instrument) return;

    // Ensure synth is ready (for WASM synths like FurnaceDispatch)
    await engine.ensureInstrumentReady(instrument);

    const noteName = getNoteNameFromMidi(midiNote);
    previewingNote.current = noteName;
    engine.triggerNoteAttack(currentInstrumentId, noteName, Tone.now(), 0.8, instrument);
  }, [currentInstrumentId, instruments]);

  const releasePreviewNote = useCallback(() => {
    if (previewingNote.current && currentInstrumentId !== null) {
      const engine = getToneEngine();
      engine.releaseNote(currentInstrumentId, previewingNote.current);
      previewingNote.current = null;
    }
  }, [currentInstrumentId]);

  // ============ NOTE SELECTION ============

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

  // ============ NOTE DRAG ============

  const handleNoteDragStart = useCallback(
    (noteId: string, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
      // Alt+drag: clone the note first, then drag the original (clone stays in place)
      if (e.altKey && mode === 'move') {
        const note = notes.find(n => n.id === noteId);
        if (note) {
          // Create a duplicate at the same position (it becomes the "original" that stays)
          addNote(note.midiNote, note.startRow, note.endRow - note.startRow, note.velocity, note.channelIndex);
        }
      }
      startDrag(mode, e.clientX, e.clientY, noteId);
    },
    [startDrag, notes, addNote]
  );

  // ============ GRID CLICK ============

  const handleGridClick = useCallback(
    (row: number, midiNote: number) => {
      hideContextMenu();

      if (tool === 'draw') {
        // Scale constraint
        const targetNote = snapToScale(midiNote);
        const duration = getEffectiveNoteLength();
        addNote(targetNote, row, duration, 100, view.channelIndex);
      } else if (tool === 'select') {
        // Only clear if not starting a selection box
        if (!drag.isDragging) {
          clearSelection();
        }
      }
    },
    [tool, view.channelIndex, addNote, clearSelection, hideContextMenu, drag.isDragging, snapToScale, getEffectiveNoteLength]
  );

  // Draw-continuous handler (paint notes while dragging in draw mode)
  const handleGridDraw = useCallback(
    (row: number, midiNote: number) => {
      if (tool !== 'draw') return;
      const targetNote = snapToScale(midiNote);
      const duration = getEffectiveNoteLength();
      addNote(targetNote, row, duration, 100, view.channelIndex);
    },
    [tool, view.channelIndex, addNote, snapToScale, getEffectiveNoteLength]
  );

  // ============ CONTEXT MENU ============

  const handleGridRightClick = useCallback(
    (row: number, midiNote: number, x: number, y: number) => {
      // Check if right-clicked on a note
      const clickedNote = notes.find(n =>
        row >= n.startRow && row < n.endRow && midiNote === n.midiNote
      );

      if (clickedNote && !selection.notes.has(clickedNote.id)) {
        selectNote(clickedNote.id, false);
      }

      showContextMenu(x, y, clickedNote?.id || null, row, midiNote);
    },
    [notes, selection.notes, selectNote, showContextMenu]
  );

  // ============ NOTE ERASE (for canvas erase tool) ============

  const handleNoteErase = useCallback(
    (noteId: string) => {
      deleteNote(noteId);
    },
    [deleteNote]
  );

  // ============ SELECTION BOX ============

  const handleSelectionBoxStart = useCallback(
    (row: number, midiNote: number, e: React.MouseEvent) => {
      if (tool !== 'select') return;
      // Don't start selection box if clicking on a note (handled by NoteBlock)
      const clickedNote = notes.find(n =>
        row >= n.startRow && row < n.endRow && midiNote === n.midiNote
      );
      if (clickedNote) return;

      startDrag('select-box', e.clientX, e.clientY);
    },
    [tool, notes, startDrag]
  );

  // ============ SMOOTH SCROLL ============

  const targetScrollX = useRef(view.scrollX);
  const targetScrollY = useRef(view.scrollY);
  const scrollAnimFrame = useRef<number | null>(null);

  // Sync targets when scroll is set externally (e.g. playback auto-scroll)
  const lastExternalScrollX = useRef(view.scrollX);
  const lastExternalScrollY = useRef(view.scrollY);
  useEffect(() => {
    // Detect external scroll changes (not from our animation) and sync targets
    if (view.scrollX !== lastExternalScrollX.current) {
      targetScrollX.current = view.scrollX;
    }
    if (view.scrollY !== lastExternalScrollY.current) {
      targetScrollY.current = view.scrollY;
    }
    lastExternalScrollX.current = view.scrollX;
    lastExternalScrollY.current = view.scrollY;
  }, [view.scrollX, view.scrollY]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (scrollAnimFrame.current !== null) {
        cancelAnimationFrame(scrollAnimFrame.current);
      }
    };
  }, []);

  const animateScrollRef = useRef<() => void>(() => {});
  useEffect(() => {
    animateScrollRef.current = () => {
      const lerp = 0.25;
      const epsilon = 0.1;

      const currentX = usePianoRollStore.getState().view.scrollX;
      const currentY = usePianoRollStore.getState().view.scrollY;
      const tx = targetScrollX.current;
      const ty = targetScrollY.current;

      const dx = tx - currentX;
      const dy = ty - currentY;

      if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) {
        setScroll(tx, ty);
        lastExternalScrollX.current = tx;
        lastExternalScrollY.current = ty;
        scrollAnimFrame.current = null;
        return;
      }

      const newX = currentX + dx * lerp;
      const newY = currentY + dy * lerp;
      setScroll(newX, newY);
      lastExternalScrollX.current = newX;
      lastExternalScrollY.current = newY;

      scrollAnimFrame.current = requestAnimationFrame(() => animateScrollRef.current());
    };
  });
  const animateScroll = useCallback(() => {
    animateScrollRef.current();
  }, []);

  const handleScroll = useCallback(
    (deltaX: number, deltaY: number) => {
      // Accumulate into target position
      targetScrollX.current = Math.max(0, targetScrollX.current + deltaX);
      targetScrollY.current = Math.max(0, Math.min(127, targetScrollY.current + deltaY));

      // Start animation loop if not already running
      if (scrollAnimFrame.current === null) {
        scrollAnimFrame.current = requestAnimationFrame(animateScroll);
      }
    },
    [animateScroll]
  );

  // ============ MOUSE MOVE/UP FOR DRAGGING ============

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const currentDrag = usePianoRollStore.getState().drag;
      if (!currentDrag.isDragging) return;
      updateDrag(e.clientX, e.clientY);

      // Generate ghost notes for move/resize drag preview (snapped to grid)
      const gridStep = view.snapToGrid ? Math.max(1, Math.floor(4 / view.gridDivision)) : 1;

      if (currentDrag.mode === 'move' && currentDrag.noteId) {
        const deltaX = e.clientX - currentDrag.startX;
        const deltaY = e.clientY - currentDrag.startY;
        const rawDeltaRow = deltaX / view.horizontalZoom;
        const snappedDeltaRow = Math.round(rawDeltaRow / gridStep) * gridStep;
        const deltaPitch = -Math.round(deltaY / view.verticalZoom);

        if (snappedDeltaRow !== 0 || deltaPitch !== 0) {
          const note = notes.find(n => n.id === currentDrag.noteId);
          if (note) {
            const selectedIds = usePianoRollStore.getState().selection.notes;
            const ghostIds = selectedIds.has(note.id)
              ? Array.from(selectedIds)
              : [note.id];

            const ghosts = ghostIds.map(id => {
              const n = notes.find(n2 => n2.id === id);
              if (!n) return null;
              return {
                ...n,
                startRow: Math.max(0, n.startRow + snappedDeltaRow),
                endRow: Math.max(1, n.endRow + snappedDeltaRow),
                midiNote: Math.max(0, Math.min(127, n.midiNote + deltaPitch)),
              };
            }).filter(Boolean) as PianoRollNote[];

            setGhostNotes(ghosts);
          }
        }
      }

      // Resize ghost preview (snapped)
      if ((currentDrag.mode === 'resize-end' || currentDrag.mode === 'resize-start') && currentDrag.noteId) {
        const deltaX = e.clientX - currentDrag.startX;
        const rawDeltaRow = deltaX / view.horizontalZoom;
        const snappedDeltaRow = Math.round(rawDeltaRow / gridStep) * gridStep;

        const note = notes.find(n => n.id === currentDrag.noteId);
        if (note && snappedDeltaRow !== 0) {
          const ghost = { ...note };
          if (currentDrag.mode === 'resize-end') {
            ghost.endRow = Math.max(note.startRow + 1, note.endRow + snappedDeltaRow);
          } else {
            ghost.startRow = Math.min(note.endRow - 1, Math.max(0, note.startRow + snappedDeltaRow));
          }
          setGhostNotes([ghost]);
        }
      }

      // Selection box: select notes within the box
      if (currentDrag.mode === 'select-box') {
        const gridEl = document.querySelector('[role="grid"]');
        if (!gridEl) return;
        const rect = gridEl.getBoundingClientRect();

        const x1 = Math.min(currentDrag.startX, e.clientX) - rect.left;
        const x2 = Math.max(currentDrag.startX, e.clientX) - rect.left;
        const y1 = Math.min(currentDrag.startY, e.clientY) - rect.top;
        const y2 = Math.max(currentDrag.startY, e.clientY) - rect.top;

        const startRow = Math.floor(x1 / view.horizontalZoom) + view.scrollX;
        const endRow = Math.ceil(x2 / view.horizontalZoom) + view.scrollX;
        const startNote = view.scrollY + 60 - Math.floor(y2 / view.verticalZoom);
        const endNote = view.scrollY + 60 - Math.floor(y1 / view.verticalZoom);

        // Select all notes within the box
        const selectedIds = notes
          .filter(n =>
            n.startRow < endRow && n.endRow > startRow &&
            n.midiNote >= startNote && n.midiNote <= endNote
          )
          .map(n => n.id);

        selectNotes(selectedIds);
      }
    };

    const handleMouseUp = () => {
      const currentDrag = usePianoRollStore.getState().drag;
      if (!currentDrag.isDragging) return;

      if (currentDrag.mode === 'select-box') {
        endDrag();
        return;
      }

      if (!currentDrag.noteId) {
        endDrag();
        return;
      }

      // Calculate delta in rows and pitch (snapped to grid)
      const deltaX = currentDrag.currentX - currentDrag.startX;
      const deltaY = currentDrag.currentY - currentDrag.startY;
      const commitGridStep = view.snapToGrid ? Math.max(1, Math.floor(4 / view.gridDivision)) : 1;
      const deltaRow = Math.round((deltaX / view.horizontalZoom) / commitGridStep) * commitGridStep;
      const deltaPitch = -Math.round(deltaY / view.verticalZoom);

      if (currentDrag.mode === 'move' && (deltaRow !== 0 || deltaPitch !== 0)) {
        moveNote(currentDrag.noteId, deltaRow, deltaPitch);
      } else if (currentDrag.mode === 'resize-end') {
        const note = notes.find((n) => n.id === currentDrag.noteId);
        if (note) {
          resizeNote(currentDrag.noteId, note.endRow + deltaRow);
        }
      } else if (currentDrag.mode === 'resize-start') {
        const note = notes.find((n) => n.id === currentDrag.noteId);
        if (note) {
          resizeNoteStart(currentDrag.noteId, note.startRow + deltaRow);
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
  }, [view.horizontalZoom, view.verticalZoom, view.scrollX, view.scrollY, view.snapToGrid, view.gridDivision, notes, moveNote, resizeNote, resizeNoteStart, updateDrag, endDrag, selectNotes, setGhostNotes]);

  // ============ CLIPBOARD OPERATIONS ============

  const handleCopy = useCallback(() => {
    const selectedNoteObjs = notes.filter(n => selection.notes.has(n.id));
    if (selectedNoteObjs.length > 0) {
      copyNotes(selectedNoteObjs);
    }
  }, [notes, selection.notes, copyNotes]);

  const handleCut = useCallback(() => {
    handleCopy();
    const ids = Array.from(selection.notes);
    deleteNotes(ids);
    clearSelection();
  }, [handleCopy, selection.notes, deleteNotes, clearSelection]);

  const handlePaste = useCallback(() => {
    const clip = usePianoRollStore.getState().clipboard;
    if (!clip) return;
    // Paste at current scroll position
    pasteNotes(clip, Math.floor(view.scrollX), Math.round(view.scrollY + 60), view.channelIndex);
  }, [pasteNotes, view.scrollX, view.scrollY, view.channelIndex]);

  const handleDelete = useCallback(() => {
    const ids = Array.from(selection.notes);
    deleteNotes(ids);
    clearSelection();
  }, [selection.notes, deleteNotes, clearSelection]);

  const handleSelectAll = useCallback(() => {
    selectAll(notes.map(n => n.id));
  }, [notes, selectAll]);

  const handleQuantize = useCallback(() => {
    const ids = Array.from(selection.notes);
    quantizeNotes(ids, view.gridDivision);
  }, [selection.notes, quantizeNotes, view.gridDivision]);

  const handleToggleSlide = useCallback(() => {
    const ids = Array.from(selection.notes);
    const selectedNoteObjs = notes.filter(n => selection.notes.has(n.id));
    const anySlide = selectedNoteObjs.some(n => n.slide);
    toggleSlide(ids, !anySlide);
  }, [notes, selection.notes, toggleSlide]);

  const handleToggleAccent = useCallback(() => {
    const ids = Array.from(selection.notes);
    const selectedNoteObjs = notes.filter(n => selection.notes.has(n.id));
    const anyAccent = selectedNoteObjs.some(n => n.accent);
    toggleAccent(ids, !anyAccent);
  }, [notes, selection.notes, toggleAccent]);

  // ============ UNDO/REDO ============

  const handleUndo = useCallback(() => {
    const result = useHistoryStore.getState().undo();
    if (result) {
      useTrackerStore.getState().replacePattern(
        useTrackerStore.getState().currentPatternIndex,
        result
      );
    }
  }, []);

  const handleRedo = useCallback(() => {
    const result = useHistoryStore.getState().redo();
    if (result) {
      useTrackerStore.getState().replacePattern(
        useTrackerStore.getState().currentPatternIndex,
        result
      );
    }
  }, []);

  // ============ KEYBOARD SHORTCUTS ============

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLSelectElement) return;

      // Ignore if modal is open
      if (document.querySelector('.fixed.inset-0.z-50')) return;

      const key = e.key;
      const keyLower = key.toLowerCase();

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && keyLower === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (keyLower === 'y' || (keyLower === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Copy/Cut/Paste
      if ((e.ctrlKey || e.metaKey) && keyLower === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && keyLower === 'x') {
        e.preventDefault();
        handleCut();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && keyLower === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Select All
      if ((e.ctrlKey || e.metaKey) && keyLower === 'a') {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      // Delete selected notes
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        handleDelete();
        return;
      }

      // Escape: clear selection and close context menu
      if (key === 'Escape') {
        e.preventDefault();
        clearSelection();
        hideContextMenu();
        return;
      }

      // Duplicate selection (Ctrl/Cmd+D)
      if ((e.ctrlKey || e.metaKey) && keyLower === 'd' && selection.notes.size > 0) {
        e.preventDefault();
        duplicateNotes(Array.from(selection.notes));
        return;
      }

      // Arrow key shortcuts for selected notes
      if (selection.notes.size > 0 && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
        e.preventDefault();
        const ids = Array.from(selection.notes);

        if (key === 'ArrowUp') {
          transposeNotes(ids, e.shiftKey ? 12 : 1);
          return;
        }
        if (key === 'ArrowDown') {
          transposeNotes(ids, e.shiftKey ? -12 : -1);
          return;
        }
        if (key === 'ArrowLeft' && e.shiftKey) {
          const gridStep = Math.max(1, Math.floor(4 / view.gridDivision));
          adjustNoteLengths(ids, -gridStep);
          return;
        }
        if (key === 'ArrowRight' && e.shiftKey) {
          const gridStep = Math.max(1, Math.floor(4 / view.gridDivision));
          adjustNoteLengths(ids, gridStep);
          return;
        }
      }

      // Velocity adjustment (+/- keys)
      if ((key === '+' || key === '=' || key === '-' || key === '_') && selection.notes.size > 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const delta = (key === '+' || key === '=') ? 10 : -10;
        adjustVelocities(Array.from(selection.notes), delta);
        return;
      }

      // Tool shortcuts (only when no modifiers)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        // Quantize
        if (keyLower === 'q' && selection.notes.size > 0 && tool === 'select') {
          e.preventDefault();
          handleQuantize();
          return;
        }

        // Toggle slide/accent on selection
        if (keyLower === 's' && selection.notes.size > 0 && tool === 'select' && !e.shiftKey) {
          // Only capture 's' for slide if not in draw mode
          // (in draw mode 's' could be used for QWERTY input)
          if (tool === 'select') {
            e.preventDefault();
            handleToggleSlide();
            return;
          }
        }
        if (keyLower === 'a' && selection.notes.size > 0 && tool === 'select' && !e.shiftKey) {
          // 'a' for accent toggle in select mode
          e.preventDefault();
          handleToggleAccent();
          return;
        }

        // Tool selection keys - only when NOT in draw mode (where number keys are QWERTY input)
        if (tool !== 'draw') {
          if (key === '1') { setTool('select'); e.preventDefault(); return; }
          if (key === '2') { setTool('draw'); e.preventDefault(); return; }
          if (key === '3') { setTool('erase'); e.preventDefault(); return; }
        }
      }

      // QWERTY note input (only in draw mode)
      if (tool === 'draw' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        const noteOffset = QWERTY_NOTE_MAP[keyLower];
        if (noteOffset !== undefined) {
          e.preventDefault();
          const currentOctave = useTrackerStore.getState().currentOctave || 4;
          const midiNote = snapToScale((currentOctave * 12) + noteOffset);
          const row = Math.floor(view.scrollX);
          const duration = getEffectiveNoteLength();
          addNote(midiNote, row, duration, 100, view.channelIndex);

          // Preview the note
          previewNoteSound(midiNote);
          return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Release preview note on key up
      const keyLower = e.key.toLowerCase();
      if (tool === 'draw' && QWERTY_NOTE_MAP[keyLower] !== undefined) {
        releasePreviewNote();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    tool, selection.notes, view.scrollX, view.channelIndex, view.gridDivision,
    notes, addNote, handleCopy, handleCut, handlePaste, handleDelete, handleSelectAll,
    handleQuantize, handleToggleSlide, handleToggleAccent, handleUndo, handleRedo,
    clearSelection, hideContextMenu, setTool, snapToScale, getEffectiveNoteLength,
    previewNoteSound, releasePreviewNote,
    transposeNotes, adjustNoteLengths, duplicateNotes, adjustVelocities,
  ]);

  // ============ VELOCITY LANE HEIGHT ADJUSTMENT ============

  const gridHeight = useMemo(() => {
    return view.showVelocityLane ? containerHeight - 80 : containerHeight;
  }, [containerHeight, view.showVelocityLane]);

  // Scale options for dropdown
  const scaleOptions = useMemo(() => {
    return Object.entries(SCALES).map(([key, scale]) => ({
      value: key,
      label: scale.name,
    }));
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-dark-bgSecondary" role="application" aria-label="Piano roll editor">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-bgTertiary shrink-0 flex-wrap">
        {/* Tool buttons */}
        <div className="flex items-center bg-dark-bg rounded-md p-0.5" role="toolbar" aria-label="Editing tools">
          <button
            onClick={() => setTool('select')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'select' ? 'bg-accent-primary text-text-inverse' : 'text-text-muted hover:text-text-primary'
            }`}
            title="Select (1)"
            aria-pressed={tool === 'select'}
          >
            <MousePointer2 size={14} />
          </button>
          <button
            onClick={() => setTool('draw')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'draw' ? 'bg-accent-primary text-text-inverse' : 'text-text-muted hover:text-text-primary'
            }`}
            title="Draw (2)"
            aria-pressed={tool === 'draw'}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setTool('erase')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'erase' ? 'bg-accent-primary text-text-inverse' : 'text-text-muted hover:text-text-primary'
            }`}
            title="Erase (3)"
            aria-pressed={tool === 'erase'}
          >
            <Eraser size={14} />
          </button>
        </div>

        <div className="w-px h-4 bg-dark-border" />

        {/* Horizontal Zoom */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">H</span>
          <button onClick={() => setHorizontalZoom(view.horizontalZoom * 0.8)} className="p-1 text-text-muted hover:text-text-primary" title="Zoom out horizontally">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-text-muted w-6 text-center">{Math.round(view.horizontalZoom)}</span>
          <button onClick={() => setHorizontalZoom(view.horizontalZoom * 1.25)} className="p-1 text-text-muted hover:text-text-primary" title="Zoom in horizontally">
            <ZoomIn size={14} />
          </button>
        </div>

        {/* Vertical Zoom */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">V</span>
          <button onClick={() => setVerticalZoom(view.verticalZoom - 2)} className="p-1 text-text-muted hover:text-text-primary" title="Zoom out vertically">
            <Minimize2 size={14} />
          </button>
          <span className="text-xs text-text-muted w-10 text-center" title={`${visibleOctaves} octaves visible`}>
            {visibleOctaves}oct
          </span>
          <button onClick={() => setVerticalZoom(view.verticalZoom + 2)} className="p-1 text-text-muted hover:text-text-primary" title="Zoom in vertically">
            <Maximize2 size={14} />
          </button>
        </div>

        <div className="w-px h-4 bg-dark-border" />

        {/* Grid snap + division */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSnapToGrid(!view.snapToGrid)}
            className={`p-1 rounded transition-colors ${view.snapToGrid ? 'text-accent-primary' : 'text-text-muted'}`}
            title="Snap to grid"
            aria-pressed={view.snapToGrid}
          >
            <Grid3X3 size={14} />
          </button>
          <select
            value={view.gridDivision}
            onChange={(e) => setGridDivision(Number(e.target.value))}
            className="px-1.5 py-0.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary"
            title="Grid division"
            aria-label="Grid division"
          >
            <option value={1}>1/1</option>
            <option value={2}>1/2</option>
            <option value={4}>1/4</option>
            <option value={8}>1/8</option>
            <option value={16}>1/16</option>
          </select>
        </div>

        {/* Note length preset */}
        <select
          value={view.noteLengthPreset}
          onChange={(e) => setNoteLengthPreset(Number(e.target.value))}
          className="px-1.5 py-0.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary"
          title="Note length"
          aria-label="Note length preset"
        >
          {NOTE_LENGTH_PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        <div className="w-px h-4 bg-dark-border" />

        {/* Scale constraint */}
        <div className="flex items-center gap-1">
          <Music size={12} className="text-text-muted" />
          <select
            value={view.scaleRoot}
            onChange={(e) => setScaleRoot(Number(e.target.value))}
            className="px-1 py-0.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary w-10"
            title="Root note"
            aria-label="Scale root note"
          >
            {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((n, i) => (
              <option key={i} value={i}>{n}</option>
            ))}
          </select>
          <select
            value={view.scaleKey}
            onChange={(e) => setScaleKey(e.target.value)}
            className="px-1 py-0.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary"
            title="Scale"
            aria-label="Scale type"
          >
            {scaleOptions.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="w-px h-4 bg-dark-border" />

        {/* Velocity toggles */}
        <button
          onClick={() => setShowVelocity(!view.showVelocity)}
          className={`p-1 rounded transition-colors ${view.showVelocity ? 'text-accent-primary' : 'text-text-muted'}`}
          title="Show velocity on notes"
          aria-pressed={view.showVelocity}
        >
          {view.showVelocity ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          onClick={() => setShowVelocityLane(!view.showVelocityLane)}
          className={`p-1 rounded transition-colors ${view.showVelocityLane ? 'text-accent-primary' : 'text-text-muted'}`}
          title="Velocity editing lane"
          aria-pressed={view.showVelocityLane}
        >
          <BarChart3 size={14} />
        </button>

        {/* Multi-channel toggle */}
        <button
          onClick={() => setMultiChannel(!view.multiChannel)}
          className={`p-1 rounded transition-colors ${view.multiChannel ? 'text-accent-primary' : 'text-text-muted'}`}
          title="Show all channels"
          aria-pressed={view.multiChannel}
        >
          <Layers size={14} />
        </button>

        <div className="w-px h-4 bg-dark-border" />

        {/* Acid Pattern Generator */}
        <button
          onClick={() => setShowAcidGenerator(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary rounded transition-colors"
          title="Generate 303 acid pattern"
        >
          <Wand2 size={12} />
          Acid
        </button>

        {/* Channel selector (if not multi-channel and not prop-controlled) */}
        {!view.multiChannel && channelIndex === undefined && pattern && (
          <>
            <div className="w-px h-4 bg-dark-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">CH</span>
              <select
                value={view.channelIndex}
                onChange={(e) => setChannelIndex(Number(e.target.value))}
                className="px-1.5 py-0.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary"
                aria-label="Channel"
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

        {/* Status */}
        <div className="flex-1" />
        <span className="text-xs text-text-muted">
          {notes.length} notes
          {selection.notes.size > 0 && ` (${selection.notes.size} sel)`}
          {clipboard && ` | clip:${clipboard.notes.length}`}
        </span>

        <div className="w-px h-4 bg-dark-border" />

        {/* Pop out */}
        <button
          onClick={() => {
            const already = useUIStore.getState().pianoRollPoppedOut;
            if (already) {
              focusPopout('DEViLBOX — Piano Roll');
            } else {
              useUIStore.getState().setPianoRollPoppedOut(true);
            }
          }}
          className="p-1 rounded transition-colors text-text-muted hover:text-cyan-400"
          title="Pop out to separate window"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex flex-col w-full overflow-hidden min-h-0">
        <div className="flex-1 flex w-full overflow-hidden min-h-0">
          {/* Piano keyboard (canvas) */}
          <PianoKeyboardCanvas
            verticalZoom={view.verticalZoom}
            scrollY={view.scrollY}
            visibleNotes={visibleNotes}
            containerHeight={gridHeight}
            activeNotes={activeNotes}
            scaleNotes={scaleNotesSet}
            dragTargetMidi={dragTargetMidi}
            onNotePreview={previewNoteSound}
            onNoteRelease={releasePreviewNote}
          />

          {/* Grid and notes (canvas) */}
          <PianoRollCanvas
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
            containerHeight={gridHeight}
            scaleNotes={scaleNotesSet}
            tool={tool}
            onNoteSelect={handleNoteSelect}
            onNoteDragStart={handleNoteDragStart}
            onGridClick={handleGridClick}
            onGridRightClick={handleGridRightClick}
            onScroll={handleScroll}
            onSelectionBoxStart={handleSelectionBoxStart}
            onNoteErase={handleNoteErase}
            onGridDraw={handleGridDraw}
          />
        </div>

        {/* Velocity editing lane (canvas) */}
        {view.showVelocityLane && (
          <div className="flex w-full shrink-0">
            <div className="shrink-0" style={{ width: 72 }} /> {/* Keyboard spacer */}
            <VelocityLaneCanvas
              notes={notes}
              horizontalZoom={view.horizontalZoom}
              scrollX={view.scrollX}
              selectedNotes={selection.notes}
              onBeginDrag={beginVelocityDrag}
              onDragVelocity={setVelocityNoUndo}
              onDragMultiVelocity={setMultipleVelocitiesNoUndo}
              onEndDrag={endVelocityDrag}
              onAdjustVelocity={adjustVelocities}
            />
          </div>
        )}
      </div>

      {/* Context Menu */}
      <PianoRollContextMenu
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onDelete={handleDelete}
        onSelectAll={handleSelectAll}
        onQuantize={handleQuantize}
        onToggleSlide={handleToggleSlide}
        onToggleAccent={handleToggleAccent}
        onSetVelocity={(vel) => setMultipleVelocities(Array.from(selection.notes), vel)}
        hasSelection={selection.notes.size > 0}
        hasClipboard={clipboard !== null}
        selectionVelocity={
          selection.notes.size > 0
            ? Math.round(
                notes
                  .filter(n => selection.notes.has(n.id))
                  .reduce((sum, n) => sum + n.velocity, 0) /
                Math.max(1, notes.filter(n => selection.notes.has(n.id)).length)
              )
            : undefined
        }
      />

      {/* Acid Pattern Generator Dialog */}
      {showAcidGenerator && (
        <AcidPatternGeneratorDialog
          channelIndex={channelIndex ?? view.channelIndex}
          onClose={() => setShowAcidGenerator(false)}
        />
      )}
    </div>
  );
};

export default PianoRoll;
