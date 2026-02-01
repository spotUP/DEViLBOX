/**
 * NKS Manager
 * 
 * Central manager for NKS integration:
 * - Preset management (load/save .nksf)
 * - Hardware controller communication
 * - Parameter synchronization
 * - Display updates
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  NKSPreset,
  NKSPresetMetadata,
  NKSParameter,
  NKSPage,
  NKSControllerInfo,
  NKSKeyLight,
} from './types';
import { parseNKSF, writeNKSF } from './NKSFileFormat';
import { TB303_NKS_PARAMETERS, TB303_NKS_PAGES, formatNKSValue } from './parameterMap';

interface NKSStore {
  // Controller state
  isConnected: boolean;
  controllerInfo: NKSControllerInfo | null;
  
  // Current state
  currentPreset: NKSPreset | null;
  currentPage: number;
  pages: NKSPage[];
  parameters: NKSParameter[];
  parameterValues: Record<string, number>;
  changedParameters: Set<string>;
  presets: NKSPreset[];
  
  // Preset browser
  availablePresets: NKSPresetMetadata[];
  currentBank: string[];
  
  // Display state
  displayInfo: string[] | null;
  
  // Light guide state
  lightGuide: NKSKeyLight[];
  
  // Computed
  totalPages: number;
  
  // Actions
  init: () => Promise<void>;
  disconnect: () => void;
  
  // Preset management
  loadPreset: (preset: NKSPreset) => void;
  loadPresetFromFile: (file: File) => Promise<void>;
  savePreset: (name: string, metadata?: Partial<NKSPresetMetadata>) => void;
  exportPreset: () => void;
  addPreset: (preset: NKSPreset) => void;
  
  // Parameter control
  setParameterValue: (paramId: string, value: number) => void;
  resetParameter: (paramId: string) => void;
  resetAllParameters: () => void;
  
  // Page navigation
  nextPage: () => void;
  prevPage: () => void;
  setPage: (pageIndex: number) => void;
  
  // Display updates
  updateDisplay: () => void;
  setDisplayInfo: (lines: string[]) => void;
  
  // Light guide
  setLightGuide: (lights: NKSKeyLight[]) => void;
  clearLightGuide: () => void;
}

export const useNKSStore = create<NKSStore>()(
  immer((set, get) => ({
    // Initial state
    isConnected: false,
    controllerInfo: null,
    currentPreset: null,
    currentPage: 0,
    pages: TB303_NKS_PAGES,
    parameters: TB303_NKS_PARAMETERS,
    parameterValues: {},
    changedParameters: new Set(),
    presets: [],
    availablePresets: [],
    currentBank: [],
    displayInfo: null,
    lightGuide: [],
    totalPages: TB303_NKS_PAGES.length,
    keyLights: [],

    // Initialize NKS system
    init: async () => {
      console.log('[NKS] Initializing NKS Manager...');
      
      // Initialize parameter values to defaults
      const defaultValues: Record<string, number> = {};
      for (const param of TB303_NKS_PARAMETERS) {
        defaultValues[param.id] = param.defaultValue;
      }
      
      set((state) => {
        state.parameterValues = defaultValues;
        state.changedParameters = new Set();
      });
      
      // Try to detect NI hardware
      // This would use Web HID API or Web MIDI for controller detection
      // For now, we'll stub this out
      await detectNIController();
      
      // Update display
      get().updateDisplay();
      
      console.log('[NKS] NKS Manager initialized');
    },

    disconnect: () => {
      set((state) => {
        state.isConnected = false;
        state.controllerInfo = null;
      });
      console.log('[NKS] Disconnected from NI controller');
    },

    // Load preset from NKSPreset object
    loadPreset: (preset: NKSPreset) => {
      set((state) => {
        state.currentPreset = preset;
        state.parameterValues = { ...preset.parameters };
        state.changedParameters = new Set();
        state.currentPage = 0;
      });
      
      get().updateDisplay();
      console.log('[NKS] Loaded preset:', preset.metadata.name);
    },

    // Load preset from file
    loadPresetFromFile: async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const preset = await parseNKSF(buffer);
        get().loadPreset(preset);
      } catch (error) {
        console.error('[NKS] Failed to load preset:', error);
        throw error;
      }
    },

    // Save current state as preset
    savePreset: (name: string, metadata?: Partial<NKSPresetMetadata>) => {
      const { parameterValues, currentPreset } = get();
      
      const preset: NKSPreset = {
        metadata: {
          ...currentPreset?.metadata,
          name,
          vendor: 'DEViLBOX',
          uuid: 'devilbox-tracker-v1',
          version: '1.0',
          deviceType: 'INST',
          bankChain: metadata?.bankChain || ['User', 'Saved'],
          author: metadata?.author,
          comment: metadata?.comment,
          isUser: true,
          ...metadata,
        },
        parameters: { ...parameterValues },
        blob: currentPreset?.blob,
      };
      
      set((state) => {
        state.currentPreset = preset;
        state.changedParameters = new Set();
      });
      
      console.log('[NKS] Preset saved:', name);
    },

    // Export preset to .nksf file
    exportPreset: () => {
      const { currentPreset } = get();
      if (!currentPreset) {
        console.warn('[NKS] No preset to export');
        return;
      }
      
      const buffer = writeNKSF(currentPreset);
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentPreset.metadata.name || 'preset'}.nksf`;
      a.click();
      
      URL.revokeObjectURL(url);
      console.log('[NKS] Preset exported');
    },

    // Add preset to collection
    addPreset: (preset: NKSPreset) => {
      set((state) => {
        state.presets.push(preset);
      });
    },

    // Set parameter value
    setParameterValue: (paramId: string, value: number) => {
      const { parameters } = get();
      const param = parameters.find(p => p.id === paramId);
      
      if (!param) {
        console.warn('[NKS] Unknown parameter:', paramId);
        return;
      }
      
      // Clamp value to valid range
      const clampedValue = Math.max(0, Math.min(1, value));
      
      set((state) => {
        state.parameterValues[paramId] = clampedValue;
        
        // Mark as changed if different from default
        if (Math.abs(clampedValue - param.defaultValue) > 0.001) {
          state.changedParameters.add(paramId);
        } else {
          state.changedParameters.delete(paramId);
        }
      });
      
      // Update display
      get().updateDisplay();
      
      // TODO: Apply parameter change to actual synth engine
      // This would call into ToneEngine or InstrumentStore
    },

    // Reset parameter to default
    resetParameter: (paramId: string) => {
      const { parameters } = get();
      const param = parameters.find(p => p.id === paramId);
      
      if (param) {
        get().setParameterValue(paramId, param.defaultValue);
      }
    },

    // Reset all parameters
    resetAllParameters: () => {
      const { parameters } = get();
      
      set((state) => {
        for (const param of parameters) {
          state.parameterValues[param.id] = param.defaultValue;
        }
        state.changedParameters.clear();
      });
      
      get().updateDisplay();
      console.log('[NKS] All parameters reset');
    },

    // Page navigation
    nextPage: () => {
      const { currentPage, pages } = get();
      const newPage = (currentPage + 1) % pages.length;
      get().setPage(newPage);
    },

    prevPage: () => {
      const { currentPage, pages } = get();
      const newPage = currentPage === 0 ? pages.length - 1 : currentPage - 1;
      get().setPage(newPage);
    },

    setPage: (pageIndex: number) => {
      const { pages } = get();
      
      if (pageIndex < 0 || pageIndex >= pages.length) {
        console.warn('[NKS] Invalid page index:', pageIndex);
        return;
      }
      
      set((state) => {
        state.currentPage = pageIndex;
      });
      
      get().updateDisplay();
      console.log('[NKS] Page changed to:', pageIndex);
    },

    // Update display info
    updateDisplay: () => {
      const { currentPreset, currentPage, pages, parameterValues } = get();
      
      const page = pages[currentPage];
      if (!page) return;
      
      // Format as string array for hardware displays
      const lines: string[] = [
        'DEViLBOX',
        currentPreset?.metadata.name || 'Untitled',
      ];
      
      // Add parameter info (up to 4 parameters per page)
      for (const param of page.parameters.slice(0, 4)) {
        const value = formatNKSValue(param, parameterValues[param.id] || param.defaultValue);
        lines.push(`${param.name}: ${value}`);
      }
      
      set((state) => {
        state.displayInfo = lines;
      });
      
      // Hardware controller will pick this up and send to device
    },

    // Light guide control
    setLightGuide: (lights: NKSKeyLight[]) => {
      set((state) => {
        state.lightGuide = lights;
      });
    },

    clearLightGuide: () => {
      set((state) => {
        state.lightGuide = [];
      });
    },
    
    // Set display info directly
    setDisplayInfo: (lines: string[]) => {
      set((state) => {
        state.displayInfo = lines;
      });
    },
  }))
);

/**
 * Detect NI controller hardware
 * This would use Web HID API or specialized MIDI SysEx
 */
async function detectNIController(): Promise<void> {
  // TODO: Implement HID detection for:
  // - Komplete Kontrol S-series
  // - Komplete Kontrol A-series  
  // - Komplete Kontrol M32
  // - Maschine MK3
  // - Maschine+
  
  // For now, check if we're running in a DAW that supports NKS
  // This could be detected through VST3 or AU host context
  
  // Stub: Assume no hardware connected
  console.log('[NKS] No NI hardware detected (Web HID not yet implemented)');
}

/**
 * Get NKS manager singleton
 */
export function getNKSManager() {
  return useNKSStore.getState();
}
