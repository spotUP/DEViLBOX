/**
 * ButtonMapManager - Map MIDI notes/buttons to editor functions
 *
 * Maps incoming MIDI note-on messages to transport controls, pattern
 * navigation, and other editor functions. Works with any MIDI controller.
 */

import { getMIDIManager } from './MIDIManager';
import type { MIDIMessage } from './types';

/**
 * Available editor actions that can be triggered by buttons
 */
export type EditorAction =
  | 'transport.play'
  | 'transport.stop'
  | 'transport.playFromStart'
  | 'transport.toggleRecord'
  | 'pattern.next'
  | 'pattern.previous'
  | 'pattern.first'
  | 'pattern.last'
  | 'octave.up'
  | 'octave.down'
  | 'channel.next'
  | 'channel.previous'
  | 'edit.undo'
  | 'edit.redo'
  | 'view.togglePianoRoll'
  | 'view.toggleGrid'
  | 'automation.toggleRecord';

/**
 * Button mapping configuration
 */
export interface ButtonMapping {
  id: string;
  midiNote?: number;           // MIDI note number (0-127) for note messages
  ccNumber?: number;           // CC number for CC messages (triggers on value > 63)
  midiChannel?: number;        // Optional channel filter (0-15)
  action: EditorAction;
  displayName: string;
}

/**
 * Action callbacks registry
 */
type ActionCallback = () => void;

class ButtonMapManager {
  private static instance: ButtonMapManager | null = null;

  // Button mappings
  private mappings: Map<string, ButtonMapping> = new Map();

  // Action handlers
  private actionHandlers: Map<EditorAction, ActionCallback> = new Map();

  // Learn mode state
  private isLearning: boolean = false;
  private learningAction: EditorAction | null = null;
  private learnCallback: ((midiNote: number, channel: number) => void) | null = null;

  // Change listeners
  private mappingListeners: Set<() => void> = new Set();

  // Handler registration status
  private handlerRegistered: boolean = false;

  private constructor() {}

  static getInstance(): ButtonMapManager {
    if (!ButtonMapManager.instance) {
      ButtonMapManager.instance = new ButtonMapManager();
    }
    return ButtonMapManager.instance;
  }

  /**
   * Initialize and register with MIDIManager
   */
  init(): void {
    if (this.handlerRegistered) return;

    const midiManager = getMIDIManager();
    midiManager.addMessageHandler(this.handleMIDIMessage);
    this.handlerRegistered = true;

    // Load saved mappings
    this.loadMappings();

  }

  /**
   * Handle incoming MIDI messages
   */
  private handleMIDIMessage = (message: MIDIMessage): void => {
    // Handle learn mode
    if (this.isLearning && this.learnCallback) {
      if (message.type === 'noteOn' && message.note !== undefined && message.velocity !== undefined && message.velocity > 0) {
        this.learnCallback(message.note, message.channel);
        return;
      }
      // Also allow learning from CC (button-style CC)
      if (message.type === 'cc' && message.cc !== undefined && message.value !== undefined && message.value > 63) {
        // Use negative numbers to indicate CC (distinguish from notes)
        this.learnCallback(-message.cc - 1, message.channel);
        return;
      }
      return;
    }

    // Handle note-on for button triggers
    if (message.type === 'noteOn' && message.note !== undefined && message.velocity !== undefined && message.velocity > 0) {
      this.triggerButtonAction(message.note, undefined, message.channel);
      return;
    }

    // Handle CC for button triggers (trigger on value > 63)
    if (message.type === 'cc' && message.cc !== undefined && message.value !== undefined && message.value > 63) {
      this.triggerButtonAction(undefined, message.cc, message.channel);
    }
  };

  /**
   * Find and trigger action for a button press
   */
  private triggerButtonAction(midiNote?: number, ccNumber?: number, channel?: number): void {
    for (const mapping of this.mappings.values()) {
      // Match by note or CC
      const noteMatch = midiNote !== undefined && mapping.midiNote === midiNote;
      const ccMatch = ccNumber !== undefined && mapping.ccNumber === ccNumber;

      if (!noteMatch && !ccMatch) continue;

      // Check channel if specified
      if (mapping.midiChannel !== undefined && channel !== undefined && mapping.midiChannel !== channel) {
        continue;
      }

      // Found a match - trigger the action
      const handler = this.actionHandlers.get(mapping.action);
      if (handler) {
        handler();
      }
      return;
    }
  }

  // ==========================================================================
  // Learn Mode
  // ==========================================================================

  /**
   * Start learning mode for an action
   */
  startLearn(action: EditorAction): Promise<{ type: 'note' | 'cc'; number: number; channel: number } | null> {
    return new Promise((resolve) => {
      this.isLearning = true;
      this.learningAction = action;
      this.learnCallback = (numberOrNegCC: number, channel: number) => {
        this.isLearning = false;
        this.learningAction = null;
        this.learnCallback = null;

        if (numberOrNegCC < 0) {
          // CC (encoded as negative)
          resolve({ type: 'cc', number: -numberOrNegCC - 1, channel });
        } else {
          // Note
          resolve({ type: 'note', number: numberOrNegCC, channel });
        }
      };

    });
  }

  /**
   * Cancel learn mode
   */
  cancelLearn(): void {
    this.isLearning = false;
    this.learningAction = null;
    this.learnCallback = null;
  }

  /**
   * Check if in learning mode
   */
  isInLearnMode(): boolean {
    return this.isLearning;
  }

  /**
   * Get the action being learned
   */
  getLearningAction(): EditorAction | null {
    return this.learningAction;
  }

  // ==========================================================================
  // Mapping Management
  // ==========================================================================

  /**
   * Set a button mapping
   */
  setMapping(mapping: ButtonMapping): void {
    // Remove any existing mapping for this action
    for (const [id, existing] of this.mappings.entries()) {
      if (existing.action === mapping.action) {
        this.mappings.delete(id);
      }
    }

    this.mappings.set(mapping.id, mapping);
    this.saveMappings();
    this.notifyMappingChange();
  }

  /**
   * Remove a mapping by ID
   */
  removeMapping(id: string): void {
    if (this.mappings.has(id)) {
      this.mappings.delete(id);
      this.saveMappings();
      this.notifyMappingChange();
    }
  }

  /**
   * Get mapping for an action
   */
  getMappingForAction(action: EditorAction): ButtonMapping | undefined {
    for (const mapping of this.mappings.values()) {
      if (mapping.action === action) {
        return mapping;
      }
    }
    return undefined;
  }

  /**
   * Get all mappings
   */
  getAllMappings(): ButtonMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Clear all mappings
   */
  clearAllMappings(): void {
    this.mappings.clear();
    this.saveMappings();
    this.notifyMappingChange();
  }

  // ==========================================================================
  // Action Registration
  // ==========================================================================

  /**
   * Register a handler for an action
   */
  registerAction(action: EditorAction, handler: ActionCallback): () => void {
    this.actionHandlers.set(action, handler);
    return () => this.actionHandlers.delete(action);
  }

  /**
   * Unregister an action handler
   */
  unregisterAction(action: EditorAction): void {
    this.actionHandlers.delete(action);
  }

  // ==========================================================================
  // Change Listeners
  // ==========================================================================

  /**
   * Subscribe to mapping changes
   */
  onMappingChange(callback: () => void): () => void {
    this.mappingListeners.add(callback);
    return () => this.mappingListeners.delete(callback);
  }

  private notifyMappingChange(): void {
    this.mappingListeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[ButtonMapManager] Mapping change callback error:', error);
      }
    });
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private saveMappings(): void {
    try {
      const data = JSON.stringify(Array.from(this.mappings.values()));
      localStorage.setItem('button-mappings-v1', data);
    } catch (error) {
      console.error('[ButtonMapManager] Failed to save mappings:', error);
    }
  }

  private loadMappings(): void {
    try {
      const data = localStorage.getItem('button-mappings-v1');
      if (data) {
        const mappings: ButtonMapping[] = JSON.parse(data);
        this.mappings.clear();
        mappings.forEach((mapping) => {
          this.mappings.set(mapping.id, mapping);
        });
      }
    } catch (error) {
      console.error('[ButtonMapManager] Failed to load mappings:', error);
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.handlerRegistered) {
      const midiManager = getMIDIManager();
      midiManager.removeMessageHandler(this.handleMIDIMessage);
      this.handlerRegistered = false;
    }

    this.mappings.clear();
    this.actionHandlers.clear();
    this.mappingListeners.clear();
  }
}

// Export singleton getter
export function getButtonMapManager(): ButtonMapManager {
  return ButtonMapManager.getInstance();
}

export { ButtonMapManager };

/**
 * Human-readable action names
 */
export const ACTION_DISPLAY_NAMES: Record<EditorAction, string> = {
  'transport.play': 'Play/Pause',
  'transport.stop': 'Stop',
  'transport.playFromStart': 'Play from Start',
  'transport.toggleRecord': 'Toggle Record',
  'pattern.next': 'Next Pattern',
  'pattern.previous': 'Previous Pattern',
  'pattern.first': 'First Pattern',
  'pattern.last': 'Last Pattern',
  'octave.up': 'Octave Up',
  'octave.down': 'Octave Down',
  'channel.next': 'Next Channel',
  'channel.previous': 'Previous Channel',
  'edit.undo': 'Undo',
  'edit.redo': 'Redo',
  'view.togglePianoRoll': 'Toggle Piano Roll',
  'view.toggleGrid': 'Toggle Grid View',
  'automation.toggleRecord': 'Toggle Automation Record',
};

/**
 * All available actions grouped by category
 */
export const ACTIONS_BY_CATEGORY: Record<string, EditorAction[]> = {
  Transport: ['transport.play', 'transport.stop', 'transport.playFromStart', 'transport.toggleRecord'],
  Pattern: ['pattern.next', 'pattern.previous', 'pattern.first', 'pattern.last'],
  Navigation: ['octave.up', 'octave.down', 'channel.next', 'channel.previous'],
  Edit: ['edit.undo', 'edit.redo'],
  View: ['view.togglePianoRoll', 'view.toggleGrid'],
  Automation: ['automation.toggleRecord'],
};
