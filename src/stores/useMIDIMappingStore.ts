/**
 * MIDI Mapping Store - Manages MIDI CC to parameter mappings
 *
 * Allows users to map MIDI controllers to various grid parameters
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MIDIMappableParameter =
  | 'baseOctave'
  | 'velocity'
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'decay'
  | 'accent';

export interface MIDIMapping {
  channel: number; // MIDI channel (0-15)
  controller: number; // CC number (0-127)
  parameter: MIDIMappableParameter;
  min: number; // Minimum parameter value
  max: number; // Maximum parameter value
  curve?: 'linear' | 'exponential' | 'logarithmic'; // Response curve
}

interface MIDIMappingState {
  mappings: Map<string, MIDIMapping>; // Key: "channel:controller"
  isLearning: boolean;
  learningParameter: MIDIMappableParameter | null;

  // Actions
  addMapping: (mapping: MIDIMapping) => void;
  removeMapping: (channel: number, controller: number) => void;
  getMapping: (channel: number, controller: number) => MIDIMapping | undefined;
  clearAllMappings: () => void;
  startLearning: (parameter: MIDIMappableParameter) => void;
  stopLearning: () => void;
  applyMIDIValue: (channel: number, controller: number, value: number) => number | null;
}

/**
 * Generate mapping key from channel and controller
 */
function getMappingKey(channel: number, controller: number): string {
  return `${channel}:${controller}`;
}

/**
 * Apply curve transformation to MIDI value
 */
function applyCurve(value: number, curve: 'linear' | 'exponential' | 'logarithmic' = 'linear'): number {
  // Clamp to valid MIDI range (0-127)
  const clampedValue = Math.max(0, Math.min(127, value));

  // Normalize to 0-1 range
  const normalized = clampedValue / 127;

  switch (curve) {
    case 'exponential':
      return Math.pow(normalized, 2);
    case 'logarithmic':
      return Math.sqrt(normalized);
    case 'linear':
    default:
      return normalized;
  }
}

/**
 * Map MIDI value (0-127) to parameter range
 */
function mapValue(midiValue: number, min: number, max: number, curve?: 'linear' | 'exponential' | 'logarithmic'): number {
  const normalized = applyCurve(midiValue, curve);
  return min + normalized * (max - min);
}

export const useMIDIMappingStore = create<MIDIMappingState>()(
  persist(
    (set, get) => ({
      mappings: new Map(),
      isLearning: false,
      learningParameter: null,

      addMapping: (mapping) => {
        // Validate MIDI channel (0-15)
        if (mapping.channel < 0 || mapping.channel > 15) {
          console.error('Invalid MIDI channel:', mapping.channel, '(must be 0-15)');
          return;
        }

        // Validate MIDI controller (0-127)
        if (mapping.controller < 0 || mapping.controller > 127) {
          console.error('Invalid MIDI controller:', mapping.controller, '(must be 0-127)');
          return;
        }

        // Validate parameter range
        if (mapping.min > mapping.max) {
          console.error('Invalid range: min > max', { min: mapping.min, max: mapping.max });
          return;
        }

        set((state) => {
          const key = getMappingKey(mapping.channel, mapping.controller);
          const newMappings = new Map(state.mappings);
          newMappings.set(key, mapping);
          return { mappings: newMappings };
        });
      },

      removeMapping: (channel, controller) => {
        set((state) => {
          const key = getMappingKey(channel, controller);
          const newMappings = new Map(state.mappings);
          newMappings.delete(key);
          return { mappings: newMappings };
        });
      },

      getMapping: (channel, controller) => {
        const key = getMappingKey(channel, controller);
        return get().mappings.get(key);
      },

      clearAllMappings: () => {
        set({ mappings: new Map() });
      },

      startLearning: (parameter) => {
        const { isLearning } = get();
        if (isLearning) {
          console.warn('Already in learning mode');
          return;
        }
        set({ isLearning: true, learningParameter: parameter });
      },

      stopLearning: () => {
        set({ isLearning: false, learningParameter: null });
      },

      applyMIDIValue: (channel, controller, value) => {
        const mapping = get().getMapping(channel, controller);
        if (!mapping) return null;

        return mapValue(value, mapping.min, mapping.max, mapping.curve);
      },
    }),
    {
      name: 'devilbox-midi-mappings',
      // Error handling for storage failures
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('Failed to load MIDI mappings from storage:', error);
        }
      },
      // Custom serialization for Map
      partialize: (state) => ({
        mappings: Array.from(state.mappings.entries()),
      }),
      merge: (persistedState: any, currentState) => {
        try {
          return {
            ...currentState,
            mappings: new Map(persistedState?.mappings || []),
          };
        } catch (error) {
          console.error('Failed to parse MIDI mappings from storage:', error);
          return currentState;
        }
      },
    }
  )
);
