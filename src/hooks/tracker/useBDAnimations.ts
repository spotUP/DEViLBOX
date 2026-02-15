/**
 * useBDAnimations - Hook for applying B/D command animations to patterns
 * 
 * Integrates BDCommandGenerator with tracker store to insert commands
 * and manipulate pattern order for visual animations and playback effects.
 * 
 * OPTIMIZED: Uses helper patterns with D commands to minimize pattern order usage
 */

import { useCallback } from 'react';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';
import type { TrackerCell } from '@typedefs/tracker';
import {
  BDCommandGenerator,
  CommandInserter,
  PatternOrderHelper,
  type NoteData,
  type CellCommand,
  type HelperPattern,
} from '@utils/bdCommands/BDCommandGenerator';

export interface AnimationOptions {
  patternIndex: number;
  channelIndex: number;
  startRow: number;
  endRow: number;
}

const EMPTY_CELL: TrackerCell = {
  note: 0,
  instrument: 0, // 0 = no instrument
  volume: 0,
  effTyp: 0,
  eff: 0,
  effTyp2: 0,
  eff2: 0,
};

export const useBDAnimations = () => {
  const store = useTrackerStore();
  const { patterns, patternOrder, setCell, addToOrder, setCurrentPosition } = store;
  const { setStatusMessage } = useUIStore.getState();

  /**
   * Create a helper pattern from HelperPattern specification
   * Returns the new pattern index
   */
  const createHelperPattern = useCallback(
    (helperPattern: HelperPattern): number => {
      const numChannels = patterns[0]?.channels.length || 4;
      
      // Create empty pattern
      const newPattern = {
        id: `pattern-helper-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: 'B/D Animation Helper',
        length: helperPattern.length,
        channels: Array.from({ length: numChannels }, (_, i) => ({
          id: `channel-${i}-${Date.now()}`,
          name: `Channel ${i + 1}`,
          rows: Array.from({ length: helperPattern.length }, () => ({ ...EMPTY_CELL })),
          muted: false,
          solo: false,
          collapsed: false,
          volume: 80,
          pan: 0,
          instrumentId: null,
          color: null,
        })),
      };

      // Insert notes
      helperPattern.notes.forEach(({ row, channel, cell }) => {
        if (newPattern.channels[channel]) {
          newPattern.channels[channel].rows[row] = { ...cell };
        }
      });

      // Insert commands
      helperPattern.commands.forEach(({ row, channel, effTyp, eff }) => {
        if (newPattern.channels[channel]) {
          const targetCell = newPattern.channels[channel].rows[row];
          CommandInserter.insertCommand(targetCell, effTyp, eff);
        }
      });

      // Add pattern to store using the hook's patterns count for next index
      const newPatternIndex = patterns.length;
      useTrackerStore.setState((state) => {
        state.patterns.push(newPattern);
      });

      return newPatternIndex;
    },
    [patterns]
  );

  /**
   * Collect notes from selection
   */
  const collectNotes = useCallback(
    (options: AnimationOptions): NoteData[] => {
      const { patternIndex, channelIndex, startRow, endRow } = options;
      const pattern = patterns[patternIndex];
      if (!pattern) return [];

      const notes: NoteData[] = [];
      const channel = pattern.channels[channelIndex];
      if (!channel) return [];

      for (let row = startRow; row <= endRow; row++) {
        const cell = channel.rows[row];
        if (cell && cell.note > 0 && cell.note < 97) {
          notes.push({
            originalRow: row,
            originalChannel: channelIndex,
            channel: channelIndex, // Alias for convenience
            cell: { ...cell },
            timing: row, // Simplified - real timing would be row * ticksPerRow
          });
        }
      }

      return notes;
    },
    [patterns]
  );

  /**
   * Apply commands to pattern cells
   */
  const applyCommands = useCallback(
    (commands: CellCommand[], patternIndex: number): number => {
      let appliedCount = 0;
      let collisionCount = 0;

      // We need to use the latest patterns from state to avoid closure issues
      const currentPatterns = useTrackerStore.getState().patterns;
      const pattern = currentPatterns[patternIndex];
      if (!pattern) return 0;

      commands.forEach(cmd => {
        const channel = pattern.channels[cmd.channel];
        if (!channel) return;

        const originalCell = channel.rows[cmd.row];
        if (!originalCell) return;

        // Clone the cell to avoid mutating frozen state (Zustand/Immer)
        const cell = { ...originalCell };
        const result = CommandInserter.insertCommand(cell, cmd.effTyp, cmd.eff);
        if (result.success) {
          setCell(cmd.channel, cmd.row, cell);
          appliedCount++;
        } else {
          collisionCount++;
        }
      });

      if (collisionCount > 0) {
        console.warn(`[BDAnimations] ${collisionCount} commands couldn't be inserted (effect columns occupied)`);
      }

      return appliedCount;
    },
    [setCell]
  );

  /**
   * Apply pattern order entries
   * If helperPattern is provided, creates the helper pattern first
   */
  const applyPatternOrder = useCallback(
    (
      entries: Array<{ patternIndex: number; startRow?: number }>,
      helperPattern?: HelperPattern
    ): number => {
      let actualPatternIndex = entries[0]?.patternIndex;

      // Create helper pattern if specified
      if (helperPattern) {
        actualPatternIndex = createHelperPattern(helperPattern);
      }

      // Add to pattern order and jump there
      const newPosIndex = patternOrder.length;
      entries.forEach(() => {
        addToOrder(actualPatternIndex!);
      });
      
      // Jump to the new position in the song so the user sees the animation
      setCurrentPosition(newPosIndex);

      return entries.length;
    },
    [addToOrder, createHelperPattern, patternOrder.length, setCurrentPosition]
  );

  /**
   * Apply reverse visual animation
   * OPTIMIZED: Uses helper pattern with D commands (only 1 pattern order slot)
   */
  const applyReverseVisual = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      if (notes.length === 0) {
        setStatusMessage('No notes to reverse');
        return false;
      }

      const pattern = patterns[options.patternIndex];
      if (!pattern) {
        setStatusMessage('Pattern not found');
        return false;
      }

      const result = BDCommandGenerator.generateReverseVisual(
        notes,
        options.patternIndex,
        pattern.length
      );

      if (!result.success) {
        setStatusMessage(result.warnings.join(', ') || 'Failed to generate reverse animation');
        return false;
      }

      // Apply pattern order (creates helper pattern if needed)
      // NOTE: We don't call applyCommands here because they are already in the helper pattern
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);

      setStatusMessage(
        `REVERSE VISUAL: Created animation pattern at end of song`
      );

      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply polyrhythm using E6x loop commands
   * MOST EFFICIENT: Uses 0 pattern order slots (loops in-place)
   */
  const applyPolyrhythm = useCallback(
    (
      patternIndex: number,
      channels: number[],
      loopLengths: number[], // Repeat counts for each channel (1-15)
      startRow: number,
      endRow: number
    ): boolean => {
      const result = BDCommandGenerator.generatePolyrhythm(
        channels,
        loopLengths,
        startRow,
        endRow
      );

      if (!result.success) {
        setStatusMessage(result.warnings.join(', ') || 'Failed to generate polyrhythm');
        return false;
      }

      const appliedCount = applyCommands(result.commands, patternIndex);

      setStatusMessage(
        `POLYRHYTHM: Applied ${appliedCount} loop commands (${loopLengths.join(':')} ratio)`
      );

      return true;
    },
    [applyCommands]
  );

  /**
   * Apply Fibonacci sequence animation
   * OPTIMIZED: Uses helper pattern with D commands (only 1 pattern order slot)
   */
  const applyFibonacciSequence = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      if (notes.length === 0) {
        setStatusMessage('No notes for Fibonacci sequence');
        return false;
      }

      const pattern = patterns[options.patternIndex];
      if (!pattern) {
        setStatusMessage('Pattern not found');
        return false;
      }

      const result = BDCommandGenerator.generateFibonacciSequence(
        options.patternIndex,
        options.startRow,
        pattern.length,
        notes
      );

      if (!result.success) {
        setStatusMessage(result.warnings.join(', ') || 'Failed to generate Fibonacci sequence');
        return false;
      }

      // NOTE: Commands are already in helperPattern
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);

      setStatusMessage(
        `FIBONACCI: Created animation pattern at end of song`
      );

      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Euclidean rhythm pattern
   * OPTIMIZED: Uses helper pattern with D commands (only 1 pattern order slot)
   */
  const applyEuclideanPattern = useCallback(
    (
      options: AnimationOptions,
      pulses: number,
      steps: number,
      stepSize: number = 4
    ): boolean => {
      const notes = collectNotes(options);
      if (notes.length === 0) {
        setStatusMessage('No notes for Euclidean pattern');
        return false;
      }

      const result = BDCommandGenerator.generateEuclideanPattern(
        options.patternIndex,
        pulses,
        steps,
        options.startRow,
        stepSize,
        notes
      );

      if (!result.success) {
        setStatusMessage(result.warnings.join(', ') || 'Failed to generate Euclidean pattern');
        return false;
      }

      // NOTE: Commands are already in helperPattern
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);

      setStatusMessage(
        `EUCLIDEAN [${pulses},${steps}]: Created animation pattern at end of song`
      );

      return true;
    },
    [collectNotes, applyPatternOrder]
  );

  /**
   * Apply Ping-Pong animation
   */
  const applyPingPong = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generatePingPong(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('PING-PONG: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Glitch animation
   */
  const applyGlitch = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generateGlitch(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('GLITCH: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Strobe animation
   */
  const applyStrobe = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generateStrobe(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('STROBE: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Visual Echo animation
   */
  const applyVisualEcho = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generateVisualEcho(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('VISUAL ECHO: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Converge animation
   */
  const applyConverge = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generateConverge(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('CONVERGE: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Spiral animation
   */
  const applySpiral = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generateSpiral(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('SPIRAL: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Bounce animation
   */
  const applyBounce = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generateBounce(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('BOUNCE: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Apply Chaos animation
   */
  const applyChaos = useCallback(
    (options: AnimationOptions): boolean => {
      const notes = collectNotes(options);
      const result = BDCommandGenerator.generateChaos(notes, options.patternIndex, patterns[options.patternIndex]?.length || 64);
      if (!result.success) { setStatusMessage(result.warnings[0]); return false; }
      applyPatternOrder(result.patternOrderEntries, result.helperPattern);
      setStatusMessage('CHAOS: Created animation pattern');
      return true;
    },
    [collectNotes, patterns, applyPatternOrder]
  );

  /**
   * Check if animation is possible (pattern order space available)
   */
  const canApplyAnimation = useCallback(
    (estimatedOrderEntries: number): { can: boolean; message?: string } => {
      const check = PatternOrderHelper.canFitInPatternOrder(
        patternOrder.length,
        estimatedOrderEntries
      );

      if (!check.fits) {
        return {
          can: false,
          message: `Not enough pattern order slots. Need ${check.slotsNeeded}, have ${check.slotsAvailable}`,
        };
      }

      return { can: true };
    },
    [patternOrder]
  );

  return {
    applyReverseVisual,
    applyPolyrhythm,
    applyFibonacciSequence,
    applyEuclideanPattern,
    applyPingPong,
    applyGlitch,
    applyStrobe,
    applyVisualEcho,
    applyConverge,
    applySpiral,
    applyBounce,
    applyChaos,
    canApplyAnimation,
    collectNotes,
  };
};
