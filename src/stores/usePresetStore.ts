/**
 * Preset Store - User Preset Management with LocalStorage persistence
 *
 * Supports:
 * - User preset save/load with LocalStorage
 * - NKS (.nksf) format import/export for NI hardware
 * - Batch operations for preset management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import {
  userPresetToNKSPreset,
  batchExportToNKS,
  batchImportNKSF,
} from '@/midi/nks/presetIntegration';
import { writeNKSF } from '@/midi/nks/NKSFileFormat';

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

  // NKS Integration
  exportPresetAsNKSF: (presetId: string) => void;
  exportAllPresetsAsNKSF: (author?: string) => void;
  importNKSFFiles: (files: File[]) => Promise<string[]>;
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
              type: instrument.type,
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

      // NKS Integration: Export single preset as .nksf
      exportPresetAsNKSF: (presetId: string) => {
        const preset = get().getPreset(presetId);
        if (!preset) {
          console.warn('[Preset] Preset not found:', presetId);
          return;
        }

        try {
          const nksPreset = userPresetToNKSPreset(preset);
          const buffer = writeNKSF(nksPreset);

          const blob = new Blob([buffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `${preset.name}.nksf`;
          a.click();

          URL.revokeObjectURL(url);
          console.log('[Preset] Exported as NKSF:', preset.name);
        } catch (error) {
          console.error('[Preset] Failed to export as NKSF:', error);
        }
      },

      // NKS Integration: Batch export all presets as .nksf
      exportAllPresetsAsNKSF: (author?: string) => {
        const presets = get().userPresets;
        if (presets.length === 0) {
          console.warn('[Preset] No presets to export');
          return;
        }

        try {
          const exports = batchExportToNKS(presets, author);

          // Download each file with a small delay to avoid browser blocking
          exports.forEach((exp, index) => {
            setTimeout(() => {
              const blob = new Blob([exp.buffer], { type: 'application/octet-stream' });
              const url = URL.createObjectURL(blob);

              const a = document.createElement('a');
              a.href = url;
              a.download = exp.filename;
              a.click();

              URL.revokeObjectURL(url);
            }, index * 100);
          });

          console.log('[Preset] Exported', exports.length, 'presets as NKSF');
        } catch (error) {
          console.error('[Preset] Failed to batch export NKSF:', error);
        }
      },

      // NKS Integration: Import .nksf files as user presets
      importNKSFFiles: async (files: File[]): Promise<string[]> => {
        const importedIds: string[] = [];

        try {
          const importedPresets = await batchImportNKSF(files);

          for (const presetData of importedPresets) {
            const presetId = `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            set((state) => {
              const newPreset: UserPreset = {
                id: presetId,
                ...presetData,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              state.userPresets.push(newPreset);
            });

            importedIds.push(presetId);
          }

          console.log('[Preset] Imported', importedIds.length, 'presets from NKSF files');
        } catch (error) {
          console.error('[Preset] Failed to import NKSF files:', error);
        }

        return importedIds;
      },
    })),
    {
      name: 'devilbox-user-presets',
      version: 1,
    }
  )
);
