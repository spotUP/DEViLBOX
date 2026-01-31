/**
 * PadMappingManager - MIDI Note to Instrument Mapping
 *
 * Manages mappings between MIDI Input Notes (Pads) and Project Instruments.
 * Allows creating a custom "Drum Kit" layout across multiple instruments.
 */

import { getMIDIManager } from './MIDIManager';
import type { MIDIMessage } from './types';

export interface PadMapping {
  id: string;              // Unique ID "${channel}-${note}"
  inputNote: number;       // MIDI Note Number (0-127)
  inputChannel: number;    // MIDI Channel (0-15)
  
  type: 'instrument' | 'action';
  
  // For 'instrument' type
  targetInstrumentId?: number; 
  targetNote?: number;     // The note to play on the target instrument (e.g. 60 for C4)
  
  // For 'action' type
  actionId?: string;       // e.g. "transport.play"
}

type PadTriggerCallback = (mapping: PadMapping, velocity: number) => void;

class PadMappingManager {
  private static instance: PadMappingManager | null = null;

  private mappings: Map<string, PadMapping> = new Map();
  private triggerCallbacks: Set<PadTriggerCallback> = new Set();
  private handlerRegistered: boolean = false;

  // Learn mode state
  private isLearning: boolean = false;
  private learnCallback: ((note: number, channel: number) => void) | null = null;

  private constructor() {}

  static getInstance(): PadMappingManager {
    if (!PadMappingManager.instance) {
      PadMappingManager.instance = new PadMappingManager();
    }
    return PadMappingManager.instance;
  }

  init(): void {
    if (this.handlerRegistered) return;

    const midiManager = getMIDIManager();
    midiManager.addMessageHandler(this.handleMIDIMessage);
    this.handlerRegistered = true;

    this.loadMappings();
  }

  private handleMIDIMessage = (message: MIDIMessage): void => {
    if (message.type !== 'noteOn' && message.type !== 'noteOff') return;
    if (message.note === undefined) return;

    // Handle Learn Mode
    if (this.isLearning && message.type === 'noteOn' && this.learnCallback) {
      this.learnCallback(message.note, message.channel);
      return;
    }

    // Lookup mapping
    const key = `${message.channel}-${message.note}`;
    const mapping = this.mappings.get(key);

    if (mapping) {
      // Notify listeners (UI or Engine)
      // Note: We handle both Note On and Note Off to support gating
      // Consumers should check message.type or velocity (0 = off)
      
      // If note off, velocity is 0
      const velocity = message.type === 'noteOff' ? 0 : (message.velocity ?? 0);
      
      this.notifyTrigger(mapping, velocity);
    }
  };

  /**
   * Register a trigger callback (e.g. from the Engine hook)
   */
  onTrigger(callback: PadTriggerCallback): () => void {
    this.triggerCallbacks.add(callback);
    return () => this.triggerCallbacks.delete(callback);
  }

  private notifyTrigger(mapping: PadMapping, velocity: number): void {
    this.triggerCallbacks.forEach(cb => {
      try {
        cb(mapping, velocity);
      } catch (e) {
        console.error('[PadMappingManager] Error in trigger callback:', e);
      }
    });
  }

  // ==========================================================================
  // Mapping Management
  // ==========================================================================

  setMapping(mapping: PadMapping): void {
    this.mappings.set(mapping.id, mapping);
    this.saveMappings();
  }

  removeMapping(id: string): void {
    this.mappings.delete(id);
    this.saveMappings();
  }

  getMapping(channel: number, note: number): PadMapping | undefined {
    return this.mappings.get(`${channel}-${note}`);
  }

  getAllMappings(): PadMapping[] {
    return Array.from(this.mappings.values());
  }

  clearMappings(): void {
    this.mappings.clear();
    this.saveMappings();
  }

  // ==========================================================================
  // Learn Mode
  // ==========================================================================

  startLearn(callback: (note: number, channel: number) => void): void {
    this.isLearning = true;
    this.learnCallback = (note, channel) => {
      this.isLearning = false;
      this.learnCallback = null;
      callback(note, channel);
    };
  }

  cancelLearn(): void {
    this.isLearning = false;
    this.learnCallback = null;
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private saveMappings(): void {
    try {
      const data = JSON.stringify(Array.from(this.mappings.values()));
      localStorage.setItem('pad-mappings-v1', data);
    } catch (e) {
      console.error('[PadMappingManager] Failed to save mappings', e);
    }
  }

  private loadMappings(): void {
    try {
      const data = localStorage.getItem('pad-mappings-v1');
      if (data) {
        const mappings: PadMapping[] = JSON.parse(data);
        this.mappings.clear();
        mappings.forEach(m => this.mappings.set(m.id, m));
      }
    } catch (e) {
      console.error('[PadMappingManager] Failed to load mappings', e);
    }
  }
  
  dispose(): void {
    if (this.handlerRegistered) {
        getMIDIManager().removeMessageHandler(this.handleMIDIMessage);
        this.handlerRegistered = false;
    }
    this.triggerCallbacks.clear();
  }
}

export function getPadMappingManager(): PadMappingManager {
  return PadMappingManager.getInstance();
}
