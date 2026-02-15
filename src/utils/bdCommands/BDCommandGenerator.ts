/**
 * BDCommandGenerator - Core utility for generating B/D command sequences
 * 
 * Creates pattern order sequences and E6x loop commands to achieve
 * visual animations and playback patterns without modifying the playback engine.
 * 
 * Key insight: ProTracker animations work via PATTERN ORDER MANIPULATION,
 * not arbitrary jumps within patterns.
 */

import type { TrackerCell } from '@typedefs/tracker';

/**
 * Represents a note with its original timing and position
 */
export interface NoteData {
  originalRow: number;
  originalChannel: number;
  channel: number; // Alias for originalChannel (for convenience)
  cell: TrackerCell;
  timing: number; // In ticks
}

/**
 * Represents a pattern order entry with optional start row
 */
export interface PatternOrderEntry {
  patternIndex: number;
  startRow?: number; // If specified, use D command to start at this row
}

/**
 * Represents a playback path through pattern rows
 */
export interface PlaybackPath {
  entries: PatternOrderEntry[];
  description: string;
}

/**
 * Command to insert into a cell
 */
export interface CellCommand {
  row: number;
  channel: number;
  effTyp: number; // 0xB, 0xD, or 0xE
  eff: number;    // Command parameter
  useSecondColumn?: boolean; // Use effTyp2/eff2 if true
}

/**
 * Helper pattern specification
 */
export interface HelperPattern {
  notes: Array<{
    row: number;
    channel: number;
    cell: TrackerCell;
  }>;
  commands: CellCommand[];
  length: number;
}

/**
 * Result of command generation
 */
export interface GenerationResult {
  commands: CellCommand[];
  patternOrderEntries: PatternOrderEntry[];
  helperPattern?: HelperPattern; // If generated, create this helper pattern
  warnings: string[];
  success: boolean;
  patternOrderSlotsUsed: number; // Track efficiency
}

/**
 * Core command generator class
 */
export class BDCommandGenerator {
  /**
   * Generate reverse visual animation - OPTIMIZED VERSION
   * Creates ONE helper pattern with notes at reversed positions
   * Uses D commands to jump through them in forward timing order
   * Only uses 1 pattern order slot!
   */
  static generateReverseVisual(
    notes: NoteData[],
    patternIndex: number,
    patternLength: number
  ): GenerationResult {
    const warnings: string[] = [];

    if (notes.length === 0) {
      return {
        commands: [],
        patternOrderEntries: [],
        warnings: ['No notes to reverse'],
        success: false,
        patternOrderSlotsUsed: 0,
      };
    }

    // Sort notes by original row (ascending timing)
    const sorted = [...notes].sort((a, b) => a.originalRow - b.originalRow);

    // Calculate reversed visual positions
    const spacing = Math.floor(patternLength / (notes.length + 1));
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];

    sorted.forEach((note, i) => {
      const visualRow = patternLength - spacing * (i + 1);
      
      // Place note at reversed visual position
      helperNotes.push({
        row: visualRow,
        channel: note.originalChannel,
        cell: { ...note.cell },
      });

      // Add D command to jump to NEXT note's visual row (forward timing order)
      if (i < sorted.length - 1) {
        const nextVisualRow = patternLength - spacing * (i + 2);
        // D command uses BCD encoding: 0xXY = X*10 + Y
        const bcdRow = Math.floor(nextVisualRow / 10) * 16 + (nextVisualRow % 10);
        
        commands.push({
          row: visualRow,
          channel: note.originalChannel,
          effTyp: 0xD,
          eff: bcdRow,
        });
      } else {
        // Last note: break to next pattern (D00)
        commands.push({
          row: visualRow,
          channel: note.originalChannel,
          effTyp: 0xD,
          eff: 0x00,
        });
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }], // Just 1 entry!
      helperPattern: {
        notes: helperNotes,
        commands,
        length: patternLength,
      },
      warnings,
      success: true,
      patternOrderSlotsUsed: 1, // Efficient!
    };
  }

  /**
   * Generate polyrhythm using E6x loop commands
   * Each channel loops with different repeat count
   * Uses 0 pattern order slots (E6x loops are in-place)
   */
  static generatePolyrhythm(
    channels: number[],
    loopLengths: number[], // Repeat counts for each channel (1-15)
    loopStartRow: number,
    loopEndRow: number
  ): GenerationResult {
    const warnings: string[] = [];
    const commands: CellCommand[] = [];

    if (channels.length !== loopLengths.length) {
      return {
        commands: [],
        patternOrderEntries: [],
        warnings: ['Channel count must match loop length count'],
        success: false,
        patternOrderSlotsUsed: 0,
      };
    }

    // Validate loop counts (E6x supports 1-15 repeats)
    for (let i = 0; i < loopLengths.length; i++) {
      if (loopLengths[i] < 1 || loopLengths[i] > 15) {
        warnings.push(`Channel ${channels[i]}: Loop count ${loopLengths[i]} out of range (1-15), clamping`);
        loopLengths[i] = Math.max(1, Math.min(15, loopLengths[i]));
      }
    }

    // Generate E60 (loop start) and E6x (loop end) for each channel
    channels.forEach((ch, i) => {
      // E60 at loop start (sets loop point)
      commands.push({
        row: loopStartRow,
        channel: ch,
        effTyp: 0xE,
        eff: 0x60, // E6x where x=0 (set loop start)
      });

      // E6x at loop end (loop back x times)
      commands.push({
        row: loopEndRow,
        channel: ch,
        effTyp: 0xE,
        eff: 0x60 | loopLengths[i], // E6x where x=repeat count
      });
    });

    return {
      commands,
      patternOrderEntries: [],
      warnings,
      success: true,
      patternOrderSlotsUsed: 0, // E6x loops don't use pattern order!
    };
  }

  /**
   * Check if a cell can accept a command (has empty effect column)
   */
  static canInsertCommand(cell: TrackerCell): { canInsert: boolean; useSecondColumn: boolean } {
    if (cell.effTyp === 0) {
      return { canInsert: true, useSecondColumn: false };
    } else if (cell.effTyp2 === 0) {
      return { canInsert: true, useSecondColumn: true };
    }
    return { canInsert: false, useSecondColumn: false };
  }

  /**
   * Generate Fibonacci sequence pattern order
   * Jump distances follow Fibonacci numbers
   * OPTIMIZED VERSION: Uses helper pattern with D commands
   * Only uses 1 pattern order slot!
   */
  static generateFibonacciSequence(
    patternIndex: number,
    startRow: number,
    maxRows: number,
    notes: NoteData[]
  ): GenerationResult {
    const patternOrderEntries: PatternOrderEntry[] = [];
    const commands: CellCommand[] = [];
    const helperNotes: { row: number; channel: number; cell: TrackerCell }[] = [];
    const warnings: string[] = [];

    // Generate Fibonacci sequence
    const fib: number[] = [1, 1];
    while (fib[fib.length - 1] + fib[fib.length - 2] < maxRows) {
      fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
    }

    // Calculate Fibonacci positions
    const fibRows: number[] = [];
    let currentRow = startRow;
    for (const interval of fib) {
      currentRow += interval;
      if (currentRow >= maxRows) break;
      fibRows.push(currentRow);
    }

    if (fibRows.length === 0) {
      warnings.push('Pattern too short for Fibonacci sequence');
      return {
        commands: [],
        patternOrderEntries: [],
        warnings,
        success: false,
        patternOrderSlotsUsed: 0,
      };
    }

    // OPTIMIZED: Create helper pattern with notes at Fibonacci positions
    // Use D commands to jump between positions
    notes.forEach((note) => {
      fibRows.forEach((row, i) => {
        helperNotes.push({
          row,
          channel: note.channel,
          cell: note.cell,
        });

        // D command jumps to next Fibonacci position
        if (i < fibRows.length - 1) {
          const nextRow = fibRows[i + 1];
          const bcdRow = Math.floor(nextRow / 10) * 16 + (nextRow % 10);
          commands.push({
            row,
            channel: note.channel,
            effTyp: 0x0D,
            eff: bcdRow,
          });
        } else {
          // Last position: break to next pattern
          commands.push({
            row,
            channel: note.channel,
            effTyp: 0x0D,
            eff: 0x00,
          });
        }
      });
    });

    // Only 1 pattern order entry (the helper pattern)
    patternOrderEntries.push({ patternIndex });

    return {
      commands,
      patternOrderEntries,
      warnings,
      success: true,
      helperPattern: {
        notes: helperNotes,
        commands,
        length: maxRows,
      },
      patternOrderSlotsUsed: 1, // Efficient!
    };
  }

  /**
   * Generate Euclidean rhythm pattern order
   * Distributes N pulses across K steps
   * OPTIMIZED VERSION: Uses helper pattern with D commands
   * Only uses 1 pattern order slot!
   */
  static generateEuclideanPattern(
    patternIndex: number,
    pulses: number,
    steps: number,
    startRow: number,
    stepSize: number,
    notes: NoteData[]
  ): GenerationResult {
    const patternOrderEntries: PatternOrderEntry[] = [];
    const commands: CellCommand[] = [];
    const helperNotes: { row: number; channel: number; cell: TrackerCell }[] = [];
    const warnings: string[] = [];

    if (pulses > steps) {
      warnings.push('Pulses cannot exceed steps, clamping');
      pulses = steps;
    }

    // Euclidean algorithm (Bjorklund's algorithm)
    const counts: number[] = [];
    const remainders: number[] = [];

    let divisor = steps - pulses;
    remainders[0] = pulses;

    let level = 0;
    while (remainders[level] > 1) {
      counts[level] = Math.floor(divisor / remainders[level]);
      remainders[level + 1] = divisor % remainders[level];
      divisor = remainders[level];
      level++;
    }
    counts[level] = divisor;

    // Build the pattern
    const buildPattern = (level: number): boolean[] => {
      if (level === -1) return [false];
      if (level === -2) return [true];

      const pattern: boolean[] = [];
      for (let i = 0; i < counts[level]; i++) {
        pattern.push(...buildPattern(level - 1));
      }
      if (remainders[level] !== 0) {
        pattern.push(...buildPattern(level - 2));
      }
      return pattern;
    };

    const euclidean = buildPattern(level);
    
    // OPTIMIZED: Create helper pattern with notes only at pulse positions
    // Use D commands to jump between pulses (skip non-pulse steps)
    const pulseRows: number[] = [];
    euclidean.forEach((isPulse, i) => {
      if (isPulse) {
        pulseRows.push(startRow + i * stepSize);
      }
    });

    if (pulseRows.length === 0) {
      warnings.push('No pulses generated');
      return {
        commands: [],
        patternOrderEntries: [],
        warnings,
        success: false,
        patternOrderSlotsUsed: 0,
      };
    }

    notes.forEach((note) => {
      pulseRows.forEach((row, i) => {
        helperNotes.push({
          row,
          channel: note.channel,
          cell: note.cell,
        });

        // D command jumps to next pulse position
        if (i < pulseRows.length - 1) {
          const nextRow = pulseRows[i + 1];
          const bcdRow = Math.floor(nextRow / 10) * 16 + (nextRow % 10);
          commands.push({
            row,
            channel: note.channel,
            effTyp: 0x0D,
            eff: bcdRow,
          });
        } else {
          // Last pulse: break to next pattern
          commands.push({
            row,
            channel: note.channel,
            effTyp: 0x0D,
            eff: 0x00,
          });
        }
      });
    });

    // Only 1 pattern order entry (the helper pattern)
    patternOrderEntries.push({ patternIndex });

    return {
      commands,
      patternOrderEntries,
      warnings,
      success: true,
      helperPattern: {
        notes: helperNotes,
        commands,
        length: startRow + steps * stepSize,
      },
      patternOrderSlotsUsed: 1, // Efficient!
    };
  }

  /**
   * Generate Ping-Pong animation
   * Plays selection forward then backward using D commands
   */
  static generatePingPong(
    notes: NoteData[],
    patternIndex: number,
    _patternLength: number
  ): GenerationResult {
    if (notes.length < 2) {
      return {
        commands: [],
        patternOrderEntries: [],
        warnings: ['Need at least 2 notes for Ping-Pong'],
        success: false,
        patternOrderSlotsUsed: 0,
      };
    }

    const sorted = [...notes].sort((a, b) => a.originalRow - b.originalRow);
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];

    // Forward pass
    sorted.forEach((note, i) => {
      helperNotes.push({ row: i, channel: note.channel, cell: note.cell });
      const nextRow = i + 1;
      const bcdRow = Math.floor(nextRow / 10) * 16 + (nextRow % 10);
      commands.push({ row: i, channel: note.channel, effTyp: 0xD, eff: bcdRow });
    });

    // Backward pass (skip first and last to avoid double triggers)
    let currentRow = sorted.length;
    for (let i = sorted.length - 2; i > 0; i--) {
      const note = sorted[i];
      helperNotes.push({ row: currentRow, channel: note.channel, cell: note.cell });
      const nextRow = currentRow + 1;
      const bcdRow = Math.floor(nextRow / 10) * 16 + (nextRow % 10);
      commands.push({ row: currentRow, channel: note.channel, effTyp: 0xD, eff: bcdRow });
      currentRow++;
    }

    // Last jump: break to next pattern
    commands[commands.length - 1].eff = 0x00;

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: {
        notes: helperNotes,
        commands,
        length: currentRow,
      },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }

  /**
   * Generate Random Glitch animation
   * Randomizes note order and timing
   */
  static generateGlitch(
    notes: NoteData[],
    patternIndex: number,
    _patternLength: number
  ): GenerationResult {
    if (notes.length === 0) return { commands: [], patternOrderEntries: [], warnings: ['No notes'], success: false, patternOrderSlotsUsed: 0 };

    const shuffled = [...notes].sort(() => Math.random() - 0.5);
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];

    shuffled.forEach((note, i) => {
      // Add random spacing (1-4 rows)
      const row = i * 4; 
      helperNotes.push({ row, channel: note.channel, cell: note.cell });
      
      if (i < shuffled.length - 1) {
        const nextRow = (i + 1) * 4;
        const bcdRow = Math.floor(nextRow / 10) * 16 + (nextRow % 10);
        commands.push({ row, channel: note.channel, effTyp: 0xD, eff: bcdRow });
      } else {
        commands.push({ row, channel: note.channel, effTyp: 0xD, eff: 0x00 });
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: {
        notes: helperNotes,
        commands,
        length: shuffled.length * 4,
      },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }

  /**
   * Generate Strobe Visual
   * Rapidly alternates between notes and empty rows
   */
  static generateStrobe(
    notes: NoteData[],
    patternIndex: number,
    _patternLength: number
  ): GenerationResult {
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];

    notes.forEach((note, i) => {
      const row = i * 2;
      helperNotes.push({ row, channel: note.channel, cell: note.cell });
      
      // Jump to next even row
      if (i < notes.length - 1) {
        const nextRow = (i + 1) * 2;
        const bcdRow = Math.floor(nextRow / 10) * 16 + (nextRow % 10);
        commands.push({ row, channel: note.channel, effTyp: 0xD, eff: bcdRow });
      } else {
        commands.push({ row, channel: note.channel, effTyp: 0xD, eff: 0x00 });
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: {
        notes: helperNotes,
        commands,
        length: notes.length * 2,
      },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }

  /**
   * Generate Visual Echo
   * Duplicates notes with fading volume using pattern order jumps
   */
  static generateVisualEcho(
    notes: NoteData[],
    patternIndex: number,
    _patternLength: number,
    echoCount: number = 3
  ): GenerationResult {
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];

    notes.forEach((note, noteIdx) => {
      for (let e = 0; noteIdx * (echoCount + 1) + e < 256 && e <= echoCount; e++) {
        const row = noteIdx * (echoCount + 1) + e;
        
        // Fade volume for echoes
        const fadedCell = { ...note.cell };
        const originalVol = fadedCell.volume >= 0x10 && fadedCell.volume <= 0x50 ? fadedCell.volume - 0x10 : 64;
        const newVol = Math.floor(originalVol * Math.pow(0.5, e));
        fadedCell.volume = 0x10 + newVol;

        helperNotes.push({ row, channel: note.channel, cell: fadedCell });
        
        // Jump to next echo or next note
        const isLastEcho = e === echoCount || noteIdx * (echoCount + 1) + e === 255;
        const isLastNote = noteIdx === notes.length - 1;

        if (!isLastEcho || !isLastNote) {
          const nextRow = row + 1;
          const bcdRow = Math.floor(nextRow / 10) * 16 + (nextRow % 10);
          commands.push({ row, channel: note.channel, effTyp: 0xD, eff: bcdRow });
        } else {
          commands.push({ row, channel: note.channel, effTyp: 0xD, eff: 0x00 });
        }
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: {
        notes: helperNotes,
        commands,
        length: Math.min(256, notes.length * (echoCount + 1)),
      },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }

  /**
   * Generate Converge animation
   * Notes move from edges toward the center
   */
  static generateConverge(
    notes: NoteData[],
    patternIndex: number,
    patternLength: number
  ): GenerationResult {
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];
    const sorted = [...notes].sort((a, b) => a.originalRow - b.originalRow);
    
    sorted.forEach((note, i) => {
      // Logic: 0, N, 1, N-1, 2, N-2...
      const visualRow = i % 2 === 0 ? i : (patternLength - 1 - i);
      helperNotes.push({ row: visualRow, channel: note.channel, cell: note.cell });
      
      if (i < sorted.length - 1) {
        const nextVisualRow = (i + 1) % 2 === 0 ? (i + 1) : (patternLength - 1 - (i + 1));
        const bcdRow = Math.floor(nextVisualRow / 10) * 16 + (nextVisualRow % 10);
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: bcdRow });
      } else {
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: 0x00 });
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: { notes: helperNotes, commands, length: patternLength },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }

  /**
   * Generate Spiral animation
   * Expands outward from center
   */
  static generateSpiral(
    notes: NoteData[],
    patternIndex: number,
    patternLength: number
  ): GenerationResult {
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];
    const sorted = [...notes].sort((a, b) => a.originalRow - b.originalRow);
    const mid = Math.floor(patternLength / 2);
    
    sorted.forEach((note, i) => {
      const offset = Math.floor((i + 1) / 2) * (i % 2 === 0 ? 1 : -1);
      const visualRow = Math.max(0, Math.min(patternLength - 1, mid + offset));
      helperNotes.push({ row: visualRow, channel: note.channel, cell: note.cell });
      
      if (i < sorted.length - 1) {
        const nextOffset = Math.floor((i + 2) / 2) * ((i + 1) % 2 === 0 ? 1 : -1);
        const nextVisualRow = Math.max(0, Math.min(patternLength - 1, mid + nextOffset));
        const bcdRow = Math.floor(nextVisualRow / 10) * 16 + (nextVisualRow % 10);
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: bcdRow });
      } else {
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: 0x00 });
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: { notes: helperNotes, commands, length: patternLength },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }

  /**
   * Generate Bounce animation
   * Notes bounce off the ends
   */
  static generateBounce(
    notes: NoteData[],
    patternIndex: number,
    patternLength: number
  ): GenerationResult {
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];
    
    notes.forEach((note, i) => {
      const visualRow = Math.abs((i % (patternLength * 2)) - patternLength);
      helperNotes.push({ row: visualRow, channel: note.channel, cell: note.cell });
      
      if (i < notes.length - 1) {
        const nextVisualRow = Math.abs(((i + 1) % (patternLength * 2)) - patternLength);
        const bcdRow = Math.floor(nextVisualRow / 10) * 16 + (nextVisualRow % 10);
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: bcdRow });
      } else {
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: 0x00 });
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: { notes: helperNotes, commands, length: patternLength },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }

  /**
   * Generate Chaos animation
   * True random distribution
   */
  static generateChaos(
    notes: NoteData[],
    patternIndex: number,
    patternLength: number
  ): GenerationResult {
    const helperNotes: Array<{ row: number; channel: number; cell: TrackerCell }> = [];
    const commands: CellCommand[] = [];
    
    notes.forEach((note, i) => {
      const visualRow = Math.floor(Math.random() * patternLength);
      helperNotes.push({ row: visualRow, channel: note.channel, cell: note.cell });
      
      if (i < notes.length - 1) {
        const nextVisualRow = Math.floor(Math.random() * patternLength);
        const bcdRow = Math.floor(nextVisualRow / 10) * 16 + (nextVisualRow % 10);
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: bcdRow });
      } else {
        commands.push({ row: visualRow, channel: note.channel, effTyp: 0xD, eff: 0x00 });
      }
    });

    return {
      commands,
      patternOrderEntries: [{ patternIndex }],
      helperPattern: { notes: helperNotes, commands, length: patternLength },
      warnings: [],
      success: true,
      patternOrderSlotsUsed: 1,
    };
  }
}

/**
 * Helper class for inserting commands into patterns
 */
export class CommandInserter {
  /**
   * Insert a command into a cell, using second column if first is occupied
   */
  static insertCommand(
    cell: TrackerCell,
    effTyp: number,
    eff: number
  ): { success: boolean; error?: string } {
    const { canInsert, useSecondColumn } = BDCommandGenerator.canInsertCommand(cell);

    if (!canInsert) {
      return {
        success: false,
        error: 'Both effect columns occupied',
      };
    }

    if (useSecondColumn) {
      cell.effTyp2 = effTyp;
      cell.eff2 = eff;
    } else {
      cell.effTyp = effTyp;
      cell.eff = eff;
    }

    return { success: true };
  }

  /**
   * Validate that a command sequence won't create infinite loops
   */
  static validateNoInfiniteLoops(_commands: CellCommand[]): { valid: boolean; error?: string } {
    // Check for suspicious patterns:
    // 1. B command jumping to same position
    // 2. D command breaking to same row in same pattern
    
    // For now, just allow all commands - full loop detection would require pattern order analysis
    // TODO: Implement more sophisticated loop detection
    
    return { valid: true };
  }
}

/**
 * Pattern order manipulation helpers
 */
export class PatternOrderHelper {
  /**
   * Calculate pattern order entries needed for reverse visual animation
   */
  static createReverseOrderSequence(
    patternIndex: number,
    rows: number[]
  ): PatternOrderEntry[] {
    // Sort rows descending for reverse visual
    const sorted = [...rows].sort((a, b) => b - a);
    
    return sorted.map(row => ({
      patternIndex,
      startRow: row,
    }));
  }

  /**
   * Calculate pattern order entries for ping-pong effect
   */
  static createPingPongSequence(
    patternIndex: number,
    rows: number[],
    cycles: number
  ): PatternOrderEntry[] {
    const entries: PatternOrderEntry[] = [];
    const sorted = [...rows].sort((a, b) => a - b);

    for (let i = 0; i < cycles; i++) {
      // Forward pass
      sorted.forEach(row => {
        entries.push({ patternIndex, startRow: row });
      });

      // Backward pass (skip first and last to avoid repetition)
      for (let j = sorted.length - 2; j > 0; j--) {
        entries.push({ patternIndex, startRow: sorted[j] });
      }
    }

    return entries;
  }

  /**
   * Estimate pattern order slots needed for an animation
   */
  static estimateOrderSlots(entries: PatternOrderEntry[]): number {
    return entries.length;
  }

  /**
   * Check if enough pattern order slots are available
   */
  static canFitInPatternOrder(
    currentOrderLength: number,
    requiredSlots: number,
    maxOrderLength: number = 256
  ): { fits: boolean; slotsNeeded: number; slotsAvailable: number } {
    const available = maxOrderLength - currentOrderLength;
    return {
      fits: requiredSlots <= available,
      slotsNeeded: requiredSlots,
      slotsAvailable: available,
    };
  }
}
