/**
 * ArpeggioEngine - Advanced arpeggiator for ChipSynth
 *
 * Features:
 * - Sample-accurate timing using Tone.Loop
 * - Multiple playback modes: loop, ping-pong, one-shot, random
 * - Per-step volume, gate length, and effects
 * - Swing/shuffle timing
 * - Speed in Hz, ticks, or note divisions
 * - Real-time parameter updates
 */

import * as Tone from 'tone';
import type { ArpeggioConfig, ArpeggioStep } from '@typedefs/instrument';

export interface ArpeggioEngineOptions {
  config: ArpeggioConfig;
  onStep?: (stepIndex: number, step: ArpeggioStep, noteOffset: number) => void;
  onNoteOn?: (note: string, velocity: number, duration: number) => void;
  onNoteOff?: (note: string) => void;
}

export class ArpeggioEngine {
  private config: ArpeggioConfig;
  private loop: Tone.Loop | null = null;
  private currentStepIndex: number = 0;
  private pingPongDirection: 1 | -1 = 1;
  private baseNote: string = 'C4';
  private baseVelocity: number = 1;
  private isPlaying: boolean = false;
  private heldNotes: Set<string> = new Set();

  // Callbacks
  private onStep?: (stepIndex: number, step: ArpeggioStep, noteOffset: number) => void;
  private onNoteOn?: (note: string, velocity: number, duration: number) => void;
  private onNoteOff?: (note: string) => void;

  // Track which note is currently playing for proper release
  private currentPlayingNote: string | null = null;

  constructor(options: ArpeggioEngineOptions) {
    this.config = { ...options.config };
    this.onStep = options.onStep;
    this.onNoteOn = options.onNoteOn;
    this.onNoteOff = options.onNoteOff;
  }

  /**
   * Get the normalized steps (handle legacy pattern format)
   */
  private getSteps(): ArpeggioStep[] {
    if (this.config.steps && this.config.steps.length > 0) {
      return this.config.steps;
    }
    // Legacy: convert simple pattern array to ArpeggioStep[]
    if (this.config.pattern && this.config.pattern.length > 0) {
      return this.config.pattern.map(offset => ({ noteOffset: offset }));
    }
    return [{ noteOffset: 0 }];
  }

  /**
   * Calculate the interval in seconds based on speed and unit
   */
  private getInterval(): number | string {
    const { speed, speedUnit } = this.config;
    const bpm = Tone.getTransport().bpm.value;

    switch (speedUnit) {
      case 'hz':
        // Direct Hz: convert to seconds
        return 1 / Math.max(1, Math.min(60, speed));

      case 'ticks': {
        // Ticks per step: convert to note value
        // 48 ticks = quarter note in standard resolution
        const ticksPerBeat = 48;
        const beats = speed / ticksPerBeat;
        return (60 / bpm) * beats;
      }

      case 'division': {
        // Note division: 1 = whole, 2 = half, 4 = quarter, 8 = eighth, etc.
        const divisionMap: Record<number, string> = {
          1: '1n',
          2: '2n',
          4: '4n',
          8: '8n',
          16: '16n',
          32: '32n',
          64: '64n',
        };
        // Find closest division or use numeric value
        return divisionMap[speed] || `${speed}n`;
      }

      default:
        return 1 / 15; // Default 15 Hz
    }
  }

  /**
   * Calculate swing-adjusted timing for a step
   * @public Available for external swing calculation
   */
  public getSwingAdjustedTime(baseTime: number, stepIndex: number): number {
    const swing = (this.config.swing ?? 0) / 100;
    if (swing === 0) return baseTime;

    // Apply swing to even-numbered steps (0, 2, 4...)
    // Odd steps stay on beat, even steps push late
    if (stepIndex % 2 === 0) {
      const interval = typeof this.getInterval() === 'number'
        ? this.getInterval() as number
        : 0.066; // ~15Hz default
      return baseTime + (interval * swing * 0.5);
    }
    return baseTime;
  }

  /**
   * Get the next step index based on playback mode
   */
  private getNextStepIndex(): number {
    const steps = this.getSteps();
    const numSteps = steps.length;

    switch (this.config.mode) {
      case 'loop':
        // Simple loop: 0,1,2,3,0,1,2,3...
        return (this.currentStepIndex + 1) % numSteps;

      case 'pingpong': {
        // Ping-pong: 0,1,2,3,2,1,0,1,2,3...
        let next = this.currentStepIndex + this.pingPongDirection;

        if (next >= numSteps) {
          this.pingPongDirection = -1;
          next = numSteps - 2;
        } else if (next < 0) {
          this.pingPongDirection = 1;
          next = 1;
        }

        // Handle edge case of 1-2 step patterns
        if (numSteps <= 2) {
          return (this.currentStepIndex + 1) % numSteps;
        }

        return Math.max(0, Math.min(numSteps - 1, next));
      }

      case 'oneshot': {
        // One-shot: 0,1,2,3 then stop
        const nextOneShot = this.currentStepIndex + 1;
        if (nextOneShot >= numSteps) {
          // Mark as stopped but return last index
          this.isPlaying = false;
          return numSteps - 1;
        }
        return nextOneShot;
      }

      case 'random':
        // Random: pick any step
        return Math.floor(Math.random() * numSteps);

      default:
        return (this.currentStepIndex + 1) % numSteps;
    }
  }

  /**
   * Convert MIDI note number to note name
   */
  private midiToNoteName(midi: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const noteName = noteNames[midi % 12];
    return `${noteName}${octave}`;
  }

  /**
   * Convert note name to MIDI number
   */
  private noteNameToMidi(note: string): number {
    const noteNames: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
      'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };

    // Parse note name and octave (e.g., "C#4" -> "C#" and "4")
    const match = note.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
    if (!match) return 60; // Default to C4

    const noteName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const octave = parseInt(match[2], 10);

    return (octave + 1) * 12 + (noteNames[noteName] ?? 0);
  }

  /**
   * Process a single arpeggio step
   */
  private processStep(): void {
    if (!this.isPlaying) return;

    const steps = this.getSteps();
    const step = steps[this.currentStepIndex];

    if (!step) return;

    // Handle skip effect
    if (step.effect === 'skip') {
      this.currentStepIndex = this.getNextStepIndex();
      return;
    }

    // Calculate the note to play
    const baseMidi = this.noteNameToMidi(this.baseNote);
    const targetMidi = baseMidi + step.noteOffset;
    const targetNote = this.midiToNoteName(targetMidi);

    // Calculate velocity with per-step volume
    const stepVolume = (step.volume ?? 100) / 100;
    const accentBoost = step.effect === 'accent' ? 1.2 : 1.0;
    const velocity = Math.min(1, this.baseVelocity * stepVolume * accentBoost);

    // Calculate gate length
    const gate = (step.gate ?? 100) / 100;
    const interval = typeof this.getInterval() === 'number'
      ? this.getInterval() as number
      : Tone.Time(this.getInterval()).toSeconds();
    const duration = interval * gate * 0.95; // 95% to avoid overlap

    // Release previous note if still playing
    if (this.currentPlayingNote && this.onNoteOff) {
      this.onNoteOff(this.currentPlayingNote);
    }

    // Trigger the note
    if (this.onNoteOn) {
      this.onNoteOn(targetNote, velocity, duration);
    }
    this.currentPlayingNote = targetNote;

    // Notify step callback
    if (this.onStep) {
      this.onStep(this.currentStepIndex, step, step.noteOffset);
    }

    // Advance to next step
    this.currentStepIndex = this.getNextStepIndex();
  }

  /**
   * Start the arpeggiator with a base note
   */
  public start(note: string, velocity: number = 1): void {
    if (this.isPlaying) {
      // If already playing, update base note (allows legato)
      this.baseNote = note;
      this.baseVelocity = velocity;
      this.heldNotes.add(note);
      return;
    }

    this.baseNote = note;
    this.baseVelocity = velocity;
    this.currentStepIndex = 0;
    this.pingPongDirection = 1;
    this.isPlaying = true;
    this.heldNotes.add(note);

    // Create and start the loop
    const interval = this.getInterval();

    this.loop = new Tone.Loop(() => {
      this.processStep();
    }, interval);

    this.loop.start(0);
  }

  /**
   * Stop the arpeggiator for a specific note
   */
  public stop(note?: string): void {
    if (note) {
      this.heldNotes.delete(note);

      // If there are still held notes, switch to one of them
      if (this.heldNotes.size > 0) {
        const remainingNote = Array.from(this.heldNotes)[this.heldNotes.size - 1];
        this.baseNote = remainingNote;
        return;
      }
    } else {
      this.heldNotes.clear();
    }

    // Release current note
    if (this.currentPlayingNote && this.onNoteOff) {
      this.onNoteOff(this.currentPlayingNote);
      this.currentPlayingNote = null;
    }

    // Stop the loop
    if (this.loop) {
      this.loop.stop();
      this.loop.dispose();
      this.loop = null;
    }

    this.isPlaying = false;
    this.currentStepIndex = 0;
    this.pingPongDirection = 1;
  }

  /**
   * Stop all notes immediately
   */
  public stopAll(): void {
    this.heldNotes.clear();
    this.stop();
  }

  /**
   * Update the arpeggio configuration in real-time
   */
  public updateConfig(config: Partial<ArpeggioConfig>): void {
    this.config = { ...this.config, ...config };

    // Update loop interval if speed changed
    if (this.loop && this.isPlaying) {
      const interval = this.getInterval();
      this.loop.interval = interval;
    }

    // Reset step index if mode changed to oneshot
    if (config.mode === 'oneshot') {
      this.currentStepIndex = 0;
    }
  }

  /**
   * Get the current step index for UI visualization
   */
  public getCurrentStep(): number {
    return this.currentStepIndex;
  }

  /**
   * Check if the arpeggiator is currently playing
   */
  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get the current configuration
   */
  public getConfig(): ArpeggioConfig {
    return { ...this.config };
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.stopAll();
    if (this.loop) {
      this.loop.dispose();
      this.loop = null;
    }
  }
}

/**
 * Helper function to convert simple pattern to ArpeggioStep array
 */
export function patternToSteps(pattern: number[]): ArpeggioStep[] {
  return pattern.map(offset => ({ noteOffset: offset }));
}

/**
 * Helper function to convert ArpeggioStep array to simple pattern
 */
export function stepsToPattern(steps: ArpeggioStep[]): number[] {
  return steps.map(step => step.noteOffset);
}
