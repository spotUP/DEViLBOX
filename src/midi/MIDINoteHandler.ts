/**
 * MIDINoteHandler - Handle incoming MIDI notes for live playing
 *
 * Converts MIDI note on/off messages to tracker synth triggers
 */

import { getMIDIManager } from './MIDIManager';
import { midiToTrackerNote } from './types';
import type { MIDIMessage } from './types';

// Velocity threshold for accent (0-127)
const ACCENT_VELOCITY_THRESHOLD = 100;

export interface MIDINoteHandlerOptions {
  // Callback when note is triggered
  onNoteOn?: (note: string, velocity: number, accent: boolean, midiNote: number) => void;
  // Callback when note is released
  onNoteOff?: (note: string, midiNote: number) => void;
  // Optional channel filter (1-16, or undefined for all channels)
  channel?: number;
  // Velocity threshold for accent (default 100)
  accentThreshold?: number;
}

export class MIDINoteHandler {
  private options: Required<MIDINoteHandlerOptions>;
  private activeNotes: Map<number, string> = new Map();
  private messageHandler: ((message: MIDIMessage, deviceId: string) => void) | null = null;

  constructor(options: MIDINoteHandlerOptions) {
    this.options = {
      onNoteOn: options.onNoteOn || (() => {}),
      onNoteOff: options.onNoteOff || (() => {}),
      channel: options.channel ?? -1, // -1 means all channels
      accentThreshold: options.accentThreshold ?? ACCENT_VELOCITY_THRESHOLD,
    };
  }

  /**
   * Start listening for MIDI notes
   */
  start(): void {
    if (this.messageHandler) return; // Already started

    this.messageHandler = (message: MIDIMessage) => {
      // Check channel filter
      if (this.options.channel !== -1 && message.channel !== this.options.channel - 1) {
        return;
      }

      if (message.type === 'noteOn' && message.note !== undefined && message.velocity !== undefined) {
        this.handleNoteOn(message.note, message.velocity);
      } else if (message.type === 'noteOff' && message.note !== undefined) {
        this.handleNoteOff(message.note);
      }
    };

    getMIDIManager().addMessageHandler(this.messageHandler);
  }

  /**
   * Stop listening for MIDI notes
   */
  stop(): void {
    if (this.messageHandler) {
      getMIDIManager().removeMessageHandler(this.messageHandler);
      this.messageHandler = null;
    }

    // Release all active notes
    this.releaseAllNotes();
  }

  /**
   * Handle MIDI note on
   */
  private handleNoteOn(midiNote: number, velocity: number): void {
    const trackerNote = midiToTrackerNote(midiNote);
    const accent = velocity >= this.options.accentThreshold;

    // Track active note
    this.activeNotes.set(midiNote, trackerNote);

    // Notify listener
    this.options.onNoteOn(trackerNote, velocity, accent, midiNote);
  }

  /**
   * Handle MIDI note off
   */
  private handleNoteOff(midiNote: number): void {
    const trackerNote = this.activeNotes.get(midiNote);
    if (!trackerNote) return;

    // Remove from active notes
    this.activeNotes.delete(midiNote);

    // Notify listener
    this.options.onNoteOff(trackerNote, midiNote);
  }

  /**
   * Release all active notes
   */
  releaseAllNotes(): void {
    this.activeNotes.forEach((trackerNote, midiNote) => {
      this.options.onNoteOff(trackerNote, midiNote);
    });
    this.activeNotes.clear();
  }

  /**
   * Get currently active notes
   */
  getActiveNotes(): Map<number, string> {
    return new Map(this.activeNotes);
  }

  /**
   * Update options
   */
  setOptions(options: Partial<MIDINoteHandlerOptions>): void {
    if (options.onNoteOn !== undefined) this.options.onNoteOn = options.onNoteOn;
    if (options.onNoteOff !== undefined) this.options.onNoteOff = options.onNoteOff;
    if (options.channel !== undefined) this.options.channel = options.channel;
    if (options.accentThreshold !== undefined) this.options.accentThreshold = options.accentThreshold;
  }

  /**
   * Set accent velocity threshold
   */
  setAccentThreshold(threshold: number): void {
    this.options.accentThreshold = Math.max(1, Math.min(127, threshold));
  }

  /**
   * Get accent velocity threshold
   */
  getAccentThreshold(): number {
    return this.options.accentThreshold;
  }
}

/**
 * Create a note handler connected to the tracker's ToneEngine
 */
export function createTrackerNoteHandler(
  triggerNote: (note: string, velocity: number, accent: boolean) => void,
  releaseNote: (note: string) => void
): MIDINoteHandler {
  return new MIDINoteHandler({
    onNoteOn: (note, velocity, accent) => {
      triggerNote(note, velocity, accent);
    },
    onNoteOff: (note) => {
      releaseNote(note);
    },
  });
}
