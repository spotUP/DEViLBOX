/**
 * Automation Store - Parameter Automation Curves
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  AutomationCurve,
  AutomationPreset,
  AutomationParameter,
} from '@typedefs/automation';
import { AUTOMATION_PRESETS, interpolateAutomationValue } from '@typedefs/automation';

interface AutomationData {
  [patternId: string]: {
    [channelIndex: number]: {
      [parameter: string]: AutomationCurve;
    };
  };
}

interface ChannelLaneState {
  activeParameter: AutomationParameter;
  showLane: boolean;
}

interface AutomationStore {
  // State
  curves: AutomationCurve[];
  selectedCurveId: string | null;
  editMode: 'pencil' | 'line' | 'curve' | 'select';
  presets: AutomationPreset[];
  automation: AutomationData;
  channelLanes: Map<number, ChannelLaneState>;

  // Actions
  addCurve: (
    patternId: string,
    channelIndex: number,
    parameter: AutomationParameter
  ) => string;
  removeCurve: (curveId: string) => void;
  updateCurve: (curveId: string, updates: Partial<AutomationCurve>) => void;
  setSelectedCurve: (curveId: string | null) => void;
  setEditMode: (mode: 'pencil' | 'line' | 'curve' | 'select') => void;

  // Point manipulation
  addPoint: (curveId: string, row: number, value: number) => void;
  removePoint: (curveId: string, row: number) => void;
  updatePoint: (curveId: string, row: number, value: number) => void;
  clearPoints: (curveId: string) => void;

  // Preset application
  applyPreset: (curveId: string, preset: AutomationPreset) => void;

  // Utility
  getCurvesForPattern: (patternId: string, channelIndex: number) => AutomationCurve[];
  getValueAtRow: (curveId: string, row: number) => number | null;
  getAutomation: (patternId: string, channelIndex: number, parameter: string) => AutomationCurve;
  setAutomation: (
    patternId: string,
    channelIndex: number,
    parameter: string,
    curve: AutomationCurve
  ) => void;
  buildAutomationData: () => AutomationData;

  // Import/Export
  loadCurves: (curves: AutomationCurve[]) => void;
  getCurves: () => AutomationCurve[];

  // Channel lane UI state
  setActiveParameter: (channelIndex: number, parameter: AutomationParameter) => void;
  getActiveParameter: (channelIndex: number) => AutomationParameter;
  setShowLane: (channelIndex: number, show: boolean) => void;
  getShowLane: (channelIndex: number) => boolean;

  // Reset to initial state
  reset: () => void;
}

/** Rebuild the denormalized automation index from the curves array */
function rebuildAutomationIndex(state: { automation: AutomationData; curves: AutomationCurve[] }): void {
  state.automation = {};
  state.curves.forEach((c) => {
    if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
    if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
    state.automation[c.patternId][c.channelIndex][c.parameter] = c;
  });
}

export const useAutomationStore = create<AutomationStore>()(
  immer((set, get) => ({
    // Initial state
    curves: [],
    selectedCurveId: null,
    editMode: 'pencil',
    presets: [...AUTOMATION_PRESETS],
    automation: {},
    channelLanes: new Map(),

    // Actions
    addCurve: (patternId, channelIndex, parameter) => {
      const newCurve: AutomationCurve = {
        id: `curve-${Date.now()}`,
        patternId,
        channelIndex,
        parameter,
        mode: 'curve',
        interpolation: 'linear',
        points: [],
        enabled: true,
      };
      set((state) => {
        state.curves.push(newCurve);
        state.selectedCurveId = newCurve.id;
        // Rebuild automation data
        rebuildAutomationIndex(state);
      });
      return newCurve.id;
    },

    removeCurve: (curveId) =>
      set((state) => {
        const index = state.curves.findIndex((c) => c.id === curveId);
        if (index !== -1) {
          state.curves.splice(index, 1);
          if (state.selectedCurveId === curveId) {
            state.selectedCurveId = null;
          }
          rebuildAutomationIndex(state);
        }
      }),

    updateCurve: (curveId, updates) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          Object.assign(curve, updates);
          rebuildAutomationIndex(state);
        }
      }),

    setSelectedCurve: (curveId) =>
      set((state) => {
        state.selectedCurveId = curveId;
      }),

    setEditMode: (mode) =>
      set((state) => {
        state.editMode = mode;
      }),

    // Point manipulation
    addPoint: (curveId, row, value) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          // Check if point already exists at this row
          const existingIndex = curve.points.findIndex((p) => p.row === row);
          if (existingIndex !== -1) {
            // Update existing point
            curve.points[existingIndex].value = value;
          } else {
            // Add new point and sort by row
            curve.points.push({ row, value });
            curve.points.sort((a, b) => a.row - b.row);
          }
          rebuildAutomationIndex(state);
        }
      }),

    removePoint: (curveId, row) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          const index = curve.points.findIndex((p) => p.row === row);
          if (index !== -1) {
            curve.points.splice(index, 1);
            rebuildAutomationIndex(state);
          }
        }
      }),

    updatePoint: (curveId, row, value) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          const point = curve.points.find((p) => p.row === row);
          if (point) {
            point.value = value;
            rebuildAutomationIndex(state);
          }
        }
      }),

    clearPoints: (curveId) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          curve.points = [];
          rebuildAutomationIndex(state);
        }
      }),

    // Preset application
    applyPreset: (curveId, preset) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          curve.points = [...preset.points];
          rebuildAutomationIndex(state);
        }
      }),

    // Utility
    getCurvesForPattern: (patternId, channelIndex) => {
      return get().curves.filter(
        (c) => c.patternId === patternId && c.channelIndex === channelIndex
      );
    },

    getValueAtRow: (curveId, row) => {
      const curve = get().curves.find((c) => c.id === curveId);
      if (!curve || curve.points.length === 0) return null;
      return interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
    },

    getAutomation: (patternId, channelIndex, parameter) => {
      const state = get();

      // Try to find existing curve
      const existing = state.curves.find(
        (c) =>
          c.patternId === patternId &&
          c.channelIndex === channelIndex &&
          c.parameter === parameter
      );

      if (existing) {
        return existing;
      }

      // Return empty curve
      return {
        id: `temp-${patternId}-${channelIndex}-${parameter}`,
        patternId,
        channelIndex,
        parameter,
        mode: 'curve',
        interpolation: 'linear',
        points: [],
        enabled: true,
      };
    },

    setAutomation: (patternId, channelIndex, parameter, curve) =>
      set((state) => {
        // Find existing curve
        const existingIndex = state.curves.findIndex(
          (c) =>
            c.patternId === patternId &&
            c.channelIndex === channelIndex &&
            c.parameter === parameter
        );

        if (existingIndex !== -1) {
          // Update existing curve
          state.curves[existingIndex] = curve;
        } else {
          // Add new curve
          state.curves.push(curve);
        }

        rebuildAutomationIndex(state);
      }),

    buildAutomationData: () => {
      const state = get();
      const data: AutomationData = {};

      state.curves.forEach((curve) => {
        if (!data[curve.patternId]) {
          data[curve.patternId] = {};
        }
        if (!data[curve.patternId][curve.channelIndex]) {
          data[curve.patternId][curve.channelIndex] = {};
        }
        data[curve.patternId][curve.channelIndex][curve.parameter] = curve;
      });

      return data;
    },

    // Import/Export
    loadCurves: (newCurves) =>
      set((state) => {
        state.curves = newCurves;
        state.selectedCurveId = null;
        rebuildAutomationIndex(state);
      }),

    getCurves: () => get().curves,

    // Channel lane UI state
    setActiveParameter: (channelIndex, parameter) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: '', showLane: false };
        state.channelLanes.set(channelIndex, { ...existing, activeParameter: parameter });
      }),

    getActiveParameter: (channelIndex) => {
      const state = get();
      return state.channelLanes.get(channelIndex)?.activeParameter || '';
    },

    setShowLane: (channelIndex, show) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: '', showLane: false };
        state.channelLanes.set(channelIndex, { ...existing, showLane: show });
      }),

    getShowLane: (channelIndex) => {
      const state = get();
      return state.channelLanes.get(channelIndex)?.showLane || false;
    },

    // Reset to initial state (for new project/tab)
    // NOTE: Use direct set({}) rather than Immer producer to avoid Immer proxying
    // the new Map. An Immer-proxied Map passed to PixiJS React causes a BindingError
    // ("Expected null or instance of Node, got an instance of Node").
    reset: () =>
      set({
        curves: [],
        selectedCurveId: null,
        editMode: 'pencil' as const,
        automation: {},
        channelLanes: new Map<number, ChannelLaneState>(),
      }),
  }))
);
