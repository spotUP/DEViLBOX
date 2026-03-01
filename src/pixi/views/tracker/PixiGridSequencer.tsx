/**
 * PixiGridSequencer — Native PixiJS port of the DOM GridSequencer.
 *
 * 1:1 functional parity with the DOM version:
 *  - 12 pitch rows (C to B) for one octave, filtered by scale
 *  - Click to toggle note, Shift+Click for accent, Ctrl/Cmd+Click for slide
 *  - Alt+Click cycles octave, right-click context menu
 *  - Keyboard navigation (arrows, enter/space, A/S/M/H/O keys)
 *  - Playback step highlight with trail
 *  - Auto-fit cell sizing
 *  - MIDI integration
 *
 * Rendering: pixiGraphics for backgrounds/cells, pixiBitmapText for labels.
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton, PixiNumericInput, PixiLabel, PixiSelect } from '../../components';
import { useGridPattern } from '@/hooks/useGridPattern';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useShallow } from 'zustand/react/shallow';
import { SCALES, isNoteInScale } from '@/lib/scales';
import { getToneEngine } from '@engine/ToneEngine';
import * as Tone from 'tone';

const NOTE_NAMES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'] as const;
const NOTE_NAMES_FORWARD = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const NOTE_INDICES = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

const LABEL_WIDTH = 48;
const HEADER_HEIGHT = 32;
const CONTROLS_HEIGHT = 36;
const ROW_HEIGHT = 24;
const CELL_GAP = 2;

interface PixiGridSequencerProps {
  channelIndex: number;
  width: number;
  height: number;
  /** When false, PixiDOMOverlay children are hidden (prevents leaking when this view is inactive). */
  isActive?: boolean;
}

export const PixiGridSequencer: React.FC<PixiGridSequencerProps> = ({
  channelIndex,
  width,
  height,
  isActive = true,
}) => {
  const theme = usePixiTheme();
  const {
    gridPattern,
    baseOctave,
    setBaseOctave,
    maxSteps,
    setMaxSteps,
    setNote,
    toggleAccent,
    toggleSlide,
    toggleMute,
    toggleHammer,
    setOctaveShift,
    setVelocity,
    clearAll,
  } = useGridPattern(channelIndex);

  const { currentRow, isPlaying } = useTransportStore(
    useShallow((s) => ({ currentRow: s.currentRow, isPlaying: s.isPlaying }))
  );

  const currentStep = isPlaying ? currentRow % maxSteps : -1;

  // Scale mode state
  const [scaleKey, setScaleKey] = useState<string>('chromatic');
  const [rootNote] = useState<number>(0);

  // Focus state for keyboard navigation
  const [focusedCell, setFocusedCell] = useState<{ noteIndex: number; stepIndex: number } | null>({ noteIndex: 11, stepIndex: 0 });

  // Ref for rapid access to steps
  const stepsRef = useRef(gridPattern.steps);
  useEffect(() => { stepsRef.current = gridPattern.steps; }, [gridPattern.steps]);

  // Compute filtered rows based on scale
  const filteredNoteIndices = useMemo(() => {
    const selectedScale = SCALES[scaleKey];
    if (!selectedScale || scaleKey === 'chromatic') return NOTE_INDICES;
    return NOTE_INDICES.filter((noteIndex) => isNoteInScale(noteIndex, rootNote, selectedScale));
  }, [scaleKey, rootNote]);

  // Compute cell size to fit all steps
  const cellSize = useMemo(() => {
    const availableWidth = width - LABEL_WIDTH - 16;
    const totalCellWidth = Math.floor(availableWidth / maxSteps);
    return Math.max(14, Math.min(28, totalCellWidth - CELL_GAP));
  }, [width, maxSteps]);

  // Trail steps for visual effect
  const trailSteps = useMemo(() => {
    if (currentStep < 0) return new Map<number, number>();
    const map = new Map<number, number>();
    for (let i = 1; i <= 7; i++) {
      const s = (currentStep - i + maxSteps) % maxSteps;
      map.set(s, 0.5 - (i - 1) * 0.07);
    }
    return map;
  }, [currentStep, maxSteps]);

  // Preview note
  const previewNote = useCallback((noteIndex: number, octaveShift: number = 0) => {
    try {
      const engine = getToneEngine();
      if (!engine) return;
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      const channel = pattern?.channels[channelIndex];
      const instrumentId = channel?.instrumentId ?? 1;
      const instrument = useInstrumentStore.getState().instruments.find(i => i.id === instrumentId);
      if (instrument) {
        const noteName = NOTE_NAMES_FORWARD[noteIndex];
        const fullNote = `${noteName}${baseOctave + octaveShift}`;
        engine.triggerNote(instrumentId, fullNote, 0.2, Tone.now(), 0.8, instrument, false, false);
      }
    } catch (_e) { /* ignore preview errors */ }
  }, [channelIndex, baseOctave]);

  // Handle click on grid cell
  const handleNoteClick = useCallback((noteIndex: number, stepIndex: number) => {
    const step = stepsRef.current[stepIndex];
    if (step?.noteIndex === noteIndex) {
      setNote(stepIndex, null);
    } else {
      const octaveShift = step?.noteIndex !== null ? step.octaveShift : 0;
      setNote(stepIndex, noteIndex, octaveShift);
      previewNote(noteIndex, octaveShift);
    }
  }, [setNote, previewNote]);

  // Handle pointer events on the grid
  const handleGridPointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const x = local.x - LABEL_WIDTH;
    const y = local.y - HEADER_HEIGHT;
    if (x < 0 || y < 0) return;

    const stepIndex = Math.floor(x / (cellSize + CELL_GAP));
    const rowIndex = Math.floor(y / ROW_HEIGHT);
    if (stepIndex < 0 || stepIndex >= maxSteps || rowIndex < 0 || rowIndex >= filteredNoteIndices.length) return;

    const noteIndex = filteredNoteIndices[rowIndex];

    // Update focus
    setFocusedCell({ noteIndex, stepIndex });

    const nativeEvent = e.nativeEvent as PointerEvent;
    if (nativeEvent.shiftKey) {
      // Toggle accent
      const step = stepsRef.current[stepIndex];
      if (step?.noteIndex === noteIndex) {
        toggleAccent(stepIndex);
      }
    } else if (nativeEvent.ctrlKey || nativeEvent.metaKey) {
      // Toggle slide
      const step = stepsRef.current[stepIndex];
      if (step?.noteIndex === noteIndex) {
        toggleSlide(stepIndex);
      }
    } else if (nativeEvent.altKey) {
      // Cycle octave
      const step = stepsRef.current[stepIndex];
      if (step?.noteIndex === noteIndex) {
        const current = step.octaveShift;
        const next = current === 0 ? 1 : current === 1 ? -1 : 0;
        setOctaveShift(stepIndex, next);
      }
    } else {
      handleNoteClick(noteIndex, stepIndex);
    }
  }, [cellSize, maxSteps, filteredNoteIndices, handleNoteClick, toggleAccent, toggleSlide, setOctaveShift]);

  // Draw the main grid
  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();
    const gridWidth = maxSteps * (cellSize + CELL_GAP);
    const gridHeight = filteredNoteIndices.length * ROW_HEIGHT;
    const totalH = HEADER_HEIGHT + gridHeight;

    // Background
    g.rect(0, 0, Math.max(width, LABEL_WIDTH + gridWidth + 8), totalH);
    g.fill({ color: theme.bg.color });

    // Step number header background
    g.rect(LABEL_WIDTH, 0, gridWidth, HEADER_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });

    // Step number header cells
    for (let s = 0; s < maxSteps; s++) {
      const x = LABEL_WIDTH + s * (cellSize + CELL_GAP);
      const isCurrentDiscrete = currentStep === s;
      const isBeatMarker = s % 4 === 0;

      if (isCurrentDiscrete) {
        g.rect(x, 0, cellSize, HEADER_HEIGHT);
        g.fill({ color: 0xef4444, alpha: 0.6 });
      }

      // Beat marker emphasis
      if (isBeatMarker && !isCurrentDiscrete) {
        g.rect(x, HEADER_HEIGHT - 2, cellSize, 2);
        g.fill({ color: theme.accent.color, alpha: 0.15 });
      }
    }

    // Note rows
    for (let row = 0; row < filteredNoteIndices.length; row++) {
      const noteIndex = filteredNoteIndices[row];
      const y = HEADER_HEIGHT + row * ROW_HEIGHT;
      const isRootNote = noteIndex === rootNote;
      const isSharp = NOTE_NAMES[NOTE_INDICES.indexOf(noteIndex)].includes('#');

      // Row background
      g.rect(0, y, LABEL_WIDTH + gridWidth + 8, ROW_HEIGHT);
      g.fill({ color: isSharp ? theme.bgSecondary.color : theme.bg.color, alpha: isSharp ? 0.6 : 1 });

      // Root note indicator
      if (isRootNote) {
        g.rect(0, y, 2, ROW_HEIGHT);
        g.fill({ color: theme.accent.color });
      }

      // Row border
      g.rect(0, y + ROW_HEIGHT - 1, LABEL_WIDTH + gridWidth + 8, 1);
      g.fill({ color: theme.border.color, alpha: 0.08 });

      // Grid cells for this row
      for (let s = 0; s < maxSteps; s++) {
        const x = LABEL_WIDTH + s * (cellSize + CELL_GAP);
        const step = gridPattern.steps[s];
        const isActive = step?.noteIndex === noteIndex;
        const isCurrentDiscrete = currentStep === s;
        const isBeatMarker = s % 4 === 0;
        const trailOpacity = trailSteps.get(s) ?? 0;
        const isFocused = focusedCell?.noteIndex === noteIndex && focusedCell?.stepIndex === s;

        // Cell background
        if (isActive) {
          // Active note cell
          const cellColor = step?.accent ? 0xd97706 : theme.accent.color; // orange for accent
          g.roundRect(x, y + 1, cellSize, ROW_HEIGHT - 2, 2);
          g.fill({ color: cellColor, alpha: 0.85 });

          // Slide indicator (diagonal line in corner)
          if (step?.slide) {
            g.moveTo(x + cellSize - 6, y + 2);
            g.lineTo(x + cellSize - 1, y + 7);
            g.stroke({ color: theme.accentSecondary.color, width: 1.5, alpha: 0.9 });
          }

          // Octave indicator rings
          if (step?.octaveShift === 1) {
            g.roundRect(x + 1, y + 2, cellSize - 2, ROW_HEIGHT - 4, 2);
            g.stroke({ color: 0x22d3ee, width: 1.5, alpha: 0.6 }); // cyan
          } else if (step?.octaveShift === -1) {
            g.roundRect(x + 1, y + 2, cellSize - 2, ROW_HEIGHT - 4, 2);
            g.stroke({ color: 0xec4899, width: 1.5, alpha: 0.6 }); // pink
          }

          // Mute indicator
          if (step?.mute) {
            g.moveTo(x + 2, y + 2);
            g.lineTo(x + cellSize - 2, y + ROW_HEIGHT - 2);
            g.moveTo(x + cellSize - 2, y + 2);
            g.lineTo(x + 2, y + ROW_HEIGHT - 2);
            g.stroke({ color: 0xff4444, width: 1, alpha: 0.7 });
          }

          // Hammer indicator
          if (step?.hammer) {
            g.rect(x + 2, y + ROW_HEIGHT - 5, cellSize - 4, 2);
            g.fill({ color: 0x22d3ee, alpha: 0.8 });
          }
        } else {
          // Empty cell
          g.roundRect(x, y + 1, cellSize, ROW_HEIGHT - 2, 2);
          g.fill({ color: theme.bgTertiary.color, alpha: isBeatMarker ? 0.6 : 0.3 });
        }

        // Current step playback highlight
        if (isCurrentDiscrete) {
          g.roundRect(x, y + 1, cellSize, ROW_HEIGHT - 2, 2);
          g.fill({ color: 0xef4444, alpha: isActive ? 0.5 : 0.15 });
        }

        // Trail
        if (trailOpacity > 0 && !isCurrentDiscrete) {
          g.roundRect(x, y + 1, cellSize, ROW_HEIGHT - 2, 2);
          g.fill({ color: 0xef4444, alpha: trailOpacity * 0.12 });
        }

        // Focus outline
        if (isFocused) {
          g.roundRect(x - 0.5, y + 0.5, cellSize + 1, ROW_HEIGHT - 1, 2);
          g.stroke({ color: theme.accent.color, width: 1.5, alpha: 0.8 });
        }
      }
    }

    // Header bottom border
    g.rect(0, HEADER_HEIGHT - 1, LABEL_WIDTH + gridWidth + 8, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [width, theme, maxSteps, cellSize, filteredNoteIndices, gridPattern.steps, currentStep, rootNote, trailSteps, focusedCell]);

  // Step number labels
  const stepLabels = useMemo(() => {
    const labels: { x: number; text: string; highlight: boolean }[] = [];
    for (let s = 0; s < maxSteps; s++) {
      labels.push({
        x: LABEL_WIDTH + s * (cellSize + CELL_GAP) + cellSize / 2 - 5,
        text: s.toString().padStart(2, '0'),
        highlight: currentStep === s,
      });
    }
    return labels;
  }, [maxSteps, cellSize, currentStep]);

  // Note row labels
  const noteLabels = useMemo(() => {
    return filteredNoteIndices.map((noteIndex, row) => {
      const nameIdx = NOTE_INDICES.indexOf(noteIndex);
      return {
        y: HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2 - 4,
        text: NOTE_NAMES[nameIdx],
        isRoot: noteIndex === rootNote,
        isSharp: NOTE_NAMES[nameIdx].includes('#'),
      };
    });
  }, [filteredNoteIndices, rootNote]);

  // Keyboard handler (window-level for focus-independent control)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (!focusedCell) return;

      const { noteIndex, stepIndex } = focusedCell;
      const step = stepsRef.current[stepIndex];
      const isActive = step?.noteIndex === noteIndex;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedCell({ noteIndex, stepIndex: Math.min(stepIndex + 1, maxSteps - 1) });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedCell({ noteIndex, stepIndex: Math.max(stepIndex - 1, 0) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = filteredNoteIndices.indexOf(noteIndex);
        const next = Math.min(idx + 1, filteredNoteIndices.length - 1);
        setFocusedCell({ noteIndex: filteredNoteIndices[next], stepIndex });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filteredNoteIndices.indexOf(noteIndex);
        const prev = Math.max(idx - 1, 0);
        setFocusedCell({ noteIndex: filteredNoteIndices[prev], stepIndex });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleNoteClick(noteIndex, stepIndex);
      } else if (isActive) {
        if (e.key === 'a' || e.key === 'A') { e.preventDefault(); toggleAccent(stepIndex); }
        else if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleSlide(stepIndex); }
        else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMute(stepIndex); }
        else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHammer(stepIndex); }
        else if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          const current = step!.octaveShift;
          const next = current === 0 ? 1 : current === 1 ? -1 : 0;
          setOctaveShift(stepIndex, next);
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setVelocity(stepIndex, Math.min(127, (step?.velocity ?? 100) + 10));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setVelocity(stepIndex, Math.max(1, (step?.velocity ?? 100) - 10));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCell, maxSteps, filteredNoteIndices, handleNoteClick, toggleAccent, toggleSlide, toggleMute, toggleHammer, setOctaveShift, setVelocity]);

  // Randomize handler
  const handleRandomize = useCallback(() => {
    for (let i = 0; i < maxSteps; i++) {
      if (Math.random() < 0.7) {
        const ni = Math.floor(Math.random() * 12);
        const os = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        setNote(i, ni, os);
        if (Math.random() < 0.25) toggleAccent(i);
        if (i > 0 && Math.random() < 0.2) toggleSlide(i);
      } else {
        setNote(i, null);
      }
    }
  }, [maxSteps, setNote, toggleAccent, toggleSlide]);

  // Controls bar background
  const drawControlsBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, CONTROLS_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, CONTROLS_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  const gridAreaHeight = height - CONTROLS_HEIGHT;

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* Controls Bar — native Pixi */}
      <pixiContainer
        layout={{
          width,
          height: CONTROLS_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 8,
        }}
      >
        <pixiGraphics draw={drawControlsBg} layout={{ position: 'absolute', width, height: CONTROLS_HEIGHT }} />

        <PixiLabel text="OCTAVE" size="xs" color="textMuted" />
        <PixiButton label="-" variant="ghost" size="sm" onClick={() => setBaseOctave(Math.max(1, baseOctave - 1))} />
        <PixiLabel text={`${baseOctave}`} size="sm" weight="bold" />
        <PixiButton label="+" variant="ghost" size="sm" onClick={() => setBaseOctave(Math.min(6, baseOctave + 1))} />

        {/* Separator */}
        <pixiGraphics
          draw={(g: GraphicsType) => { g.clear(); g.rect(0, 4, 1, 24); g.fill({ color: theme.border.color, alpha: 0.25 }); }}
          layout={{ width: 1, height: 32 }}
        />

        <PixiLabel text="STEPS" size="xs" color="textMuted" />
        <PixiNumericInput value={maxSteps} min={4} max={64} onChange={setMaxSteps} width={44} />

        {/* Scale selector */}
        <PixiSelect
          value={scaleKey}
          options={Object.keys(SCALES).map(k => ({ value: k, label: k.toUpperCase() }))}
          onChange={setScaleKey}
          width={100}
          height={24}
        />

        {/* Spacer */}
        <pixiContainer layout={{ flex: 1 }} />

        <PixiButton label="RANDOM" variant="ghost" size="sm" onClick={handleRandomize} />
        <PixiButton label="CLEAR" variant="ghost" size="sm" color="red" onClick={clearAll} />
      </pixiContainer>

      {/* Grid Area — native Pixi rendering */}
      <pixiContainer
        layout={{ width, height: gridAreaHeight }}
        eventMode="static"
        cursor="pointer"
        onPointerDown={handleGridPointerDown}
      >
        <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height: gridAreaHeight }} />

        {/* Step number labels */}
        {stepLabels.map((label) => (
          <pixiBitmapText
            key={`step-${label.text}`}
            text={label.text}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={label.highlight ? 0xffffff : theme.textMuted.color}
            x={label.x}
            y={HEADER_HEIGHT / 2 - 5}
          />
        ))}

        {/* Note row labels */}
        {noteLabels.map((label) => (
          <pixiBitmapText
            key={`note-${label.text}-${label.y}`}
            text={label.text}
            style={{
              fontFamily: label.isRoot ? PIXI_FONTS.MONO_BOLD : PIXI_FONTS.MONO,
              fontSize: 10,
              fill: 0xffffff,
            }}
            tint={label.isRoot ? theme.accent.color : label.isSharp ? theme.textMuted.color : theme.textSecondary.color}
            x={LABEL_WIDTH - 32}
            y={label.y}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};
