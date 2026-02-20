/**
 * ButtonMapManager - Map MIDI notes/buttons to editor functions
 *
 * Maps incoming MIDI note-on messages to transport controls, pattern
 * navigation, and other editor functions. Works with any MIDI controller.
 */

import { getMIDIManager } from './MIDIManager';
import type { MIDIMessage } from './types';

/**
 * Available editor actions that can be triggered by buttons.
 * Includes legacy tracker actions, DJ transport, and a `cmd:` prefix
 * that bridges to any command in the global CommandRegistry.
 */
export type EditorAction =
  // Tracker transport
  | 'transport.play'
  | 'transport.stop'
  | 'transport.playFromStart'
  | 'transport.toggleRecord'
  // Pattern navigation
  | 'pattern.next'
  | 'pattern.previous'
  | 'pattern.first'
  | 'pattern.last'
  // Octave / channel
  | 'octave.up'
  | 'octave.down'
  | 'channel.next'
  | 'channel.previous'
  // Edit
  | 'edit.undo'
  | 'edit.redo'
  // View
  | 'view.togglePianoRoll'
  | 'view.toggleGrid'
  // Automation
  | 'automation.toggleRecord'
  // DJ transport
  | 'dj.deckA.play'
  | 'dj.deckA.pause'
  | 'dj.deckA.stop'
  | 'dj.deckA.cue'
  | 'dj.deckB.play'
  | 'dj.deckB.pause'
  | 'dj.deckB.stop'
  | 'dj.deckB.cue'
  | 'dj.sync'
  | 'dj.killAll'
  // DJ knob pages
  | 'dj.knobPage.next'
  | 'dj.knobPage.prev'
  // DJ EQ kills
  | 'dj.deckA.eqKillLow'
  | 'dj.deckA.eqKillMid'
  | 'dj.deckA.eqKillHi'
  | 'dj.deckB.eqKillLow'
  | 'dj.deckB.eqKillMid'
  | 'dj.deckB.eqKillHi'
  // CommandRegistry bridge - any command name (e.g., 'cmd:play_stop_toggle')
  | `cmd:${string}`;

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
      } else if (mapping.action.startsWith('cmd:')) {
        // Bridge to CommandRegistry — execute any registered command
        try {
          const commandName = mapping.action.slice(4);
          const { getGlobalRegistry } = require('../hooks/useGlobalKeyboardHandler');
          const registry = getGlobalRegistry();
          registry.execute(commandName, 'global');
        } catch (e) {
          console.warn('[ButtonMapManager] Failed to execute command:', mapping.action, e);
        }
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
 * Human-readable action names for all built-in actions.
 * For `cmd:*` actions, the display name is derived from the command name at runtime.
 */
export const ACTION_DISPLAY_NAMES: Record<string, string> = {
  // Tracker transport
  'transport.play': 'Play/Pause',
  'transport.stop': 'Stop',
  'transport.playFromStart': 'Play from Start',
  'transport.toggleRecord': 'Toggle Record',
  // Pattern
  'pattern.next': 'Next Pattern',
  'pattern.previous': 'Previous Pattern',
  'pattern.first': 'First Pattern',
  'pattern.last': 'Last Pattern',
  // Navigation
  'octave.up': 'Octave Up',
  'octave.down': 'Octave Down',
  'channel.next': 'Next Channel',
  'channel.previous': 'Previous Channel',
  // Edit
  'edit.undo': 'Undo',
  'edit.redo': 'Redo',
  // View
  'view.togglePianoRoll': 'Toggle Piano Roll',
  'view.toggleGrid': 'Toggle Grid View',
  // Automation
  'automation.toggleRecord': 'Toggle Automation Record',
  // DJ Transport
  'dj.deckA.play': 'DJ Deck A Play',
  'dj.deckA.pause': 'DJ Deck A Pause',
  'dj.deckA.stop': 'DJ Deck A Stop',
  'dj.deckA.cue': 'DJ Deck A Cue',
  'dj.deckB.play': 'DJ Deck B Play',
  'dj.deckB.pause': 'DJ Deck B Pause',
  'dj.deckB.stop': 'DJ Deck B Stop',
  'dj.deckB.cue': 'DJ Deck B Cue',
  'dj.sync': 'DJ Sync B to A',
  'dj.killAll': 'DJ Kill All',
  // DJ Knob Pages
  'dj.knobPage.next': 'DJ Next Knob Page',
  'dj.knobPage.prev': 'DJ Prev Knob Page',
  // DJ EQ Kills
  'dj.deckA.eqKillLow': 'DJ Kill Lo A',
  'dj.deckA.eqKillMid': 'DJ Kill Mid A',
  'dj.deckA.eqKillHi': 'DJ Kill Hi A',
  'dj.deckB.eqKillLow': 'DJ Kill Lo B',
  'dj.deckB.eqKillMid': 'DJ Kill Mid B',
  'dj.deckB.eqKillHi': 'DJ Kill Hi B',
};

/**
 * Get display name for an action, including dynamic `cmd:` actions.
 */
export function getActionDisplayName(action: EditorAction): string {
  if (action in ACTION_DISPLAY_NAMES) {
    return ACTION_DISPLAY_NAMES[action];
  }
  if (action.startsWith('cmd:')) {
    // Convert command name to display: 'play_stop_toggle' → 'Play Stop Toggle'
    return action.slice(4).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return action;
}

/**
 * All available actions grouped by category (for MIDI mapping UI)
 */
export const ACTIONS_BY_CATEGORY: Record<string, EditorAction[]> = {
  Transport: ['transport.play', 'transport.stop', 'transport.playFromStart', 'transport.toggleRecord'],
  Pattern: ['pattern.next', 'pattern.previous', 'pattern.first', 'pattern.last'],
  Navigation: ['octave.up', 'octave.down', 'channel.next', 'channel.previous'],
  Edit: ['edit.undo', 'edit.redo'],
  View: ['view.togglePianoRoll', 'view.toggleGrid'],
  Automation: ['automation.toggleRecord'],
  'DJ Transport': [
    'dj.deckA.play', 'dj.deckA.pause', 'dj.deckA.stop', 'dj.deckA.cue',
    'dj.deckB.play', 'dj.deckB.pause', 'dj.deckB.stop', 'dj.deckB.cue',
    'dj.sync', 'dj.killAll',
  ],
  'DJ Knob Pages': ['dj.knobPage.next', 'dj.knobPage.prev'],
  'DJ EQ Kill': [
    'dj.deckA.eqKillLow', 'dj.deckA.eqKillMid', 'dj.deckA.eqKillHi',
    'dj.deckB.eqKillLow', 'dj.deckB.eqKillMid', 'dj.deckB.eqKillHi',
  ],
};
