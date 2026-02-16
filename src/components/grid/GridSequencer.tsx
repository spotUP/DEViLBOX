/**
 * GridSequencer - Alternative pattern view with 303-style grid interface
 *
 * Layout:
 * - 12 pitch rows (C to B) for one octave
 * - Note properties shown on cells: accent (orange), slide (arrow), mute (M), hammer (H), octave (+/-)
 *
 * Interactions:
 * - Click: toggle note (with preview sound)
 * - Shift+click: toggle accent
 * - Ctrl/Cmd+click: toggle slide
 * - Alt+click: cycle octave (normal → +1 → -1 → normal)
 * - Right-click: context menu with all options including TT-303 mute/hammer
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';
import { useGridPattern } from '../../hooks/useGridPattern';
import { useTransportStore } from '../../stores/useTransportStore';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { GridControls } from './GridControls';
import { NoteGridCell } from './GridCell';
import { SCALES, isNoteInScale } from '../../lib/scales';
import { useMIDI } from '../../hooks/useMIDI';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { getToneEngine } from '@engine/ToneEngine';
import { AcidPatternGeneratorDialog } from '@components/dialogs/AcidPatternGeneratorDialog';

const NOTE_NAMES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'] as const;
const NOTE_NAMES_FORWARD = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const NOTE_INDICES = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // Reversed for display (high to low)

interface GridSequencerProps {
  channelIndex: number;
}

export const GridSequencer: React.FC<GridSequencerProps> = ({ channelIndex }) => {
  const {
    gridPattern,
    baseOctave,
    setBaseOctave,
    maxSteps,
    setMaxSteps,
    resizeAllPatterns,
    setNote,
    toggleAccent,
    toggleSlide,
    toggleMute,
    toggleHammer,
    setOctaveShift,
    setVelocity,
    clearAll,
  } = useGridPattern(channelIndex);

  const { currentRow, isPlaying, smoothScrolling, bpm, speed } = useTransportStore();

  // Current playback step (only show when playing)
  const currentStep = isPlaying ? currentRow % maxSteps : -1;
  
  // Trail steps for visual effect (7 steps behind with decreasing opacity)
  const trailSteps = useMemo(() => {
    if (currentStep < 0) return [];
    
    return [
      { step: (currentStep - 1 + maxSteps) % maxSteps, opacity: 0.5 },
      { step: (currentStep - 2 + maxSteps) % maxSteps, opacity: 0.4 },
      { step: (currentStep - 3 + maxSteps) % maxSteps, opacity: 0.3 },
      { step: (currentStep - 4 + maxSteps) % maxSteps, opacity: 0.2 },
      { step: (currentStep - 5 + maxSteps) % maxSteps, opacity: 0.15 },
      { step: (currentStep - 6 + maxSteps) % maxSteps, opacity: 0.1 },
      { step: (currentStep - 7 + maxSteps) % maxSteps, opacity: 0.05 },
    ];
  }, [currentStep, maxSteps]);

  // Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Smooth scroll tracking refs
  const lastStepRef = useRef<number>(-1);
  const lastStepTimeRef = useRef<number>(0);
  const currentScrollRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);

  // Use a ref to access current steps without causing callback recreation
  const stepsRef = useRef(gridPattern.steps);
  useEffect(() => { stepsRef.current = gridPattern.steps; }, [gridPattern.steps]);

  // Focus management for keyboard navigation
  const [focusedCell, setFocusedCell] = useState<{ noteIndex: number; stepIndex: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Scale mode state
  const [scaleKey, setScaleKey] = useState<string>('chromatic');
  const [rootNote, setRootNote] = useState<number>(0); // C

  // Acid pattern generator state
  const [showAcidGenerator, setShowAcidGenerator] = useState(false);

  // Auto-sizing state - calculate cell size to fit viewport
  const [cellSize, setCellSize] = useState(28); // 28px default (Tailwind w-7)

  // MIDI integration
  const { onMessage } = useMIDI();
  const { applyGridMIDIValue } = useMIDIStore();

  // Initialize focus to first cell
  useEffect(() => {
    if (focusedCell === null && maxSteps > 0) {
      requestAnimationFrame(() => setFocusedCell({ noteIndex: 11, stepIndex: 0 }));
    }
  }, [focusedCell, maxSteps]);

  // Auto-sizing: calculate optimal cell size to fit all steps without horizontal scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const calculateSize = () => {
      const containerWidth = container.clientWidth;
      const LABEL_WIDTH = 48; // w-10 mr-2 = 40px + 8px
      const PADDING = 16; // p-2 = 8px on each side
      const CELL_GAP = 4; // mx-0.5 = 2px on each side per cell

      // Available width for cells
      const availableWidth = containerWidth - LABEL_WIDTH - PADDING;

      // Calculate cell size (includes gap): availableWidth / maxSteps
      const totalCellWidth = Math.floor(availableWidth / maxSteps);
      
      // Cell size is totalCellWidth minus gap, clamped to [14, 28]
      const newCellSize = Math.max(14, Math.min(28, totalCellWidth - CELL_GAP));
      
      setCellSize(newCellSize);
    };

    // Initial calculation
    calculateSize();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [maxSteps]);

  // RAF-based smooth scrolling (only when smooth scrolling enabled)
  useEffect(() => {
    const grid = gridRef.current;
    
    if (!isPlaying || !smoothScrolling) {
      // Reset transform and refs when not playing
      if (grid) {
        grid.style.transform = '';
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      return;
    }

    const container = scrollContainerRef.current;
    const grid = gridRef.current;
    if (!container || !grid) return;

    // Cell width = cellSize + gap (mx-0.5 = 4px total), plus row label width
    const CELL_WIDTH = cellSize + 4;
    const LABEL_WIDTH = 48;

    const animate = () => {
      // Use current step for discrete scrolling
      const activeStep = currentStep;
      
      // Calculate target scroll position
      const stepPosition = LABEL_WIDTH + (activeStep * CELL_WIDTH);
      const containerWidth = container.clientWidth;

      // Keep the playhead in the center third of the view
      const targetScroll = Math.max(0, stepPosition - containerWidth * 0.4);

      // Apply with minimal lerp for smoothness without lag
      const lerpFactor = 0.3;
      currentScrollRef.current += (targetScroll - currentScrollRef.current) * lerpFactor;

      // Apply via GPU-accelerated transform instead of scrollLeft
      grid.style.transform = `translateX(-${currentScrollRef.current}px)`;

      rafIdRef.current = requestAnimationFrame(animate);
    };

    // Initialize scroll position
    currentScrollRef.current = container.scrollLeft;
    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (grid) {
        grid.style.transform = '';
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [isPlaying, smoothScrolling, cellSize, currentStep]);

  // Handle MIDI CC messages for parameter control
  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      if (message.type !== 'cc' || message.controller === undefined || message.value === undefined) return;

      const mappedValue = applyGridMIDIValue(message.channel, message.controller, message.value);
      if (mappedValue === null) return;

      // Apply to baseOctave if mapped
      const mapping = useMIDIStore.getState().getGridMapping(message.channel, message.controller);
      if (!mapping) return;

      switch (mapping.parameter) {
        case 'baseOctave':
          setBaseOctave(Math.round(mappedValue));
          break;
        // Note: Other parameters like velocity, cutoff, etc. would need to be
        // applied to the focused cell or globally depending on UI design
        // For now, baseOctave is the main grid-level parameter
      }
    });

    return unsubscribe;
  }, [onMessage, applyGridMIDIValue, setBaseOctave]);

  // Preview sound state (always enabled for now - could add UI toggle later)
  const [previewEnabled] = useState(true);

  // Preview note sound (like db303 editor)
  const previewNote = useCallback((noteIndex: number, octaveShift: number = 0, accent: boolean = false, slide: boolean = false) => {
    if (!previewEnabled) return;

    try {
      const engine = getToneEngine();
      if (!engine) return;

      // Get the instrument for this channel
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      const channel = pattern?.channels[channelIndex];
      const instrumentId = channel?.instrumentId ?? 1;
      const instrument = useInstrumentStore.getState().instruments.find(i => i.id === instrumentId);

      if (instrument) {
        // Build full note with octave
        const noteName = NOTE_NAMES_FORWARD[noteIndex];
        const noteOctave = baseOctave + octaveShift;
        const fullNote = `${noteName}${noteOctave}`;

        // Trigger a short preview note
        engine.triggerNote(instrumentId, fullNote, 0.2, Tone.now(), 0.8, instrument, accent, slide);
      }
    } catch (e) {
      // Silently ignore preview errors
      console.debug('[GridSequencer] Preview error:', e);
    }
  }, [previewEnabled, channelIndex, baseOctave]);

  // Handle note cell click - stable callback
  const handleNoteClick = useCallback(
    (noteIndex: number, stepIndex: number) => {
      const step = stepsRef.current[stepIndex];

      // If clicking the same note (any octave), clear it
      if (step?.noteIndex === noteIndex) {
        setNote(stepIndex, null);
      } else {
        // Set the new note, preserving octave shift if there was a note, otherwise default to 0
        const octaveShift = step?.noteIndex !== null ? step.octaveShift : 0;
        setNote(stepIndex, noteIndex, octaveShift);

        // Preview the note sound
        previewNote(noteIndex, octaveShift, step?.accent || false, step?.slide || false);
      }
    },
    [setNote, previewNote]
  );

  // Handle setting octave shift directly
  const handleSetOctave = useCallback(
    (stepIndex: number, shift: number) => {
      setOctaveShift(stepIndex, shift);
    },
    [setOctaveShift]
  );

  // Generate random pattern
  const handleRandomize = useCallback(() => {
    // Simple random pattern generator
    for (let i = 0; i < maxSteps; i++) {
      // 70% chance of note, 30% rest
      if (Math.random() < 0.7) {
        const noteIndex = Math.floor(Math.random() * 12);
        const octaveShift = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        setNote(i, noteIndex, octaveShift);

        // 25% chance of accent
        if (Math.random() < 0.25) {
          toggleAccent(i);
        }

        // 20% chance of slide (on non-first notes)
        if (i > 0 && Math.random() < 0.2) {
          toggleSlide(i);
        }
      } else {
        setNote(i, null);
      }
    }
  }, [maxSteps, setNote, toggleAccent, toggleSlide]);

  // Open acid pattern generator
  const handleAcidGenerator = useCallback(() => {
    setShowAcidGenerator(true);
  }, []);

  // Generate step column indices
  const stepIndices = useMemo(() => Array.from({ length: maxSteps }, (_, i) => i), [maxSteps]);

  // Filter note indices based on selected scale
  const filteredNoteIndices = useMemo(() => {
    const selectedScale = SCALES[scaleKey];
    if (!selectedScale || scaleKey === 'chromatic') {
      return NOTE_INDICES; // Show all notes
    }

    // Filter to only notes in the scale
    return NOTE_INDICES.filter((noteIndex) => isNoteInScale(noteIndex, rootNote, selectedScale));
  }, [scaleKey, rootNote]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!focusedCell) return;

      const { noteIndex, stepIndex } = focusedCell;
      const step = stepsRef.current[stepIndex];
      const isActive = step?.noteIndex === noteIndex;

      // Arrow key navigation
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedCell({
          noteIndex,
          stepIndex: Math.min(stepIndex + 1, maxSteps - 1),
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedCell({
          noteIndex,
          stepIndex: Math.max(stepIndex - 1, 0),
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentRowIndex = NOTE_INDICES.indexOf(noteIndex);
        const nextRowIndex = Math.min(currentRowIndex + 1, NOTE_INDICES.length - 1);
        setFocusedCell({
          noteIndex: NOTE_INDICES[nextRowIndex],
          stepIndex,
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentRowIndex = NOTE_INDICES.indexOf(noteIndex);
        const prevRowIndex = Math.max(currentRowIndex - 1, 0);
        setFocusedCell({
          noteIndex: NOTE_INDICES[prevRowIndex],
          stepIndex,
        });
      }
      // Toggle note with Enter or Space
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleNoteClick(noteIndex, stepIndex);
      }
      // Keyboard shortcuts for note properties (only if cell is active)
      else if (isActive) {
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          toggleAccent(stepIndex);
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          toggleSlide(stepIndex);
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          toggleMute(stepIndex);  // TT-303 mute
        } else if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          toggleHammer(stepIndex);  // TT-303 hammer
        } else if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          // Cycle octave: 0 -> 1 -> -1 -> 0
          const currentOctave = step?.octaveShift ?? 0;
          const newOctave = currentOctave === 0 ? 1 : currentOctave === 1 ? -1 : 0;
          setOctaveShift(stepIndex, newOctave);
        } else if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          // Reset velocity to default
          setVelocity(stepIndex, 100);
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          // Increase velocity
          const currentVel = step?.velocity ?? 100;
          setVelocity(stepIndex, Math.min(127, currentVel + 10));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          // Decrease velocity
          const currentVel = step?.velocity ?? 100;
          setVelocity(stepIndex, Math.max(1, currentVel - 10));
        }
      }
    },
    [focusedCell, handleNoteClick, maxSteps, toggleAccent, toggleSlide, toggleMute, toggleHammer, setOctaveShift, setVelocity]
  );

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Controls */}
      <GridControls
        baseOctave={baseOctave}
        onBaseOctaveChange={setBaseOctave}
        maxSteps={maxSteps}
        onMaxStepsChange={setMaxSteps}
        onResizeAllPatterns={resizeAllPatterns}
        scaleKey={scaleKey}
        rootNote={rootNote}
        onScaleChange={setScaleKey}
        onRootNoteChange={setRootNote}
        onClearAll={clearAll}
        onRandomize={handleRandomize}
        onAcidGenerator={handleAcidGenerator}
        cellSize={cellSize}
      />

      {/* Grid */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-2">
        <div
          ref={gridRef}
          className="inline-block min-w-full relative"
          style={{ willChange: 'transform' }}
          role="grid"
          aria-label="TB-303 Pattern Grid"
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {/* Step numbers header */}
          <div className="flex items-center mb-1 pl-12 relative" role="row" style={{ zIndex: 10 }}>
            {stepIndices.map((stepIdx) => {
              const isCurrentDiscrete = currentStep === stepIdx;
              const isBeatMarker = stepIdx % 4 === 0;
              return (
                <div
                  key={stepIdx}
                  className={`flex items-center justify-center text-[10px] font-mono mx-0.5 rounded-sm relative overflow-hidden
                    ${isBeatMarker ? 'text-text-tertiary' : 'text-text-muted'}
                    ${isCurrentDiscrete ? 'text-white font-bold' : ''}
                  `}
                  style={{
                    width: `${cellSize}px`,
                    height: `${cellSize}px`,
                  }}
                >
                  {isCurrentDiscrete && (
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: '#ef4444', opacity: 0.6, zIndex: 1 }}
                    />
                  )}
                  <span className="relative z-10">{stepIdx.toString().padStart(2, '0')}</span>
                </div>
              );
            })}
          </div>

          {/* Note rows (filtered by scale) */}
          {filteredNoteIndices.map((noteIndex) => {
            const noteNameIndex = NOTE_INDICES.indexOf(noteIndex);
            const isRootNote = noteIndex === rootNote;

            return (
              <div key={noteIndex} className="flex items-center mb-0.5 relative" role="row" style={{ isolation: 'isolate' }}>
                {/* Row label */}
                <div
                  className={`w-10 mr-2 text-right text-xs font-mono
                    ${isRootNote ? 'text-accent-primary font-bold' : NOTE_NAMES[noteNameIndex].includes('#') ? 'text-text-muted' : 'text-text-secondary'}
                  `}
                  aria-label={`Note ${NOTE_NAMES[noteNameIndex]}${isRootNote ? ' (Root)' : ''}`}
                >
                  {NOTE_NAMES[noteNameIndex]}
                  {isRootNote && <span className="ml-0.5 text-[8px]">●</span>}
                </div>

              {/* Cells */}
              {stepIndices.map((stepIdx) => {
                const step = gridPattern.steps[stepIdx];
                const isActive = step?.noteIndex === noteIndex;
                const isFocused = focusedCell?.noteIndex === noteIndex && focusedCell?.stepIndex === stepIdx;
                
                // Calculate trail opacity (discrete mode only)
                const trailOpacity = trailSteps.find(t => t.step === stepIdx)?.opacity || 0;
                const isCurrentStepCheck = currentStep === stepIdx;
                const isBeatMarker = stepIdx % 4 === 0;

                return (
                  <div
                    key={stepIdx}
                    className="mx-0.5 rounded-sm relative"
                    role="gridcell"
                  >
                    <NoteGridCell
                      noteIndex={noteIndex}
                      stepIndex={stepIdx}
                      isActive={isActive}
                      isCurrentStep={isCurrentStepCheck}
                      isTriggered={currentStep === stepIdx && isActive}
                      isFocused={isFocused}
                      accent={isActive ? step?.accent : false}
                      slide={isActive ? step?.slide : false}
                      mute={isActive ? step?.mute : false}
                      hammer={isActive ? step?.hammer : false}
                      octaveShift={isActive ? step?.octaveShift : 0}
                      velocity={isActive ? step?.velocity : 100}
                      cellSize={cellSize}
                      trailOpacity={trailOpacity}
                      isBeatMarker={isBeatMarker}
                      onClick={handleNoteClick}
                      onToggleAccent={toggleAccent}
                      onToggleSlide={toggleSlide}
                      onToggleMute={toggleMute}
                      onToggleHammer={toggleHammer}
                      onSetOctave={handleSetOctave}
                      onSetVelocity={setVelocity}
                      onFocus={() => setFocusedCell({ noteIndex, stepIndex: stepIdx })}
                    />
                  </div>
                );
              })}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-dark-border space-y-2">
          <div className="flex items-center gap-6 text-[10px] text-text-muted flex-wrap">
            <span>Click: note</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-accent-warning/80" /> Shift+click: accent
            </span>
            <span className="flex items-center gap-1">
              <span className="text-accent-secondary">↗</span> Ctrl+click: slide
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-accent-primary ring-2 ring-cyan-400 ring-inset" />
              <span className="w-3 h-3 rounded-sm bg-accent-primary ring-2 ring-pink-400 ring-inset" />
              Alt+click: octave
            </span>
            <span>Right-click: menu</span>
            <span>Scroll: velocity</span>
          </div>
          <div className="flex items-center gap-6 text-[10px] text-text-muted flex-wrap">
            <span className="font-semibold text-text-secondary">Keyboard:</span>
            <span>Arrows: navigate</span>
            <span>Enter/Space: toggle</span>
            <span>A: accent</span>
            <span>S: slide</span>
            <span>M: mute</span>
            <span>H: hammer</span>
            <span>O: octave</span>
            <span>V: velocity reset</span>
            <span>+/-: velocity ±10</span>
          </div>
        </div>
      </div>

      {/* Acid Pattern Generator Dialog */}
      {showAcidGenerator && (
        <AcidPatternGeneratorDialog
          channelIndex={channelIndex}
          onClose={() => setShowAcidGenerator(false)}
        />
      )}
    </div>
  );
};
