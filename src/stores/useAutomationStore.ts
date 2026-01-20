// @ts-nocheck - AutomationParameter type incompatibility
/**
 * Automation Store - Parameter Automation Curves
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { idGenerator } from '../utils/idGenerator';
import type {
  AutomationCurve,
  AutomationPreset,
  AutomationParameter,
} from '@typedefs/automation';
import { AUTOMATION_PRESETS } from '@typedefs/automation';

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
    addCurve: (patternId, channelIndex, parameter) =>
      set((state) => {
        const newCurve: AutomationCurve = {
          id: idGenerator.generate('curve'),
          patternId,
          channelIndex,
          parameter,
          mode: 'curve',
          interpolation: 'linear',
          points: [],
          enabled: true,
        };
        state.curves.push(newCurve);
        state.selectedCurveId = newCurve.id;
        // Rebuild automation data
        state.automation = {};
        state.curves.forEach((c) => {
          if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
          if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
          state.automation[c.patternId][c.channelIndex][c.parameter] = c;
        });
        return newCurve.id;
      }) as unknown as string,

    removeCurve: (curveId) =>
      set((state) => {
        const index = state.curves.findIndex((c) => c.id === curveId);
        if (index !== -1) {
          state.curves.splice(index, 1);
          if (state.selectedCurveId === curveId) {
            state.selectedCurveId = null;
          }
          // Rebuild automation data
          state.automation = {};
          state.curves.forEach((c) => {
            if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
            if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
            state.automation[c.patternId][c.channelIndex][c.parameter] = c;
          });
        }
      }),

    updateCurve: (curveId, updates) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          Object.assign(curve, updates);
          // Rebuild automation data
          state.automation = {};
          state.curves.forEach((c) => {
            if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
            if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
            state.automation[c.patternId][c.channelIndex][c.parameter] = c;
          });
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
          // Rebuild automation data
          state.automation = {};
          state.curves.forEach((c) => {
            if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
            if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
            state.automation[c.patternId][c.channelIndex][c.parameter] = c;
          });
          // Debug logging
          console.log('[AutomationStore] addPoint - rebuilt automation:', {
            curveId,
            parameter: curve.parameter,
            patternId: curve.patternId,
            channelIndex: curve.channelIndex,
            pointCount: curve.points.length,
            automationKeys: Object.keys(state.automation),
          });
        }
      }),

    removePoint: (curveId, row) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          const index = curve.points.findIndex((p) => p.row === row);
          if (index !== -1) {
            curve.points.splice(index, 1);
            // Rebuild automation data
            state.automation = {};
            state.curves.forEach((c) => {
              if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
              if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
              state.automation[c.patternId][c.channelIndex][c.parameter] = c;
            });
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
            // Rebuild automation data
            state.automation = {};
            state.curves.forEach((c) => {
              if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
              if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
              state.automation[c.patternId][c.channelIndex][c.parameter] = c;
            });
          }
        }
      }),

    clearPoints: (curveId) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          curve.points = [];
          // Rebuild automation data
          state.automation = {};
          state.curves.forEach((c) => {
            if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
            if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
            state.automation[c.patternId][c.channelIndex][c.parameter] = c;
          });
        }
      }),

    // Preset application
    applyPreset: (curveId, preset) =>
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          curve.points = [...preset.points];
          // Rebuild automation data
          state.automation = {};
          state.curves.forEach((c) => {
            if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
            if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
            state.automation[c.patternId][c.channelIndex][c.parameter] = c;
          });
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

      // Find surrounding points
      let before = null;
      let after = null;

      for (let i = 0; i < curve.points.length; i++) {
        if (curve.points[i].row <= row) {
          before = curve.points[i];
        }
        if (curve.points[i].row >= row) {
          after = curve.points[i];
          break;
        }
      }

      // Exact match
      if (before && before.row === row) return before.value;
      if (after && after.row === row) return after.value;

      // Interpolate between points
      if (before && after && curve.interpolation === 'linear') {
        const t = (row - before.row) / (after.row - before.row);
        return before.value + (after.value - before.value) * t;
      }

      // Exponential interpolation
      if (before && after && curve.interpolation === 'exponential') {
        const t = (row - before.row) / (after.row - before.row);
        const exponentialT = t * t;
        return before.value + (after.value - before.value) * exponentialT;
      }

      // Step mode (no interpolation)
      if (curve.mode === 'steps') {
        return before ? before.value : after ? after.value : null;
      }

      // Default: use before value
      return before ? before.value : after ? after.value : null;
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
          console.log('[AutomationStore] setAutomation - updated existing curve:', {
            curveId: curve.id,
            parameter,
            pointCount: curve.points.length,
          });
        } else {
          // Add new curve
          state.curves.push(curve);
          console.log('[AutomationStore] setAutomation - added new curve:', {
            curveId: curve.id,
            patternId,
            channelIndex,
            parameter,
            pointCount: curve.points.length,
          });
        }

        // Rebuild automation data
        state.automation = {};
        state.curves.forEach((c) => {
          if (!state.automation[c.patternId]) {
            state.automation[c.patternId] = {};
          }
          if (!state.automation[c.patternId][c.channelIndex]) {
            state.automation[c.patternId][c.channelIndex] = {};
          }
          state.automation[c.patternId][c.channelIndex][c.parameter] = c;
        });

        // Debug log the rebuilt automation
        console.log('[AutomationStore] Rebuilt automation object:', {
          totalCurves: state.curves.length,
          automationPatterns: Object.keys(state.automation),
          automationSummary: Object.entries(state.automation).map(([pid, channels]) => ({
            patternId: pid,
            channels: Object.entries(channels).map(([ch, params]) => ({
              channel: ch,
              params: Object.keys(params)
            }))
          }))
        });
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

        // Rebuild automation data
        state.automation = {};
        newCurves.forEach((c) => {
          if (!state.automation[c.patternId]) state.automation[c.patternId] = {};
          if (!state.automation[c.patternId][c.channelIndex]) state.automation[c.patternId][c.channelIndex] = {};
          state.automation[c.patternId][c.channelIndex][c.parameter] = c;
        });

        console.log('[AutomationStore] Loaded', newCurves.length, 'automation curves');
      }),

    getCurves: () => get().curves,

    // Channel lane UI state
    setActiveParameter: (channelIndex, parameter) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: 'cutoff', showLane: false };
        state.channelLanes.set(channelIndex, { ...existing, activeParameter: parameter });
      }),

    getActiveParameter: (channelIndex) => {
      const state = get();
      return state.channelLanes.get(channelIndex)?.activeParameter || 'cutoff';
    },

    setShowLane: (channelIndex, show) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: 'cutoff', showLane: false };
        state.channelLanes.set(channelIndex, { ...existing, showLane: show });
      }),

    getShowLane: (channelIndex) => {
      const state = get();
      return state.channelLanes.get(channelIndex)?.showLane || false;
    },

    // Reset to initial state (for new project/tab)
    reset: () =>
      set((state) => {
        state.curves = [];
        state.selectedCurveId = null;
        state.editMode = 'pencil';
        state.automation = {};
        state.channelLanes = new Map();
      }),
  }))
);
