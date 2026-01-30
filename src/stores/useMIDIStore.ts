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
import { useSettingsStore } from './useSettingsStore';

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

  // MIDI Note Transpose
  midiOctaveOffset: number;  // Octave offset for MIDI notes (-4 to +4)

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

  // MIDI Output - send CC to external hardware (e.g., TD-3-MO)
  sendCC: (cc: number, value: number, channel?: number) => void;
  midiOutputEnabled: boolean;
  setMidiOutputEnabled: (enabled: boolean) => void;

  // MIDI Note Transpose
  setMidiOctaveOffset: (offset: number) => void;
}

// Default TD-3 CC mappings (matches Behringer TD-3/TD-3-MO MIDI implementation)
const DEFAULT_CC_MAPPINGS: CCMapping[] = [
  { ccNumber: 74, parameter: 'cutoff', min: 200, max: 20000, curve: 'logarithmic' },
  { ccNumber: 71, parameter: 'resonance', min: 0, max: 100, curve: 'linear' },
  { ccNumber: 10, parameter: 'envMod', min: 0, max: 100, curve: 'linear' }, // TD-3 sends Env Mod on CC 10
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
      midiOctaveOffset: 0,  // Default: no octave transpose
      showPatternDialog: false,
      midiOutputEnabled: true, // Send CC to external hardware (TD-3-MO, etc.)

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
            console.log('[useMIDIStore] MIDI initialized successfully, adding message handler');

            // Set up message handler for notes and CC
            manager.addMessageHandler((message) => {
              const store = get();

              // Update activity timestamp
              store.updateActivity();

              // Handle Note On messages
              if (message.type === 'noteOn' && message.note !== undefined && message.velocity !== undefined) {
                // Apply octave offset (each octave = 12 semitones)
                const octaveOffset = store.midiOctaveOffset || 0;
                const transposedNote = message.note + (octaveOffset * 12);

                const trackerNote = midiToTrackerNote(transposedNote);
                // Convert tracker format (C-4) to Tone.js format (C4)
                const toneNote = trackerNote.replace('-', '');

                // Get the instrument to play - use previewInstrument if set (for modal previews),
                // otherwise use the currently selected instrument (same as keyboard)
                const instrumentStore = useInstrumentStore.getState();
                const currentId = instrumentStore.currentInstrumentId;
                const selectedInstrument = instrumentStore.instruments.find(i => i.id === currentId);
                const targetInstrument = instrumentStore.previewInstrument ||
                                         selectedInstrument ||
                                         instrumentStore.instruments[0]; // Fall back to first instrument

                // Calculate frequency for debugging
                const freq = 440 * Math.pow(2, (transposedNote - 69) / 12);
                console.log(`[useMIDIStore] NoteOn: MIDI ${message.note} (offset ${octaveOffset}) -> ${toneNote} (${freq.toFixed(1)} Hz), instrument:`, targetInstrument?.name || 'NONE');

                if (targetInstrument) {
                  const engine = getToneEngine();
                  const { midiPolyphonic } = useSettingsStore.getState();

                  // Raw velocity from MIDI (0-127 -> 0-1)
                  const rawVelocity = message.velocity / 127;
                  // Apply square root curve to boost low velocities while preserving dynamics
                  // Also ensure minimum velocity of 0.5 so soft notes are still audible
                  const velocity = Math.max(0.5, Math.sqrt(rawVelocity));

                  activeMidiNotes.set(message.note, toneNote);

                  if (midiPolyphonic) {
                    // POLYPHONIC MODE: Each note gets its own voice channel
                    engine.triggerPolyNoteAttack(targetInstrument.id, toneNote, velocity, targetInstrument);
                  } else {
                    // MONOPHONIC MODE: Release previous notes first
                    if (activeMidiNotes.size > 1) {
                      for (const [midiNote, activeNote] of activeMidiNotes.entries()) {
                        if (midiNote !== message.note) {
                          engine.triggerPolyNoteRelease(targetInstrument.id, activeNote, targetInstrument);
                        }
                      }
                      // Keep only the current note
                      const currentNote = activeMidiNotes.get(message.note);
                      activeMidiNotes.clear();
                      if (currentNote) activeMidiNotes.set(message.note, currentNote);
                    }
                    engine.triggerPolyNoteAttack(targetInstrument.id, toneNote, velocity, targetInstrument);
                  }
                } else {
                  console.warn('[useMIDIStore] No instruments available for MIDI playback');
                }
                return;
              }

              // Handle Note Off messages
              if (message.type === 'noteOff' && message.note !== undefined) {
                const toneNote = activeMidiNotes.get(message.note);
                if (toneNote) {
                  activeMidiNotes.delete(message.note);

                  // Get the instrument for release
                  const instrumentStore = useInstrumentStore.getState();
                  const currentId = instrumentStore.currentInstrumentId;
                  const selectedInstrument = instrumentStore.instruments.find(i => i.id === currentId);
                  const targetInstrument = instrumentStore.previewInstrument ||
                                           selectedInstrument ||
                                           instrumentStore.instruments[0];

                  if (targetInstrument) {
                    const engine = getToneEngine();
                    engine.triggerPolyNoteRelease(targetInstrument.id, toneNote, targetInstrument);
                  }
                }
                return;
              }

              // Handle CC messages
              if (message.type === 'cc' && message.cc !== undefined && message.value !== undefined) {
                // Debug: Log all CC messages to help diagnose TD-3 issues
                console.log(`[MIDI CC] CC ${message.cc} = ${message.value} (ch ${message.channel})`);

                // Check if we're learning
                if (store.isLearning && store.learningParameter) {
                  store.handleLearnedCC(message.cc);
                  return;
                }

                // Find mapping for this CC
                const mapping = store.ccMappings.find((m) => m.ccNumber === message.cc);
                console.log(`[MIDI CC] Mapping for CC ${message.cc}:`, mapping ? mapping.parameter : 'NONE');

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
                    console.log(`[MIDI CC] Calling handler for ${mapping.parameter} with value ${paramValue.toFixed(2)}`);
                    handler(paramValue);
                  } else {
                    console.warn(`[MIDI CC] No handler registered for ${mapping.parameter}`);
                  }
                }
              }
            });

            // Subscribe to device changes
            manager.onDeviceChange(() => {
              get().refreshDevices();
              // Auto-connect to first device if none selected
              const state = get();
              if (!state.selectedInputId && state.inputDevices.length > 0) {
                console.log('[useMIDIStore] Auto-connecting to first MIDI input:', state.inputDevices[0].name);
                get().selectInput(state.inputDevices[0].id);
              }
            });

            // Initial device refresh
            get().refreshDevices();

            // Auto-connect to first available input device
            const currentState = get();
            if (!currentState.selectedInputId && currentState.inputDevices.length > 0) {
              console.log('[useMIDIStore] Auto-connecting to first MIDI input:', currentState.inputDevices[0].name);
              await get().selectInput(currentState.inputDevices[0].id);
            }

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

      // Send CC to external hardware (TD-3-MO, etc.)
      sendCC: (cc, value, channel = 0) => {
        const { midiOutputEnabled } = get();
        if (!midiOutputEnabled) return;

        const manager = getMIDIManager();
        // Clamp value to 0-127
        const clampedValue = Math.max(0, Math.min(127, Math.round(value)));
        manager.sendCC(channel, cc, clampedValue);
      },

      // Enable/disable MIDI output
      setMidiOutputEnabled: (enabled) => {
        set((state) => {
          state.midiOutputEnabled = enabled;
        });
      },

      // Set MIDI octave offset (-4 to +4)
      setMidiOctaveOffset: (offset) => {
        set((state) => {
          state.midiOctaveOffset = Math.max(-4, Math.min(4, offset));
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
        midiOutputEnabled: state.midiOutputEnabled,
        midiOctaveOffset: state.midiOctaveOffset,
      }),
    }
  )
);
