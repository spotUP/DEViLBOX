/**
 * GridSequencer - Alternative pattern view with 303-style grid interface
 *
 * Layout:
 * - 12 pitch rows (C to B) for one octave
 * - Note properties shown on cells: accent (orange), slide (arrow), octave (+/-)
 *
 * Interactions:
 * - Click: toggle note
 * - Shift+click: toggle accent
 * - Ctrl/Cmd+click: toggle slide
 * - Alt+click: cycle octave (normal → +1 → -1 → normal)
 * - Right-click: context menu with all options
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useGridPattern } from '../../hooks/useGridPattern';
import { useTransportStore } from '../../stores/useTransportStore';
import { GridControls } from './GridControls';
import { NoteGridCell } from './GridCell';

const NOTE_NAMES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'] as const;
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
    setOctaveShift,
    clearAll,
  } = useGridPattern(channelIndex);

  const { currentRow, isPlaying } = useTransportStore();

  // Current playback step (only show when playing)
  const currentStep = isPlaying ? currentRow % maxSteps : -1;

  // Use a ref to access current steps without causing callback recreation
  const stepsRef = useRef(gridPattern.steps);
  
  useEffect(() => {
    stepsRef.current = gridPattern.steps;
  }, [gridPattern.steps]);

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
      }
    },
    [setNote]
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

  // Generate step column indices
  const stepIndices = useMemo(() => Array.from({ length: maxSteps }, (_, i) => i), [maxSteps]);

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Controls */}
      <GridControls
        baseOctave={baseOctave}
        onBaseOctaveChange={setBaseOctave}
        maxSteps={maxSteps}
        onMaxStepsChange={setMaxSteps}
        onResizeAllPatterns={resizeAllPatterns}
        onClearAll={clearAll}
        onRandomize={handleRandomize}
      />

      {/* Grid */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col min-h-full min-w-full">
          {/* Step numbers header */}
          <div className="flex items-center mb-1 pl-12 shrink-0">
            {stepIndices.map((stepIdx) => (
              <div
                key={stepIdx}
                className={`w-7 h-4 flex items-center justify-center text-[10px] font-mono mx-0.5
                  ${stepIdx % 4 === 0 ? 'text-text-primary' : 'text-text-muted'}
                  ${currentStep === stepIdx ? 'text-accent-primary font-bold' : ''}
                `}
              >
                {(stepIdx + 1).toString().padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Note rows (B to C, high to low) */}
          <div className="flex-1 flex flex-col min-h-0">
            {NOTE_INDICES.map((noteIndex, rowIndex) => (
              <div key={noteIndex} className="flex flex-1 items-stretch mb-0.5 min-h-[30px]">
                {/* Row label */}
                <div
                  className={`w-10 mr-2 flex items-center justify-end text-xs font-mono
                    ${NOTE_NAMES[rowIndex].includes('#') ? 'text-text-muted' : 'text-text-secondary'}
                  `}
                >
                  {NOTE_NAMES[rowIndex]}
                </div>

                {/* Cells container */}
                <div className="flex flex-1 items-stretch">
                  {stepIndices.map((stepIdx) => {
                    const step = gridPattern.steps[stepIdx];
                    const isActive = step?.noteIndex === noteIndex;

                    return (
                      <div key={stepIdx} className="mx-0.5 flex-1 min-w-[28px]">
                        <NoteGridCell
                          noteIndex={noteIndex}
                          stepIndex={stepIdx}
                          isActive={isActive}
                          isCurrentStep={currentStep === stepIdx}
                          accent={isActive ? step?.accent : false}
                          slide={isActive ? step?.slide : false}
                          octaveShift={isActive ? step?.octaveShift : 0}
                          onClick={handleNoteClick}
                          onToggleAccent={toggleAccent}
                          onToggleSlide={toggleSlide}
                          onSetOctave={handleSetOctave}
                          className="w-full h-full"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-dark-border flex items-center gap-6 text-[10px] text-text-muted">
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
        </div>
      </div>
    </div>
  );
};
