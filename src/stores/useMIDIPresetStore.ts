/**
 * User MIDI Preset Store — persists custom controller mappings
 *
 * Users can override any control's assignment on any controller.
 * Overrides are stored per controller layout ID and merged over
 * factory presets at runtime.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

/** A user-defined assignment for a single control */
export interface ControlAssignment {
  /** 'param' for CC/continuous controls, 'action' for buttons, 'dub' for dub move triggers */
  kind: 'param' | 'action' | 'dub';
  /** Parameter path (e.g. 'dj.crossfader') or action name (e.g. 'play_a') or dub param (e.g. 'dub.echoThrow') */
  target: string;
  /** For CC params: invert the value (1-v) */
  invert?: boolean;
  /** For note params: value on noteOn (default 1) */
  onValue?: number;
  /** For note params: value on noteOff (default 0, null = no noteOff) */
  offValue?: number | null;
}

/** All overrides for one controller */
export type ControllerOverrides = Record<string, ControlAssignment>;

// ============================================================================
// STORE
// ============================================================================

interface MIDIPresetStoreState {
  /** Per-controller overrides: { [layoutId]: { [controlId]: assignment } } */
  overrides: Record<string, ControllerOverrides>;
}

interface MIDIPresetStoreActions {
  /** Set or update an assignment for a specific control */
  setAssignment: (layoutId: string, controlId: string, assignment: ControlAssignment) => void;
  /** Clear a single control's override (reverts to factory) */
  clearAssignment: (layoutId: string, controlId: string) => void;
  /** Clear all overrides for a controller (factory reset) */
  resetController: (layoutId: string) => void;
  /** Clear everything */
  resetAll: () => void;
  /** Get merged overrides for a controller */
  getOverrides: (layoutId: string) => ControllerOverrides;
  /** Import overrides from JSON */
  importOverrides: (layoutId: string, overrides: ControllerOverrides) => void;
  /** Export overrides as JSON-serializable object */
  exportOverrides: (layoutId: string) => ControllerOverrides;
}

type MIDIPresetStore = MIDIPresetStoreState & MIDIPresetStoreActions;

export const useMIDIPresetStore = create<MIDIPresetStore>()(
  persist(
    (set, get) => ({
      overrides: {},

      setAssignment(layoutId, controlId, assignment) {
        set((state) => ({
          overrides: {
            ...state.overrides,
            [layoutId]: {
              ...state.overrides[layoutId],
              [controlId]: assignment,
            },
          },
        }));
      },

      clearAssignment(layoutId, controlId) {
        set((state) => {
          const controllerOverrides = { ...state.overrides[layoutId] };
          delete controllerOverrides[controlId];
          return {
            overrides: {
              ...state.overrides,
              [layoutId]: controllerOverrides,
            },
          };
        });
      },

      resetController(layoutId) {
        set((state) => {
          const newOverrides = { ...state.overrides };
          delete newOverrides[layoutId];
          return { overrides: newOverrides };
        });
      },

      resetAll() {
        set({ overrides: {} });
      },

      getOverrides(layoutId) {
        return get().overrides[layoutId] ?? {};
      },

      importOverrides(layoutId, overrides) {
        set((state) => ({
          overrides: {
            ...state.overrides,
            [layoutId]: overrides,
          },
        }));
      },

      exportOverrides(layoutId) {
        return get().overrides[layoutId] ?? {};
      },
    }),
    {
      name: 'devilbox-midi-presets',
    },
  ),
);
