/**
 * Automation Store - Parameter Automation Curves
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { checkFormatViolation, getActiveFormatLimits } from '@/lib/formatCompatibility';
import type { FormatConstraints } from '@/lib/formatCompatibility';
import type {
  AutomationCurve,
  AutomationPreset,
  AutomationParameter,
} from '@typedefs/automation';
import { AUTOMATION_PRESETS, interpolateAutomationValue } from '@typedefs/automation';

/**
 * Check if a parameter can be baked into native effect commands for a format.
 * Mirrors the getEffectMapping logic in AutomationBaker.ts — kept in sync manually.
 */
function canBakeParameter(param: string, format: FormatConstraints): boolean {
  const p = param.toLowerCase();

  // ── Furnace chip-specific formats ─────────────────────────────────────
  // If we have a chipType, the AutomationBaker has dedicated per-chip mappers
  // for all known parameters. Common chip params are always bakeable.
  if (format.chipType) {
    // Parameters bakeable on ALL Furnace chips (via generic or chip-specific mapping)
    if (p.includes('volume') || p.includes('.vol') || p.includes('level')) return true;
    if (p.includes('waveform') || p.includes('wave')) return true;
    if (p.includes('duty') || p.includes('pulse')) return true;
    if (p.includes('noise')) return true;
    if (p.includes('cutoff') || p.includes('filter')) return true;
    if (p.includes('resonance') || p.includes('reso')) return true;
    if (p.includes('feedback') || p.includes('.fb')) return true;
    if (p.includes('algorithm') || p.includes('.alg')) return true;
    if (p.includes('tl') || p.includes('totallevel') || p.includes('oplevel')) return true;
    if (p.includes('mult') || p.includes('multiplier')) return true;
    if (p.includes('attack') || p.includes('decay') || p.includes('sustain') || p.includes('release')) return true;
    if (p.includes('detune') || p.includes('.dt')) return true;
    if (p.includes('lfo') || p.includes('vibrato') || p.includes('tremolo')) return true;
    if (p.includes('env') || p.includes('envelope')) return true;
    if (p.includes('gain') || p.includes('echo') || p.includes('surround')) return true;
    if (p.includes('mod') || p.includes('pitch')) return true;
    if (p.includes('slide')) return true;
    // If it's a known NKS parameter for this chip, the baker likely handles it
    if (p.startsWith('furnace.')) return true;
  }

  // ── Generic tracker formats (MOD/XM/IT/S3M) ──────────────────────────
  if (p.includes('volume') || p.includes('.vol') || p === 'gain' || p.includes('level') || p.includes('amplitude')) return true;
  if ((p.includes('globalvol') || p.includes('global_vol') || p.includes('mastervol') || p.includes('master_vol')) && format.name !== 'MOD') return true;
  if (p.includes('pan') && format.supportsPanning) return true;
  if ((p.includes('cutoff') || (p.includes('filter') && !p.includes('filterselect') && !p.includes('filtermode'))) && (format.name === 'IT' || format.name === 'S3M')) return true;
  if ((p.includes('resonance') || p.includes('reso')) && (format.name === 'IT' || format.name === 'S3M')) return true;
  if (p.includes('pitch') || p.includes('frequency') || p.includes('period') || p.includes('detune') || p.includes('finetune')) return true;
  if (p.includes('vibrato') || p.includes('tremolo')) return true;

  return false;
}

interface AutomationData {
  [patternId: string]: {
    [channelIndex: number]: {
      [parameter: string]: AutomationCurve;
    };
  };
}

interface ChannelLaneState {
  activeParameter: AutomationParameter;
  activeParameters: AutomationParameter[];
  showLane: boolean;
  laneHeight: number; // 24 = compact, 48 = normal, 72 = expanded
  collapsed: boolean;
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

  // Multi-lane support
  addActiveParameter: (channelIndex: number, parameter: AutomationParameter) => void;
  removeActiveParameter: (channelIndex: number, parameter: AutomationParameter) => void;
  getActiveParameters: (channelIndex: number) => AutomationParameter[];
  setLaneHeight: (channelIndex: number, height: number) => void;
  setLaneCollapsed: (channelIndex: number, collapsed: boolean) => void;

  // Copy/paste
  copiedCurvePoints: AutomationCurve['points'] | null;
  copyCurve: (curveId: string) => void;
  pasteCurve: (patternId: string, channelIndex: number, parameter: string) => void;

  // Automation recording
  recordMode: boolean;
  setRecordMode: (enabled: boolean) => void;
  recordPoint: (patternId: string, channelIndex: number, parameter: string, row: number, value: number) => void;

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

/**
 * Sync a curve to its pattern cells (live bake).
 * Looks up the pattern in the tracker store, runs syncCurveToCells, and
 * notifies the tracker store that the pattern changed.
 *
 * Lazy import to avoid circular dependency at module load time.
 */
function syncCurveToTracker(curveId: string): void {
  // Use dynamic import to avoid circular dependency
  void (async () => {
    try {
      const [
        { syncCurveToCells, forgetCurveBake },
        { useTrackerStore },
        { getActiveFormatLimits },
      ] = await Promise.all([
        import('@/lib/automation/syncCurveToCells'),
        import('@stores/useTrackerStore'),
        import('@/lib/formatCompatibility'),
      ]);

      const curve = useAutomationStore.getState().curves.find(c => c.id === curveId);
      if (!curve) {
        forgetCurveBake(curveId);
        return;
      }

      const limits = getActiveFormatLimits();
      if (!limits) return; // No native format active — nothing to bake into

      // Mutate the pattern via immer producer so subscribers get notified
      useTrackerStore.setState((state) => {
        const pattern = state.patterns.find((p) => p.id === curve.patternId);
        if (!pattern) return;
        syncCurveToCells(curve, pattern, limits);
      });
    } catch (e) {
      console.error('[automation] syncCurveToTracker failed:', e);
    }
  })();
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
      // Check if this parameter can be baked into native effects on export.
      // Inline check mirrors getEffectMapping logic from AutomationBaker.
      const limits = getActiveFormatLimits();
      if (limits) {
        const canBake = canBakeParameter(parameter, limits);
        if (!canBake) {
          void checkFormatViolation('automation',
            `"${parameter}" automation cannot be exported to ${limits.name} format — no equivalent effect command exists.`,
          ).then((ok) => { if (ok) get().addCurve(patternId, channelIndex, parameter); });
          return '';
        }
        // Parameter CAN be baked on export — no warning needed
      }
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

    removeCurve: (curveId) => {
      set((state) => {
        const index = state.curves.findIndex((c) => c.id === curveId);
        if (index !== -1) {
          state.curves.splice(index, 1);
          if (state.selectedCurveId === curveId) {
            state.selectedCurveId = null;
          }
          rebuildAutomationIndex(state);
        }
      });
      // Sync (curve no longer exists, will clear cells and forget)
      syncCurveToTracker(curveId);
    },

    updateCurve: (curveId, updates) => {
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          Object.assign(curve, updates);
          rebuildAutomationIndex(state);
        }
      });
      syncCurveToTracker(curveId);
    },

    setSelectedCurve: (curveId) =>
      set((state) => {
        state.selectedCurveId = curveId;
      }),

    setEditMode: (mode) =>
      set((state) => {
        state.editMode = mode;
      }),

    // Point manipulation
    addPoint: (curveId, row, value) => {
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
      });
      syncCurveToTracker(curveId);
    },

    removePoint: (curveId, row) => {
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          const index = curve.points.findIndex((p) => p.row === row);
          if (index !== -1) {
            curve.points.splice(index, 1);
            rebuildAutomationIndex(state);
          }
        }
      });
      syncCurveToTracker(curveId);
    },

    updatePoint: (curveId, row, value) => {
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          const point = curve.points.find((p) => p.row === row);
          if (point) {
            point.value = value;
            rebuildAutomationIndex(state);
          }
        }
      });
      syncCurveToTracker(curveId);
    },

    clearPoints: (curveId) => {
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          curve.points = [];
          rebuildAutomationIndex(state);
        }
      });
      syncCurveToTracker(curveId);
    },

    // Preset application
    applyPreset: (curveId, preset) => {
      set((state) => {
        const curve = state.curves.find((c) => c.id === curveId);
        if (curve) {
          curve.points = [...preset.points];
          rebuildAutomationIndex(state);
        }
      });
      syncCurveToTracker(curveId);
    },

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

    setAutomation: (patternId, channelIndex, parameter, curve) => {
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
      });
      syncCurveToTracker(curve.id);
    },

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
    loadCurves: (newCurves) => {
      // Forget all prior bake records — new song, fresh state
      void import('@/lib/automation/syncCurveToCells').then(({ forgetAllCurveBakes }) => {
        forgetAllCurveBakes();
      });
      set((state) => {
        state.curves = newCurves;
        state.selectedCurveId = null;
        rebuildAutomationIndex(state);
      });
    },

    getCurves: () => get().curves,

    // Channel lane UI state
    setActiveParameter: (channelIndex, parameter) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: '', activeParameters: [], showLane: false, laneHeight: 48, collapsed: false };
        state.channelLanes.set(channelIndex, { ...existing, activeParameter: parameter });
      }),

    getActiveParameter: (channelIndex) => {
      const state = get();
      return state.channelLanes.get(channelIndex)?.activeParameter || '';
    },

    setShowLane: (channelIndex, show) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: '', activeParameters: [], showLane: false, laneHeight: 48, collapsed: false };
        state.channelLanes.set(channelIndex, { ...existing, showLane: show });
      }),

    getShowLane: (channelIndex) => {
      const state = get();
      return state.channelLanes.get(channelIndex)?.showLane || false;
    },

    // Multi-lane support
    addActiveParameter: (channelIndex, parameter) => {
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: '', activeParameters: [], showLane: false, laneHeight: 48, collapsed: false };
        const params = [...(existing.activeParameters || [])];
        if (!params.includes(parameter)) params.push(parameter);
        state.channelLanes.set(channelIndex, { ...existing, activeParameters: params, activeParameter: parameter });
      });
    },

    removeActiveParameter: (channelIndex, parameter) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex);
        if (!existing) return;
        const params = (existing.activeParameters || []).filter(p => p !== parameter);
        const activeParam = params.length > 0 ? params[0] : '';
        state.channelLanes.set(channelIndex, { ...existing, activeParameters: params, activeParameter: activeParam });
      }),

    getActiveParameters: (channelIndex) => {
      const state = get();
      const lane = state.channelLanes.get(channelIndex);
      if (!lane) return [];
      if (lane.activeParameters && lane.activeParameters.length > 0) return lane.activeParameters;
      return lane.activeParameter ? [lane.activeParameter] : [];
    },

    setLaneHeight: (channelIndex, height) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: '', activeParameters: [], showLane: false, laneHeight: 48, collapsed: false };
        state.channelLanes.set(channelIndex, { ...existing, laneHeight: height });
      }),

    setLaneCollapsed: (channelIndex, collapsed) =>
      set((state) => {
        const existing = state.channelLanes.get(channelIndex) || { activeParameter: '', activeParameters: [], showLane: false, laneHeight: 48, collapsed: false };
        state.channelLanes.set(channelIndex, { ...existing, collapsed });
      }),

    // Copy/paste
    copiedCurvePoints: null,

    copyCurve: (curveId) =>
      set((state) => {
        const curve = state.curves.find(c => c.id === curveId);
        if (curve) {
          state.copiedCurvePoints = [...curve.points];
        }
      }),

    pasteCurve: (patternId, channelIndex, parameter) => {
      const points = get().copiedCurvePoints;
      if (!points || points.length === 0) return;

      const existing = get().curves.find(
        c => c.patternId === patternId && c.channelIndex === channelIndex && c.parameter === parameter
      );

      if (existing) {
        set((s) => {
          const curve = s.curves.find(c => c.id === existing.id);
          if (curve) curve.points = [...points];
          rebuildAutomationIndex(s);
        });
      } else {
        set((s) => {
          s.curves.push({
            id: crypto.randomUUID(),
            patternId,
            channelIndex,
            parameter,
            mode: 'curve',
            interpolation: 'linear',
            points: [...points],
            enabled: true,
          });
          rebuildAutomationIndex(s);
        });
      }
    },

    // Automation recording
    recordMode: false,

    setRecordMode: (enabled) =>
      set((state) => {
        state.recordMode = enabled;
      }),

    recordPoint: (patternId, channelIndex, parameter, row, value) =>
      set((state) => {
        let curve = state.curves.find(
          c => c.patternId === patternId && c.channelIndex === channelIndex && c.parameter === parameter
        );

        if (!curve) {
          const newCurve: AutomationCurve = {
            id: crypto.randomUUID(),
            patternId,
            channelIndex,
            parameter,
            mode: 'curve',
            interpolation: 'linear',
            points: [],
            enabled: true,
          };
          state.curves.push(newCurve);
          curve = state.curves[state.curves.length - 1];
        }

        const existingIdx = curve.points.findIndex(p => p.row === row);
        if (existingIdx >= 0) {
          curve.points[existingIdx].value = value;
        } else {
          curve.points.push({ row, value });
          curve.points.sort((a, b) => a.row - b.row);
        }

        rebuildAutomationIndex(state);
      }),

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
        copiedCurvePoints: null,
        recordMode: false,
      }),
  }))
);
