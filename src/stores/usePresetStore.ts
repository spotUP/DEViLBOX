/**
 * Preset Store - User Preset Management with LocalStorage persistence
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';

export type PresetCategory = 'Bass' | 'Lead' | 'Pad' | 'Drum' | 'FX' | 'User';

export interface UserPreset {
  id: string;
  name: string;
  category: PresetCategory;
  synthType: SynthType;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  config: Omit<InstrumentConfig, 'id'>;
}

interface PresetStore {
  // State
  userPresets: UserPreset[];
  recentPresetIds: string[]; // Last 10 used presets

  // Actions
  savePreset: (
    instrument: InstrumentConfig,
    name: string,
    category: PresetCategory,
    tags?: string[]
  ) => string;
  deletePreset: (presetId: string) => void;
  updatePreset: (
    presetId: string,
    updates: Partial<Pick<UserPreset, 'name' | 'category' | 'tags'>>
  ) => void;
  getPreset: (presetId: string) => UserPreset | undefined;
  getPresetsByCategory: (category: PresetCategory) => UserPreset[];
  getPresetsBySynthType: (synthType: SynthType) => UserPreset[];
  addToRecent: (presetId: string) => void;
  clearRecent: () => void;
  importPresets: (presets: UserPreset[]) => void;
  exportPresets: () => UserPreset[];
}

export const usePresetStore = create<PresetStore>()(
  persist(
    immer((set, get) => ({
      // Initial state
      userPresets: [],
      recentPresetIds: [],

      // Save current instrument as preset
      savePreset: (instrument, name, category, tags = []) => {
        const presetId = `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        set((state) => {
          const newPreset: UserPreset = {
            id: presetId,
            name,
            category,
            synthType: instrument.synthType,
            tags,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            config: {
              name: instrument.name,
              synthType: instrument.synthType,
              oscillator: instrument.oscillator,
              envelope: instrument.envelope,
              filter: instrument.filter,
              filterEnvelope: instrument.filterEnvelope,
              tb303: instrument.tb303,
              wavetable: instrument.wavetable,
              effects: instrument.effects ? [...instrument.effects] : [],
              volume: instrument.volume,
              pan: instrument.pan,
              parameters: instrument.parameters,
            },
          };
          state.userPresets.push(newPreset);
        });

        return presetId;
      },

      // Delete a user preset
      deletePreset: (presetId) =>
        set((state) => {
          const index = state.userPresets.findIndex((p) => p.id === presetId);
          if (index !== -1) {
            state.userPresets.splice(index, 1);
          }
          // Also remove from recent
          const recentIndex = state.recentPresetIds.indexOf(presetId);
          if (recentIndex !== -1) {
            state.recentPresetIds.splice(recentIndex, 1);
          }
        }),

      // Update preset metadata
      updatePreset: (presetId, updates) =>
        set((state) => {
          const preset = state.userPresets.find((p) => p.id === presetId);
          if (preset) {
            Object.assign(preset, updates);
            preset.updatedAt = Date.now();
          }
        }),

      // Get a specific preset
      getPreset: (presetId) => {
        return get().userPresets.find((p) => p.id === presetId);
      },

      // Get presets by category
      getPresetsByCategory: (category) => {
        return get().userPresets.filter((p) => p.category === category);
      },

      // Get presets by synth type
      getPresetsBySynthType: (synthType) => {
        return get().userPresets.filter((p) => p.synthType === synthType);
      },

      // Track recently used presets
      addToRecent: (presetId) =>
        set((state) => {
          // Remove if already in list
          const existingIndex = state.recentPresetIds.indexOf(presetId);
          if (existingIndex !== -1) {
            state.recentPresetIds.splice(existingIndex, 1);
          }
          // Add to front
          state.recentPresetIds.unshift(presetId);
          // Keep only last 10
          if (state.recentPresetIds.length > 10) {
            state.recentPresetIds.pop();
          }
        }),

      // Clear recent history
      clearRecent: () =>
        set((state) => {
          state.recentPresetIds = [];
        }),

      // Import presets (for file loading)
      importPresets: (presets) =>
        set((state) => {
          presets.forEach((preset) => {
            // Check for duplicate IDs
            const existingIndex = state.userPresets.findIndex((p) => p.id === preset.id);
            if (existingIndex !== -1) {
              // Update existing
              state.userPresets[existingIndex] = preset;
            } else {
              // Add new
              state.userPresets.push(preset);
            }
          });
        }),

      // Export all user presets
      exportPresets: () => {
        return get().userPresets;
      },
    })),
    {
      name: 'scribbleton-user-presets',
      version: 1,
    }
  )
);
