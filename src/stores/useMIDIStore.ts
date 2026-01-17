/**
 * MIDI Store - MIDI device state and CC mappings
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { MIDIDeviceInfo, CCMapping, TB303Parameter } from '../midi/types';
import { getMIDIManager } from '../midi/MIDIManager';
import { getCCMapManager } from '../midi/CCMapManager';
import { getButtonMapManager } from '../midi/ButtonMapManager';
import { midiToTrackerNote } from '../midi/types';
import { getToneEngine } from '../engine/ToneEngine';
import { useInstrumentStore } from './useInstrumentStore';

interface MIDIStore {
  // Status
  isSupported: boolean | null; // null = not yet checked
  isInitialized: boolean;
  lastError: string | null;

  // Devices
  inputDevices: MIDIDeviceInfo[];
  outputDevices: MIDIDeviceInfo[];
  selectedInputId: string | null;
  selectedOutputId: string | null;

  // CC Mapping
  ccMappings: CCMapping[];
  isLearning: boolean;
  learningParameter: TB303Parameter | null;

  // Activity
  lastActivityTimestamp: number;

  // Knob Control Target
  controlledInstrumentId: number | null;  // Which instrument the knobs control (null = all TB303)

  // UI State
  showPatternDialog: boolean;

  // Actions
  init: () => Promise<boolean>;
  refreshDevices: () => void;
  selectInput: (id: string | null) => Promise<void>;
  selectOutput: (id: string | null) => void;

  // CC Mapping actions
  setMapping: (mapping: CCMapping) => void;
  removeMapping: (ccNumber: number) => void;
  resetMappings: () => void;
  startLearn: (parameter: TB303Parameter) => void;
  cancelLearn: () => void;
  handleLearnedCC: (ccNumber: number) => void;

  // Activity
  updateActivity: () => void;

  // UI Actions
  openPatternDialog: () => void;
  closePatternDialog: () => void;

  // CC value handlers (set by TB303KnobPanel to receive MIDI CC updates)
  // Note: Using Record instead of Map because immer doesn't handle Map correctly
  registerCCHandler: (parameter: TB303Parameter, handler: (value: number) => void) => void;
  unregisterCCHandler: (parameter: TB303Parameter) => void;

  // Knob control target
  setControlledInstrument: (id: number | null) => void;
}

// Default TD-3 CC mappings
const DEFAULT_CC_MAPPINGS: CCMapping[] = [
  { ccNumber: 74, parameter: 'cutoff', min: 200, max: 20000, curve: 'logarithmic' },
  { ccNumber: 71, parameter: 'resonance', min: 0, max: 100, curve: 'linear' },
  { ccNumber: 12, parameter: 'envMod', min: 0, max: 100, curve: 'linear' }, // Changed from 10 to avoid conflict with Pan
  { ccNumber: 75, parameter: 'decay', min: 30, max: 3000, curve: 'logarithmic' },
  { ccNumber: 16, parameter: 'accent', min: 0, max: 100, curve: 'linear' },
];

// CC handlers stored outside Zustand state (Map doesn't work well with immer)
const ccHandlersMap = new Map<TB303Parameter, (value: number) => void>();

// Track active MIDI notes for proper release
const activeMidiNotes = new Map<number, string>();

export const useMIDIStore = create<MIDIStore>()(
  persist(
    immer((set, get) => ({
      // Initial state
      isSupported: null, // null = not yet checked
      isInitialized: false,
      lastError: null,
      inputDevices: [],
      outputDevices: [],
      selectedInputId: null,
      selectedOutputId: null,
      ccMappings: [...DEFAULT_CC_MAPPINGS],
      isLearning: false,
      learningParameter: null,
      lastActivityTimestamp: 0,
      controlledInstrumentId: null,  // null = control all TB303 instruments
      showPatternDialog: false,

      // Initialize MIDI
      init: async () => {
        const manager = getMIDIManager();

        if (!manager.isSupported()) {
          set((state) => {
            state.isSupported = false;
            state.lastError = 'Web MIDI API not supported in this browser';
          });
          return false;
        }

        set((state) => {
          state.isSupported = true;
        });

        try {
          const success = await manager.init();

          if (success) {
            // Set up message handler for notes and CC
            manager.addMessageHandler((message) => {
              const store = get();

              // Update activity timestamp
              store.updateActivity();

              // Handle Note On messages
              if (message.type === 'noteOn' && message.note !== undefined && message.velocity !== undefined) {
                const trackerNote = midiToTrackerNote(message.note);
                // Convert tracker format (C-4) to Tone.js format (C4)
                const toneNote = trackerNote.replace('-', '');

                // Get the instrument to play - use previewInstrument if set (for modal previews),
                // otherwise fall back to currentInstrument
                const instrumentStore = useInstrumentStore.getState();
                const targetInstrument = instrumentStore.previewInstrument || instrumentStore.currentInstrument;

                if (targetInstrument) {
                  activeMidiNotes.set(message.note, toneNote);

                  const engine = getToneEngine();
                  const velocity = message.velocity / 127;
                  engine.triggerNoteAttack(targetInstrument.id, toneNote, 0, velocity, targetInstrument);
                }
                return;
              }

              // Handle Note Off messages
              if (message.type === 'noteOff' && message.note !== undefined) {
                const toneNote = activeMidiNotes.get(message.note);
                if (toneNote) {
                  activeMidiNotes.delete(message.note);

                  // Get the instrument - use previewInstrument if set, otherwise currentInstrument
                  const instrumentStore = useInstrumentStore.getState();
                  const targetInstrument = instrumentStore.previewInstrument || instrumentStore.currentInstrument;

                  if (targetInstrument) {
                    const engine = getToneEngine();
                    engine.triggerNoteRelease(targetInstrument.id, toneNote, 0, targetInstrument);
                  }
                }
                return;
              }

              // Handle CC messages
              if (message.type === 'cc' && message.cc !== undefined && message.value !== undefined) {
                // Check if we're learning
                if (store.isLearning && store.learningParameter) {
                  store.handleLearnedCC(message.cc);
                  return;
                }

                // Find mapping for this CC
                const mapping = store.ccMappings.find((m) => m.ccNumber === message.cc);

                if (mapping) {
                  // Convert CC value (0-127) to parameter range
                  const normalized = message.value / 127;
                  let paramValue: number;

                  if (mapping.curve === 'logarithmic') {
                    // Logarithmic scaling for frequency-like parameters
                    // Guard against log(0) - use minimum of 1 for log calculation
                    const safeMin = Math.max(1, mapping.min);
                    const safeMax = Math.max(safeMin + 1, mapping.max);
                    const logMin = Math.log(safeMin);
                    const logMax = Math.log(safeMax);
                    paramValue = Math.exp(logMin + normalized * (logMax - logMin));
                  } else {
                    // Linear scaling
                    paramValue = mapping.min + normalized * (mapping.max - mapping.min);
                  }

                  // Call registered handler for this parameter (using external Map)
                  const handler = ccHandlersMap.get(mapping.parameter);
                  if (handler) {
                    handler(paramValue);
                  }
                }
              }
            });

            // Subscribe to device changes
            manager.onDeviceChange(() => {
              get().refreshDevices();
            });

            // Initial device refresh
            get().refreshDevices();

            // Initialize CCMapManager for generalized MIDI Learn
            const ccMapManager = getCCMapManager();
            ccMapManager.init();

            // Initialize ButtonMapManager for MIDI button control
            const buttonMapManager = getButtonMapManager();
            buttonMapManager.init();

            set((state) => {
              state.isInitialized = true;
              state.lastError = null;
            });

            return true;
          } else {
            set((state) => {
              state.lastError = 'Failed to initialize MIDI access';
            });
            return false;
          }
        } catch (error) {
          set((state) => {
            state.lastError = error instanceof Error ? error.message : 'Unknown error';
          });
          return false;
        }
      },

      // Refresh device lists
      refreshDevices: () => {
        const manager = getMIDIManager();

        set((state) => {
          state.inputDevices = manager.getInputDevices();
          state.outputDevices = manager.getOutputDevices();

          // Update selected device info
          const selectedInput = manager.getSelectedInput();
          const selectedOutput = manager.getSelectedOutput();

          state.selectedInputId = selectedInput?.id || null;
          state.selectedOutputId = selectedOutput?.id || null;
        });
      },

      // Select input device
      selectInput: async (id) => {
        const manager = getMIDIManager();
        await manager.selectInput(id);

        set((state) => {
          state.selectedInputId = id;
        });
      },

      // Select output device
      selectOutput: (id) => {
        const manager = getMIDIManager();
        manager.selectOutput(id);

        set((state) => {
          state.selectedOutputId = id;
        });
      },

      // Set CC mapping
      setMapping: (mapping) => {
        set((state) => {
          // Remove existing mapping for this CC or parameter
          state.ccMappings = state.ccMappings.filter(
            (m) => m.ccNumber !== mapping.ccNumber && m.parameter !== mapping.parameter
          );
          state.ccMappings.push(mapping);
        });
      },

      // Remove CC mapping
      removeMapping: (ccNumber) => {
        set((state) => {
          state.ccMappings = state.ccMappings.filter((m) => m.ccNumber !== ccNumber);
        });
      },

      // Reset to default mappings
      resetMappings: () => {
        set((state) => {
          state.ccMappings = [...DEFAULT_CC_MAPPINGS];
        });
      },

      // Start MIDI Learn mode
      startLearn: (parameter) => {
        set((state) => {
          state.isLearning = true;
          state.learningParameter = parameter;
        });
      },

      // Cancel MIDI Learn
      cancelLearn: () => {
        set((state) => {
          state.isLearning = false;
          state.learningParameter = null;
        });
      },

      // Handle learned CC
      handleLearnedCC: (ccNumber) => {
        const { learningParameter } = get();
        if (!learningParameter) return;

        // Get default mapping for this parameter or create new one
        const existingDefault = DEFAULT_CC_MAPPINGS.find((m) => m.parameter === learningParameter);
        const mapping: CCMapping = existingDefault
          ? { ...existingDefault, ccNumber }
          : {
              ccNumber,
              parameter: learningParameter,
              min: 0,
              max: 100,
              curve: 'linear',
            };

        set((state) => {
          // Remove any existing mapping for this CC or parameter
          state.ccMappings = state.ccMappings.filter(
            (m) => m.ccNumber !== ccNumber && m.parameter !== learningParameter
          );
          state.ccMappings.push(mapping);
          state.isLearning = false;
          state.learningParameter = null;
        });
      },

      // Update activity timestamp
      updateActivity: () => {
        set((state) => {
          state.lastActivityTimestamp = Date.now();
        });
      },

      // Open pattern dialog
      openPatternDialog: () => {
        set((state) => {
          state.showPatternDialog = true;
        });
      },

      // Close pattern dialog
      closePatternDialog: () => {
        set((state) => {
          state.showPatternDialog = false;
        });
      },

      // Register CC handler for parameter (uses external Map, not state)
      registerCCHandler: (parameter, handler) => {
        ccHandlersMap.set(parameter, handler);
      },

      // Unregister CC handler (uses external Map, not state)
      unregisterCCHandler: (parameter) => {
        ccHandlersMap.delete(parameter);
      },

      // Set which instrument the knobs control
      setControlledInstrument: (id) => {
        set((state) => {
          state.controlledInstrumentId = id;
        });
      },
    })),
    {
      name: 'midi-settings',
      // Only persist mappings and device selections, not handlers or state
      partialize: (state) => ({
        ccMappings: state.ccMappings,
        selectedInputId: state.selectedInputId,
        selectedOutputId: state.selectedOutputId,
        controlledInstrumentId: state.controlledInstrumentId,
      }),
    }
  )
);
