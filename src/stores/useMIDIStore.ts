/**
 * MIDI Store - MIDI device state and CC mappings
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { MIDIDeviceInfo, CCMapping, TB303Parameter, KnobBankMode, MappableParameter, GridMappableParameter, GridMIDIMapping } from '../midi/types';
import { getMIDIManager } from '../midi/MIDIManager';
import { getCCMapManager } from '../midi/CCMapManager';
import { getButtonMapManager } from '../midi/ButtonMapManager';
import { midiToTrackerNote } from '../midi/types';
import { getToneEngine } from '../engine/ToneEngine';
import { useInstrumentStore } from './useInstrumentStore';
import { useSettingsStore } from './useSettingsStore';
import { KNOB_BANKS, JOYSTICK_MAP, getKnobBankForSynth, getKnobAssignmentsForPage, getKnobPageCount, getKnobPageForSection, getKnobPageName } from '../midi/knobBanks';
import type { KnobAssignment } from '../midi/knobBanks';
import { routeParameterToEngine, routeDJParameter, routeDrumPadModulation, isVocoderTalking, routeVocoderModulation } from '../midi/performance/parameterRouter';
import { updateNKSDisplay } from '../midi/performance/AkaiMIDIProtocol';
import type { NKSParameter } from '../midi/performance/types';
import { isDJContext } from '../midi/MIDIContextRouter';
import { DJ_KNOB_BANKS, DJ_KNOB_PAGE_NAMES } from '../midi/djKnobBanks';
import { getDJControllerMapper } from '../midi/DJControllerMapper';
import { getHeldDrumPads } from '../hooks/drumpad/useMIDIPadRouting';
import { midiToXMNote } from '../lib/xmConversions';
import { useUIStore } from './useUIStore';

// Guard against double handler registration (e.g., React StrictMode or HMR)
let midiNoteHandlerRegistered = false;

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
  lastDeviceId: string | null; // Persisted last device for auto-reconnect
  lastDeviceName: string | null; // Persisted device name (IDs change across sessions)

  // CC Mapping
  ccMappings: CCMapping[];
  isLearning: boolean;
  learningParameter: TB303Parameter | null;

  // Activity
  lastActivityTimestamp: number;

  // Knob Control Target
  controlledInstrumentId: number | null;  // Which instrument the knobs control (null = all TB303)
  knobBank: KnobBankMode;
  padBank: 'A' | 'B';

  // NKS2 Knob Paging
  nksKnobAssignments: KnobAssignment[];  // Current 8 knob mappings (active page)
  nksKnobPage: number;                    // Current page (0-indexed)
  nksKnobTotalPages: number;              // Total pages for current synth
  nksActiveSynthType: string | null;       // Synth type currently driving knobs
  activeEditorSection: string | null;      // Currently focused editor tab/section

  // NKS2 Navigation & Light Guide
  nks2Mode: 'performance' | 'edit';       // Current NKS2 display mode
  nks2EditGroupIndex: number;             // Active edit group (0-indexed)
  nks2ScrollOffset: number;               // Scroll position within edit group
  lightGuide: import('../midi/performance/types').NKSKeyLight[];  // Per-key colors

  // MIDI Note Transpose
  midiOctaveOffset: number;  // Octave offset for MIDI notes (-4 to +4)

  // DJ Knob Paging (context-aware routing for DJ mode)
  djKnobPage: number;           // 0 = EQ, 1 = Mixer, 2 = FX
  djKnobTotalPages: number;

  // UI State
  showPatternDialog: boolean;
  showKnobBar: boolean;
  knobValues: Record<string, number>;  // Current values for bank knobs (param → 0-1)

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
  setShowKnobBar: (show: boolean) => void;
  setKnobValue: (param: string, value: number) => void;

  // CC value handlers (set by TB303KnobPanel to receive MIDI CC updates)
  // Note: Using Record instead of Map because immer doesn't handle Map correctly
  registerCCHandler: (parameter: TB303Parameter, handler: (value: number) => void) => void;
  unregisterCCHandler: (parameter: TB303Parameter) => void;

  // Knob control target
  setControlledInstrument: (id: number | null) => void;
  setKnobBank: (bank: KnobBankMode) => void;
  togglePadBank: () => void;
  setPadBank: (bank: 'A' | 'B') => void;

  // NKS2 Knob Paging actions
  syncKnobsToSynth: (synthType: string) => void;
  nextKnobPage: () => void;
  prevKnobPage: () => void;
  setKnobPage: (page: number) => void;
  setActiveEditorSection: (section: string) => void;

  // NKS2 Navigation actions
  setNKS2Mode: (mode: 'performance' | 'edit') => void;
  setNKS2EditGroup: (index: number) => void;
  scrollNKS2: (direction: -1 | 1) => void;
  setLightGuide: (keys: import('../midi/performance/types').NKSKeyLight[]) => void;

  // DJ Knob Paging actions
  setDJKnobPage: (page: number) => void;
  nextDJKnobPage: () => void;
  prevDJKnobPage: () => void;

  // MIDI Output - send CC to external hardware (e.g., TD-3-MO)
  sendCC: (cc: number, value: number, channel?: number) => void;
  midiOutputEnabled: boolean;
  setMidiOutputEnabled: (enabled: boolean) => void;

  // MIDI Note Transpose
  setMidiOctaveOffset: (offset: number) => void;

  // Grid MIDI CC Mappings (consolidated from useMIDIMappingStore)
  gridMappings: Record<string, GridMIDIMapping>;
  gridIsLearning: boolean;
  gridLearningParameter: GridMappableParameter | null;
  addGridMapping: (mapping: GridMIDIMapping) => void;
  removeGridMapping: (channel: number, controller: number) => void;
  getGridMapping: (channel: number, controller: number) => GridMIDIMapping | undefined;
  clearGridMappings: () => void;
  startGridLearning: (parameter: GridMappableParameter) => void;
  stopGridLearning: () => void;
  applyGridMIDIValue: (channel: number, controller: number, value: number) => number | null;
}

// Helper to update parameters from bank CC — delegates to NKS2 parameter router
const updateBankParameter = (param: MappableParameter, value: number) => {
  const normalized = value / 127;
  routeParameterToEngine(param, normalized);
  // Store the value so UI knobs can reflect it
  useMIDIStore.getState().setKnobValue(param, normalized);
};


// Grid MIDI mapping helpers
function getGridMappingKey(channel: number, controller: number): string {
  return `${channel}:${controller}`;
}

function applyGridCurve(value: number, curve: 'linear' | 'exponential' | 'logarithmic' = 'linear'): number {
  const normalized = Math.max(0, Math.min(127, value)) / 127;
  switch (curve) {
    case 'exponential': return Math.pow(normalized, 2);
    case 'logarithmic': return Math.sqrt(normalized);
    default: return normalized;
  }
}

function mapGridValue(midiValue: number, min: number, max: number, curve?: 'linear' | 'exponential' | 'logarithmic'): number {
  return min + applyGridCurve(midiValue, curve) * (max - min);
}

// Default CC mappings. Shipped out-of-the-box so a fresh install has sensible
// CC → parameter routing before the user runs MIDI Learn.
//
// Layout choices:
//   CC 10, 16, 71, 74, 75 — TD-3/TD-3-MO factory defaults (must stay for
//                          backwards compat with Behringer TD-3 owners).
//   CC 20-46              — dub-move triggers/holds (27 moves). Avoids
//                          MIDI-reserved CCs (1 mod, 2 breath, 7 vol,
//                          11 expr, 64 sustain, 120-127 channel mode).
//                          Contiguous block so controllers with adjacent
//                          pads (MPK Mini bank-A/B, Launchkey) can land
//                          one move per pad.
//   CC 47-53              — dub bus continuous params (7 bus settings).
//   CC 54-55              — dub bus enable + REC arm (toggles at 0.5).
//
// Contract test `src/midi/performance/__tests__/dubMovesDefaultCCMappings.test.ts`
// verifies: (1) every DUB_MOVE_KINDS entry has a default, (2) no CC collisions,
// (3) no overlap with the TD-3 block.
const DEFAULT_CC_MAPPINGS: CCMapping[] = [
  // TD-3 factory (unchanged)
  { ccNumber: 74, parameter: 'cutoff', min: 200, max: 20000, curve: 'logarithmic' },
  { ccNumber: 71, parameter: 'resonance', min: 0, max: 100, curve: 'linear' },
  { ccNumber: 10, parameter: 'envMod', min: 0, max: 100, curve: 'linear' },
  { ccNumber: 75, parameter: 'decay', min: 30, max: 3000, curve: 'logarithmic' },

  // Maschine MK2 Controller Editor knobs (CC 14-19, Page 1, ch 1)
  // CC 20-21 are reserved for dub moves below
  { ccNumber: 14, parameter: 'cutoff',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 15, parameter: 'resonance', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 16, parameter: 'envMod',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 17, parameter: 'decay',     min: 0, max: 1, curve: 'linear' },
  { ccNumber: 18, parameter: 'accent',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 19, parameter: 'overdrive', min: 0, max: 1, curve: 'linear' },

  // Maschine MK2 HID bridge encoders (base CC 110, indices 0-14)
  // Mapped to TB303 parameters 1:1 across the 8 main knobs
  { ccNumber: 110, parameter: 'cutoff',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 111, parameter: 'resonance', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 112, parameter: 'envMod',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 113, parameter: 'decay',     min: 0, max: 1, curve: 'linear' },
  { ccNumber: 114, parameter: 'accent',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 115, parameter: 'overdrive', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 116, parameter: 'slideTime', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 117, parameter: 'volume',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 118, parameter: 'tuning',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 119, parameter: 'waveform',  min: 0, max: 1, curve: 'linear' },
  { ccNumber: 120, parameter: 'cutoff',    min: 0, max: 1, curve: 'linear' },

  // Dub moves — 27 global triggers + holds. min/max/curve unused by the
  // dub router (it normalises 0-1 and fires on upward 0.5 crossing), but
  // the CCMapping shape still requires them.
  { ccNumber: 20, parameter: 'dub.echoThrow',         min: 0, max: 1, curve: 'linear' },
  { ccNumber: 21, parameter: 'dub.dubStab',           min: 0, max: 1, curve: 'linear' },
  { ccNumber: 22, parameter: 'dub.channelThrow',      min: 0, max: 1, curve: 'linear' },
  { ccNumber: 23, parameter: 'dub.channelMute',       min: 0, max: 1, curve: 'linear' },
  { ccNumber: 24, parameter: 'dub.springSlam',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 25, parameter: 'dub.filterDrop',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 26, parameter: 'dub.dubSiren',          min: 0, max: 1, curve: 'linear' },
  { ccNumber: 27, parameter: 'dub.tapeWobble',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 28, parameter: 'dub.snareCrack',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 29, parameter: 'dub.delayTimeThrow',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 30, parameter: 'dub.backwardReverb',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 31, parameter: 'dub.masterDrop',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 32, parameter: 'dub.tapeStop',          min: 0, max: 1, curve: 'linear' },
  { ccNumber: 33, parameter: 'dub.transportTapeStop', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 34, parameter: 'dub.toast',             min: 0, max: 1, curve: 'linear' },
  { ccNumber: 35, parameter: 'dub.tubbyScream',       min: 0, max: 1, curve: 'linear' },
  { ccNumber: 36, parameter: 'dub.stereoDoubler',     min: 0, max: 1, curve: 'linear' },
  { ccNumber: 37, parameter: 'dub.reverseEcho',       min: 0, max: 1, curve: 'linear' },
  { ccNumber: 38, parameter: 'dub.sonarPing',         min: 0, max: 1, curve: 'linear' },
  { ccNumber: 39, parameter: 'dub.radioRiser',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 40, parameter: 'dub.subSwell',          min: 0, max: 1, curve: 'linear' },
  { ccNumber: 41, parameter: 'dub.oscBass',           min: 0, max: 1, curve: 'linear' },
  { ccNumber: 42, parameter: 'dub.crushBass',         min: 0, max: 1, curve: 'linear' },
  { ccNumber: 43, parameter: 'dub.subHarmonic',       min: 0, max: 1, curve: 'linear' },
  { ccNumber: 44, parameter: 'dub.echoBuildUp',       min: 0, max: 1, curve: 'linear' },
  { ccNumber: 45, parameter: 'dub.delayPreset380',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 46, parameter: 'dub.delayPresetDotted', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 56, parameter: 'dub.eqSweep',           min: 0, max: 1, curve: 'linear' },
  { ccNumber: 57, parameter: 'dub.springKick',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 58, parameter: 'dub.delayPresetQuarter', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 59, parameter: 'dub.delayPreset8th',     min: 0, max: 1, curve: 'linear' },
  { ccNumber: 60, parameter: 'dub.delayPresetTriplet', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 61, parameter: 'dub.delayPreset16th',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 62, parameter: 'dub.delayPresetDoubler', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 63, parameter: 'dub.ghostReverb',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 66, parameter: 'dub.voltageStarve',     min: 0, max: 1, curve: 'linear' },
  { ccNumber: 67, parameter: 'dub.ringMod',            min: 0, max: 1, curve: 'linear' },
  { ccNumber: 68, parameter: 'dub.hpfRise',            min: 0, max: 1, curve: 'linear' },
  { ccNumber: 69, parameter: 'dub.madProfPingPong',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 70, parameter: 'dub.combSweep',          min: 0, max: 1, curve: 'linear' },
  { ccNumber: 72, parameter: 'dub.versionDrop',        min: 0, max: 1, curve: 'linear' },
  { ccNumber: 73, parameter: 'dub.skankEchoThrow',    min: 0, max: 1, curve: 'linear' },
  { ccNumber: 76, parameter: 'dub.riddimSection',     min: 0, max: 1, curve: 'linear' },

  // Dub bus continuous params — min/max are documentary; the actual
  // normalisation is handled by DUB_BUS_PARAMS transforms in
  // parameterRouter.ts (e.g. echoRateMs derives 40..1000 ms from 0-1).
  { ccNumber: 47, parameter: 'dub.echoIntensity',   min: 0, max: 1, curve: 'linear' },
  { ccNumber: 48, parameter: 'dub.echoWet',         min: 0, max: 1, curve: 'linear' },
  { ccNumber: 49, parameter: 'dub.echoRateMs',      min: 0, max: 1, curve: 'linear' },
  { ccNumber: 50, parameter: 'dub.springWet',       min: 0, max: 1, curve: 'linear' },
  { ccNumber: 51, parameter: 'dub.returnGain',      min: 0, max: 1, curve: 'linear' },
  { ccNumber: 52, parameter: 'dub.hpfCutoff',       min: 0, max: 1, curve: 'linear' },
  { ccNumber: 53, parameter: 'dub.sidechainAmount', min: 0, max: 1, curve: 'linear' },

  // Bus toggles (enable on upward 0.5 crossing, same semantics as moves)
  { ccNumber: 54, parameter: 'dub.enabled', min: 0, max: 1, curve: 'linear' },
  { ccNumber: 55, parameter: 'dub.armed',   min: 0, max: 1, curve: 'linear' },
];

// CC handlers stored outside Zustand state (Map doesn't work well with immer)
const ccHandlersMap = new Map<TB303Parameter, (value: number) => void>();

/** Push DJ knob-bank labels to the Akai MPK Mini LCD for the given page. */
function pushDJLabelsToController(page: number): void {
  const assignments = DJ_KNOB_BANKS[page];
  if (!assignments) return;
  const pageName = DJ_KNOB_PAGE_NAMES[page] ?? `DJ ${page + 1}`;
  const params = assignments.map((a) => ({ id: a.param, name: a.label }) as NKSParameter);
  try {
    updateNKSDisplay(pageName, page, DJ_KNOB_BANKS.length, params);
  } catch (err) {
    console.warn('[MIDI] Failed to push DJ labels to controller:', err);
  }
}

/** Refresh the controller LCD with the current DJ knob-bank labels.
 *  Call from DJView on mount so switching into DJ mode updates the hardware. */
export function refreshDJKnobLabels(): void {
  const state = useMIDIStore.getState();
  pushDJLabelsToController(state.djKnobPage);
}

// Track active MIDI notes for proper release
const activeMidiNotes = new Map<number, string>();

// rAF batch state for setKnobValue — avoids Immer overhead on every MIDI CC frame
let _pendingKnobValues: Record<string, number> = {};
let _knobRaf = 0;

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
      lastDeviceId: null, // Persisted for auto-reconnect
      lastDeviceName: null, // Persisted device name
      ccMappings: [...DEFAULT_CC_MAPPINGS],
      isLearning: false,
      learningParameter: null,
      lastActivityTimestamp: 0,
      controlledInstrumentId: null,  // null = control all TB303 instruments
            knobBank: '303',
            padBank: 'A',
            nksKnobAssignments: [],
            nksKnobPage: 0,
            nksKnobTotalPages: 0,
            nksActiveSynthType: null,
            activeEditorSection: null,
            nks2Mode: 'performance' as const,
            nks2EditGroupIndex: 0,
            nks2ScrollOffset: 0,
            lightGuide: [],
            midiOctaveOffset: 0,
        // Default: no octave transpose
      djKnobPage: 0,
      djKnobTotalPages: DJ_KNOB_BANKS.length,
      showPatternDialog: false,
      showKnobBar: true, // Always visible — shows parameter assignments
      knobValues: {},    // Current knob positions (param → 0-1)
      midiOutputEnabled: true, // Send CC to external hardware (TD-3-MO, etc.)

      // Initialize MIDI
      init: async () => {
        const manager = getMIDIManager();

        if (!manager.isSupported()) {
          // On iOS Safari, Web MIDI API may not be immediately available.
          // Retry once after a brief delay — the API can appear after page fully loads.
          if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            console.log('[useMIDIStore] MIDI not found on iOS, retrying after delay...');
            await new Promise(r => setTimeout(r, 500));
            if (!manager.isSupported()) {
              set((state) => {
                state.isSupported = false;
                state.lastError = 'Web MIDI API not supported — try opening in Safari (not PWA)';
              });
              return false;
            }
          } else {
            set((state) => {
              state.isSupported = false;
              state.lastError = 'Web MIDI API not supported in this browser';
            });
            return false;
          }
        }

        set((state) => {
          state.isSupported = true;
        });

        try {
          const success = await manager.init();

          if (success) {
            // Guard: only register the note/CC handler ONCE
            if (midiNoteHandlerRegistered) {
              // Debug: Intentional guard for React StrictMode double-invocation
              // console.log('[useMIDIStore] MIDI handler already registered — skipping duplicate registration');
            }

            if (!midiNoteHandlerRegistered) {
              midiNoteHandlerRegistered = true;
              console.log('[useMIDIStore] MIDI initialized successfully, adding message handler');

            // Set up message handler for notes and CC
            manager.addMessageHandler((message, deviceId) => {
              const store = get();

              // Update activity timestamp
              store.updateActivity();

              // Handle Note On messages
              if (message.type === 'noteOn' && message.note !== undefined && message.velocity !== undefined) {
                // In DrumPad / DJ / VJ views, ALL notes trigger drum pads (not tracker)
                const activeView = useUIStore.getState().activeView;
                if (activeView === 'drumpad' || activeView === 'dj' || activeView === 'vj') {
                  return; // Skip all tracker note handling in pad views
                }

                // Check if note matches bank switch (Akai MPK Mini Pads: 36, 37, 38, 39)
                if (message.note === 36) { store.setKnobBank('303'); return; }
                if (message.note === 37) { store.setKnobBank('Siren'); return; }
                if (message.note === 38) { store.setKnobBank('FX'); return; }
                if (message.note === 39) { store.setKnobBank('MasterFX'); return; }

                // Pad Bank B: page switching (notes 40-41)
                if (message.note === 40) {
                  if (isDJContext()) { store.prevDJKnobPage(); } else { store.prevKnobPage(); }
                  return;
                }
                if (message.note === 41) {
                  if (isDJContext()) { store.nextDJKnobPage(); } else { store.nextKnobPage(); }
                  return;
                }

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


                if (targetInstrument) {
                  // AUTO-SWITCH BANK: Match knob bank to current synth type
                  const autoBank = getKnobBankForSynth(targetInstrument.synthType);
                  if (autoBank && store.knobBank !== autoBank) {
                    store.setKnobBank(autoBank);
                  }
                  // NKS2: Sync knob assignments + LCD for this synth
                  if (store.nksActiveSynthType !== targetInstrument.synthType) {
                    store.syncKnobsToSynth(targetInstrument.synthType);
                  }

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

                // Step recording: write MIDI note into pattern when in record/edit mode
                try {
                  const trackerStore = require('./useTrackerStore').useTrackerStore.getState();
                  const transportStore = require('./useTransportStore').useTransportStore.getState();

                  if (trackerStore.recordMode && !transportStore.isPlaying) {
                    const xmNote = midiToXMNote(transposedNote);
                    if (xmNote >= 1 && xmNote <= 96) {
                      const { setCell, editStep } = trackerStore;
                      const cursorStore = require('./useCursorStore').useCursorStore.getState();
                      const cursor = cursorStore.cursor;
                      const nci = cursor.noteColumnIndex ?? 0;
                      const instrumentId = targetInstrument?.id ?? instrumentStore.currentInstrumentId ?? 0;
                      // Map velocity to volume column (0-64 in XM convention, stored as 0x10-0x50)
                      const vol = Math.round((message.velocity / 127) * 64);
                      const volumeCol = vol > 0 ? 0x10 + Math.min(vol, 64) : 0;

                      const cellUpdate: Record<string, number> = {};
                      if (nci === 0) {
                        cellUpdate.note = xmNote;
                        cellUpdate.instrument = instrumentId;
                        cellUpdate.volume = volumeCol;
                      } else if (nci === 1) {
                        cellUpdate.note2 = xmNote;
                        cellUpdate.instrument2 = instrumentId;
                        cellUpdate.volume2 = volumeCol;
                      } else if (nci === 2) {
                        cellUpdate.note3 = xmNote;
                        cellUpdate.instrument3 = instrumentId;
                        cellUpdate.volume3 = volumeCol;
                      } else {
                        cellUpdate.note4 = xmNote;
                        cellUpdate.instrument4 = instrumentId;
                        cellUpdate.volume4 = volumeCol;
                      }

                      setCell(cursor.channelIndex, cursor.rowIndex, cellUpdate);

                      // Advance cursor by edit step
                      for (let i = 0; i < editStep; i++) {
                        cursorStore.moveCursor('down');
                      }
                    }
                  }
                } catch {
                  // Tracker store not available — skip step recording
                }

                return;
              }

              // Handle Note Off messages
              if (message.type === 'noteOff' && message.note !== undefined) {
                // In DrumPad / DJ / VJ views, notes 36-43 are routed to drum pads
                const activeView = useUIStore.getState().activeView;
                if ((activeView === 'drumpad' || activeView === 'dj' || activeView === 'vj') && message.note >= 36 && message.note <= 43) {
                  return;
                }

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

              // Handle Pitch Bend (X-axis on MPK Mini joystick)
              if (message.type === 'pitchBend' && message.pitchBend !== undefined) {
                const normalizedPB = (message.pitchBend + 8192) / 16383;

                // Vocoder modulation: if actively talking (PTT held), route joystick to vocoder
                if (isVocoderTalking()) {
                  routeVocoderModulation(normalizedPB, null);
                  return;
                }

                // Drumpad modulation: if ANY pad is held, route joystick to it
                // (works regardless of active view — pads may be triggered from any context)
                {
                  const heldPadsPB = getHeldDrumPads();
                  if (heldPadsPB.length > 0) {
                    routeDrumPadModulation(normalizedPB, null, heldPadsPB);
                    return;
                  }
                }

                // DJ context: pitch bend = crossfader (only when no DJ preset active)
                if (isDJContext() && !getDJControllerMapper().hasActivePreset()) {
                  routeDJParameter('dj.crossfader', normalizedPB);
                  return;
                }
                // Tracker context: joystick mapping
                const joyMap = JOYSTICK_MAP[store.knobBank];
                if (joyMap?.x) {
                  const midiValue = Math.round(normalizedPB * 127);
                  updateBankParameter(joyMap.x.param, midiValue);
                }
                return;
              }

              // Handle CC messages
              if (message.type === 'cc' && message.cc !== undefined && message.value !== undefined) {

                // When a DJ controller preset is active, it handles its own CCs via DJControllerMapper.
                // Skip useMIDIStore routing for CCs that fall in the preset's mapped range.
                // Only bypass for real MIDI devices — Maschine HID uses its own CC range (70+).
                // Layer A: CC 1-25, Layer B: CC 28-52
                if (deviceId !== 'maschine-hid' && getDJControllerMapper().hasActivePreset() && ((message.cc >= 1 && message.cc <= 25) || (message.cc >= 28 && message.cc <= 52))) {
                  return;
                }

                // Handle Mod Wheel (CC 1) -> Y-axis on MPK Mini joystick
                if (message.cc === 1) {
                  const normalizedMW = message.value / 127;

                  // Vocoder modulation: if actively talking (PTT held), route joystick to vocoder
                  if (isVocoderTalking()) {
                    routeVocoderModulation(null, normalizedMW);
                    return;
                  }

                  // Drumpad modulation: if ANY pad is held, route joystick to it
                  {
                    const heldPadsMW = getHeldDrumPads();
                    if (heldPadsMW.length > 0) {
                      routeDrumPadModulation(null, normalizedMW, heldPadsMW);
                      return;
                    }
                  }

                  // DJ context: mod wheel = master filter sweep (only when no DJ preset active)
                  if (isDJContext() && !getDJControllerMapper().hasActivePreset()) {
                    routeDJParameter('dj.deckA.filter', normalizedMW);
                    return;
                  }
                  // Tracker context: joystick mapping
                  const joyMap = JOYSTICK_MAP[store.knobBank];
                  if (joyMap?.y) {
                    updateBankParameter(joyMap.y.param, message.value);
                  }
                }

                // Check if we're learning
                if (store.isLearning && store.learningParameter) {
                  store.handleLearnedCC(message.cc);
                  return;
                }

                // Handle Bank Knobs (CC 70-77)
                if (message.cc >= 70 && message.cc <= 77) {
                  const knobIndex = message.cc - 70;

                  // DJ context: route to DJ knob bank (unless DJControllerMapper preset handles it)
                  if (isDJContext() && !getDJControllerMapper().hasActivePreset()) {
                    const djAssignment = DJ_KNOB_BANKS[store.djKnobPage]?.[knobIndex];
                    if (djAssignment) {
                      routeDJParameter(djAssignment.param, message.value / 127);
                      return;
                    }
                  }

                  // Tracker context: NKS2 dynamic assignments take priority
                  const nksAssignment = store.nksKnobAssignments[knobIndex];
                  if (nksAssignment) {
                    updateBankParameter(nksAssignment.param, message.value);
                    return;
                  }
                  // Legacy fallback
                  const bankAssignments = KNOB_BANKS[store.knobBank];
                  const assignment = bankAssignments.find(a => a.cc === message.cc);
                  if (assignment) {
                    updateBankParameter(assignment.param, message.value);
                    return;
                  }
                }

                // Find mapping for this CC (legacy/manual mapping)
                const mapping = store.ccMappings.find((m) => m.ccNumber === message.cc);

                if (mapping) {
                  // Route through the unified parameter router (same as bank knobs)
                  // This ensures both audio engine AND UI store get updated
                  routeParameterToEngine(mapping.parameter as MappableParameter, message.value / 127);
                }
              }
            });
            } // end midiNoteHandlerRegistered guard

            // Subscribe to device changes
            manager.onDeviceChange(() => {
              const state = get();
              const prevDeviceCount = state.inputDevices.length;
              
              get().refreshDevices();
              
              const newState = get();
              const newDeviceCount = newState.inputDevices.length;
              
              // Device disconnected
              if (newDeviceCount < prevDeviceCount) {
                const disconnectedId = state.selectedInputId;
                if (disconnectedId && !newState.inputDevices.find(d => d.id === disconnectedId)) {
                  import('@/stores/useNotificationStore').then(({ notify }) => {
                    notify.warning('MIDI device disconnected', 3000);
                  });
                }
              }
              
              // Device connected
              if (newDeviceCount > prevDeviceCount) {
                // Try to reconnect to last device by ID or name
                if (!newState.selectedInputId) {
                  const lastDevice = (newState.lastDeviceId && newState.inputDevices.find(d => d.id === newState.lastDeviceId))
                    || (newState.lastDeviceName && newState.inputDevices.find(d => d.name === newState.lastDeviceName));
                  if (lastDevice) {
                    console.log('[useMIDIStore] Reconnecting to last device:', lastDevice.name);
                    get().selectInput(lastDevice.id);
                    import('@/stores/useNotificationStore').then(({ notify }) => {
                      notify.success(`MIDI Reconnected: ${lastDevice.name}`, 3000);
                    });
                    return;
                  }
                }
                
                // Auto-connect: prefer Maschine MK2 (virtual or direct), then any other device
                if (!newState.selectedInputId && newState.inputDevices.length > 0) {
                  const preferred = newState.inputDevices.find(d => d.name?.toLowerCase().includes('maschine mk2 virtual'))
                    ?? newState.inputDevices.find(d => d.name?.toLowerCase().includes('maschine controller mk2'))
                    ?? newState.inputDevices.find(d => !d.name?.toLowerCase().includes('maschine'))
                    ?? newState.inputDevices[0];
                  console.log('[useMIDIStore] Auto-connecting to first MIDI input:', preferred.name);
                  get().selectInput(preferred.id);
                }
              }
              
              // Auto-show knob bar when devices are connected
              set((state) => {
                state.showKnobBar = state.inputDevices.length > 0;
              });
            });

            // Initial device refresh
            get().refreshDevices();

            // Auto-connect: try last device by name first, then prefer Maschine MK2, then any
            const currentState = get();
            if (!currentState.selectedInputId && currentState.inputDevices.length > 0) {
              const lastByName = currentState.lastDeviceName
                ? currentState.inputDevices.find(d => d.name === currentState.lastDeviceName)
                : null;
              const preferred = lastByName
                ?? currentState.inputDevices.find(d => d.name?.toLowerCase().includes('maschine mk2 virtual'))
                ?? currentState.inputDevices.find(d => d.name?.toLowerCase().includes('maschine controller mk2'))
                ?? currentState.inputDevices.find(d => !d.name?.toLowerCase().includes('maschine'))
                ?? currentState.inputDevices[0];
              console.log('[useMIDIStore] Auto-connecting to MIDI input:', preferred.name);
              await get().selectInput(preferred.id);
            }
            
            // Auto-show knob bar if devices are connected
            set((state) => {
              state.showKnobBar = state.inputDevices.length > 0;
            });

            // Initialize CCMapManager for generalized MIDI Learn
            const ccMapManager = getCCMapManager();
            ccMapManager.init();

            // Initialize ButtonMapManager for MIDI button control
            const buttonMapManager = getButtonMapManager();
            buttonMapManager.init();

            // Initialize DJControllerMapper — restores/detects preset from connected device
            getDJControllerMapper().init();

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
          // Remember this device for auto-reconnect
          if (id) {
            state.lastDeviceId = id;
            const device = state.inputDevices.find(d => d.id === id);
            if (device?.name) state.lastDeviceName = device.name;
          }
        });

        // Detect controller profile → update drum pad grid layout
        if (id) {
          const device = get().inputDevices.find(d => d.id === id);
          if (device) {
            import('../midi/controllerProfiles').then(({ detectControllerProfile }) => {
              const profile = detectControllerProfile(device.name);
              if (profile && profile.pads.length > 0) {
                import('./useDrumPadStore').then(({ useDrumPadStore }) => {
                  useDrumPadStore.getState().setControllerPadCount(profile.pads.length);
                  console.log(`[MIDI] Detected ${profile.name}: ${profile.pads.length} pads`);
                });
              }
            });
          }
        }

        // Auto-apply NKS mappings if device selected
        if (id) {
          // Import dynamically to avoid circular dependency
          import('../midi/NKSAutoMapper').then(({ applyNKSMappingsForSynth }) => {
            try {
              // Get current active instrument/synth
              const instrumentStore = useInstrumentStore.getState();
              const currentId = instrumentStore.currentInstrumentId;
              const currentInstrument = instrumentStore.instruments.find(i => i.id === currentId);
              
              if (currentInstrument?.synthType) {
                // Auto-apply NKS CC mappings for current synth
                applyNKSMappingsForSynth(currentInstrument.synthType);
                console.log(`✅ [useMIDIStore] Auto-applied NKS mappings for ${currentInstrument.synthType}`);
              } else {
                // Default to TB-303 if no instrument active
                applyNKSMappingsForSynth('TB303');
                console.log(`✅ [useMIDIStore] Auto-applied default NKS mappings (TB-303)`);
              }
            } catch (err) {
              console.warn('[useMIDIStore] Failed to auto-apply NKS mappings:', err);
            }
          });
        }
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
              parameter: learningParameter as MappableParameter,
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
        const now = Date.now();
        const last = get().lastActivityTimestamp;
        // Only update state once every 100ms to prevent React render loops from rapid MIDI data
        if (now - last > 100) {
          set((state) => {
            state.lastActivityTimestamp = now;
          });
        }
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

      setKnobBank: (bank) =>
        set((state) => {
          state.knobBank = bank;
        }),

      togglePadBank: () =>
        set((state) => {
          state.padBank = state.padBank === 'A' ? 'B' : 'A';
        }),

      setPadBank: (bank) =>
        set((state) => {
          state.padBank = bank;
        }),

      // NKS2 Knob Paging: load page 0 for a synth, update LCD
      syncKnobsToSynth: (synthType) => {
        const assignments = getKnobAssignmentsForPage(synthType as import('../types/instrument').SynthType, 0);
        const totalPages = getKnobPageCount(synthType as import('../types/instrument').SynthType);
        set((state) => {
          state.nksKnobAssignments = assignments;
          state.nksKnobPage = 0;
          state.nksKnobTotalPages = totalPages;
          state.nksActiveSynthType = synthType;
        });
        // Update LCD display
        const displayParams = assignments.map(a => ({ id: a.param, name: a.label }) as NKSParameter);
        updateNKSDisplay(synthType, 0, totalPages, displayParams);
      },

      nextKnobPage: () => {
        const { nksActiveSynthType, nksKnobPage, nksKnobTotalPages } = get();
        if (!nksActiveSynthType || nksKnobTotalPages <= 1) return;
        const nextPage = (nksKnobPage + 1) % nksKnobTotalPages;
        const assignments = getKnobAssignmentsForPage(nksActiveSynthType as import('../types/instrument').SynthType, nextPage);
        const pageName = getKnobPageName(nksActiveSynthType as import('../types/instrument').SynthType, nextPage);
        set((state) => {
          state.nksKnobAssignments = assignments;
          state.nksKnobPage = nextPage;
          state.activeEditorSection = pageName;
        });
        const displayParams = assignments.map(a => ({ id: a.param, name: a.label }) as NKSParameter);
        updateNKSDisplay(nksActiveSynthType, nextPage, nksKnobTotalPages, displayParams);
      },

      prevKnobPage: () => {
        const { nksActiveSynthType, nksKnobPage, nksKnobTotalPages } = get();
        if (!nksActiveSynthType || nksKnobTotalPages <= 1) return;
        const prevPage = (nksKnobPage - 1 + nksKnobTotalPages) % nksKnobTotalPages;
        const assignments = getKnobAssignmentsForPage(nksActiveSynthType as import('../types/instrument').SynthType, prevPage);
        const pageName = getKnobPageName(nksActiveSynthType as import('../types/instrument').SynthType, prevPage);
        set((state) => {
          state.nksKnobAssignments = assignments;
          state.nksKnobPage = prevPage;
          state.activeEditorSection = pageName;
        });
        const displayParams = assignments.map(a => ({ id: a.param, name: a.label }) as NKSParameter);
        updateNKSDisplay(nksActiveSynthType, prevPage, nksKnobTotalPages, displayParams);
      },

      setKnobPage: (page) => {
        const { nksActiveSynthType, nksKnobTotalPages } = get();
        if (!nksActiveSynthType || page < 0 || page >= nksKnobTotalPages) return;
        const assignments = getKnobAssignmentsForPage(nksActiveSynthType as import('../types/instrument').SynthType, page);
        const pageName = getKnobPageName(nksActiveSynthType as import('../types/instrument').SynthType, page);
        set((state) => {
          state.nksKnobAssignments = assignments;
          state.nksKnobPage = page;
          state.activeEditorSection = pageName;
        });
        const displayParams = assignments.map(a => ({ id: a.param, name: a.label }) as NKSParameter);
        updateNKSDisplay(nksActiveSynthType, page, nksKnobTotalPages, displayParams);
      },

      setActiveEditorSection: (section) => {
        const { nksActiveSynthType } = get();
        set((state) => { state.activeEditorSection = section; });
        if (!nksActiveSynthType) return;
        const page = getKnobPageForSection(
          nksActiveSynthType as import('../types/instrument').SynthType,
          section
        );
        if (page >= 0) {
          get().setKnobPage(page);
        }
      },

      // NKS2 Navigation Actions
      setNKS2Mode: (mode: 'performance' | 'edit') => {
        set((state) => {
          state.nks2Mode = mode;
          state.nks2EditGroupIndex = 0;
          state.nks2ScrollOffset = 0;
        });
      },

      setNKS2EditGroup: (index: number) => {
        set((state) => {
          state.nks2EditGroupIndex = index;
          state.nks2ScrollOffset = 0;
        });
      },

      scrollNKS2: (direction: -1 | 1) => {
        set((state) => {
          state.nks2ScrollOffset = Math.max(0, state.nks2ScrollOffset + direction);
        });
      },

      setLightGuide: (keys: import('../midi/performance/types').NKSKeyLight[]) => {
        set((state) => {
          state.lightGuide = keys;
        });
      },

      // DJ Knob Paging
      setDJKnobPage: (page) => {
        if (page < 0 || page >= DJ_KNOB_BANKS.length) return;
        set((state) => {
          state.djKnobPage = page;
        });
        pushDJLabelsToController(page);
      },

      nextDJKnobPage: () => {
        const { djKnobPage } = get();
        const nextPage = (djKnobPage + 1) % DJ_KNOB_BANKS.length;
        set((state) => {
          state.djKnobPage = nextPage;
        });
        pushDJLabelsToController(nextPage);
      },

      prevDJKnobPage: () => {
        const { djKnobPage } = get();
        const prevPage = (djKnobPage - 1 + DJ_KNOB_BANKS.length) % DJ_KNOB_BANKS.length;
        set((state) => {
          state.djKnobPage = prevPage;
        });
        pushDJLabelsToController(prevPage);
      },

      setShowKnobBar: (show) => {
        set((state) => {
          state.showKnobBar = show;
        });
      },

      setKnobValue: (param, value) => {
        // rAF-batched to avoid Immer overhead on every MIDI CC frame
        _pendingKnobValues[param] = value;
        if (!_knobRaf) {
          _knobRaf = requestAnimationFrame(() => {
            _knobRaf = 0;
            const pending = { ..._pendingKnobValues };
            _pendingKnobValues = {};
            set((state) => {
              for (const k in pending) {
                state.knobValues[k] = pending[k];
              }
            });
          });
        }
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

      // Grid MIDI CC Mappings
      gridMappings: {},
      gridIsLearning: false,
      gridLearningParameter: null,

      addGridMapping: (mapping) => {
        if (mapping.channel < 0 || mapping.channel > 15) return;
        if (mapping.controller < 0 || mapping.controller > 127) return;
        if (mapping.min > mapping.max) return;
        set((state) => {
          const key = getGridMappingKey(mapping.channel, mapping.controller);
          state.gridMappings[key] = mapping;
        });
      },

      removeGridMapping: (channel, controller) => {
        set((state) => {
          const key = getGridMappingKey(channel, controller);
          delete state.gridMappings[key];
        });
      },

      getGridMapping: (channel, controller) => {
        const key = getGridMappingKey(channel, controller);
        return get().gridMappings[key];
      },

      clearGridMappings: () => {
        set((state) => {
          state.gridMappings = {};
        });
      },

      startGridLearning: (parameter) => {
        if (get().gridIsLearning) return;
        set((state) => {
          state.gridIsLearning = true;
          state.gridLearningParameter = parameter;
        });
      },

      stopGridLearning: () => {
        set((state) => {
          state.gridIsLearning = false;
          state.gridLearningParameter = null;
        });
      },

      applyGridMIDIValue: (channel, controller, value) => {
        const mapping = get().getGridMapping(channel, controller);
        if (!mapping) return null;
        return mapGridValue(value, mapping.min, mapping.max, mapping.curve);
      },
    })),
    {
      name: 'midi-settings',
      // Only persist mappings and device selections, not handlers or state
      partialize: (state) => ({
        ccMappings: state.ccMappings,
        selectedInputId: state.selectedInputId,
        selectedOutputId: state.selectedOutputId,
        lastDeviceId: state.lastDeviceId, // Persist for auto-reconnect
        lastDeviceName: state.lastDeviceName, // Persist device name (IDs change across sessions)
        controlledInstrumentId: state.controlledInstrumentId,
        knobBank: state.knobBank,
        showKnobBar: state.showKnobBar,
        djKnobPage: state.djKnobPage,
        midiOutputEnabled: state.midiOutputEnabled,
        midiOctaveOffset: state.midiOctaveOffset,
        gridMappings: state.gridMappings,
      }),
    }
  )
);

// ============================================================================
// Auto-sync MIDI knobs to current instrument on instrument selection change.
// This ensures the MIDI controller always maps to whatever instrument the user
// is looking at in the synth editor, not just on MIDI note-on events.
// ============================================================================

// Defer subscription to avoid circular dependency — useInstrumentStore may not
// be initialized yet when this module first loads.
queueMicrotask(() => {
  useInstrumentStore.subscribe((state, prevState) => {
    if (state.currentInstrumentId !== prevState.currentInstrumentId) {
      const instrument = state.instruments.find(i => i.id === state.currentInstrumentId);
      if (!instrument) return;

      // Defer to microtask to avoid triggering pixi-react reconciliation
      // synchronously during bulk instrument loading (e.g. song file import).
      // Without this, the Zustand set() inside syncKnobsToSynth fires pixi-react
      // subscribers mid-load, causing BindingError from stale Node references.
      queueMicrotask(() => {
        const store = useMIDIStore.getState();
        // Auto-switch bank
        const autoBank = getKnobBankForSynth(instrument.synthType);
        if (autoBank && store.knobBank !== autoBank) {
          store.setKnobBank(autoBank);
        }
        // Sync NKS2 knob assignments + pages
        if (store.nksActiveSynthType !== instrument.synthType) {
          store.syncKnobsToSynth(instrument.synthType);
        }
      });
    }
  });
});

