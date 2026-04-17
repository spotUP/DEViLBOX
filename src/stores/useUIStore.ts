/**
 * UI Store - Panel Visibility, UI State
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { PanelType } from '@typedefs/project';

export type PerformanceQuality = 'high' | 'medium' | 'low';

export type TrackerViewMode = 'tracker' | 'grid' | 'sunvox' | 'dj' | 'drumpad' | 'vj';

export type DialogCommand =
  | 'interpolate-volume'
  | 'interpolate-effect'
  | 'humanize'
  | 'find-replace'
  | 'groove-settings'
  | 'scale-volume-block'
  | 'scale-volume-track'
  | 'scale-volume-pattern'
  | 'keyboard-help'
  | 'tempo-tap'
  | 'advanced-edit'
  | 'fade-volume'
  | 'strum'
  | 'effect-picker'
  | 'undo-history'
  | 'automation'
  | 'collaboration'
  | 'randomize'
  | 'acid-pattern'
  | 'pattern-length';

/** Snapshot of panel visibility for layout presets */
export interface LayoutPreset {
  name: string;
  showInstrumentPanel: boolean;
  showAutomationLanes: boolean;
  showMacroLanes: boolean;
  oscilloscopeVisible: boolean;
  editorFullscreen: boolean;
  trackerViewMode: TrackerViewMode;
}

interface UIStore {
  // State
  visiblePanels: PanelType[];
  trackerZoom: number; // 80-200%
  trackWidthZoom: number; // 0=narrowest (more channels), 6=widest (fewer channels)
  activePanel: PanelType;
  modalOpen: string | null;
  modalData: Record<string, unknown> | null;
  showPatterns: boolean;
  editorFullscreen: boolean;
  showAutomationLanes: boolean;
  showMacroLanes: boolean;
  showMacroSlots: boolean;
  patternEditorScrollLeft: number; // Horizontal scroll offset shared with automation lanes
  sidebarCollapsed: boolean;
  useHexNumbers: boolean; // Display numbers in hex (true) or decimal (false)
  rowHighlightInterval: number; // Every N rows gets highlight (default 4, FT2 style)
  rowSecondaryHighlightInterval: number; // Every M rows gets stronger highlight (bar, default 16)
  showBeatLabels: boolean; // Show beat.tick labels alongside row numbers
  chordEntryMode: boolean; // Chord entry: spread notes across channels
  blankEmptyCells: boolean; // Hide ---, .., ... etc. for clean pattern view

  // Responsive layout state
  knobPanelCollapsed: boolean;
  scCollapsed: boolean;
  cmiCollapsed: boolean;
  oscilloscopeVisible: boolean;
  autoCompactApplied: boolean; // Track if we've already auto-compacted this session
  showSamplePackModal: boolean;
  showNewInstrumentBrowser: boolean;
  uiVersion: number; // Track UI migrations

  // Performance settings
  performanceQuality: PerformanceQuality; // Auto-adjusted based on FPS

  // Scratch settings
  scratchEnabled: boolean; // Manual scratch toggle (true = always enabled, false = only during playback)
  scratchAcceleration: boolean; // Scroll acceleration for scratch (true = smoothed, false = raw 1:1)
  platterMass: number; // Turntable platter mass 0-1 (0=CDJ light, 0.5=Technics 1200, 1=heavy)

  activeView: 'tracker' | 'dj' | 'drumpad' | 'vj';

  // Tracker sub-view state (shared between DOM and GL renderers)
  trackerViewMode: TrackerViewMode;
  gridChannelIndex: number;
  showInstrumentPanel: boolean;

  // View Exposé (macOS Mission Control style view switcher)
  viewExposeActive: boolean;
  viewExposeSelectedIdx: number;

  // Pop-out window state
  instrumentEditorPoppedOut: boolean;
  hardwareUiPoppedOut: boolean;
  masterEffectsPoppedOut: boolean;
  instrumentEffectsPoppedOut: boolean;
  oscilloscopePoppedOut: boolean;
  vjPoppedOut: boolean;
  patternEditorPoppedOut: boolean;

  // Transient UI state (not persisted)
  statusMessage: string;
  prevStatusMessage: string;
  pendingModuleFile: File | null;  // Module file pending import (set by drag-drop, consumed by TrackerView)
  pendingCompanionFiles: File[];   // Companion files for multi-file formats (e.g. SMUS instruments)
  pendingAudioFile: File | null;   // Audio sample file pending import (adds sampler instrument)
  pendingTD3File: File | null;     // TD-3 pattern file pending import (.sqs/.seq)
  pendingSunVoxFile: File | null;  // SunVox file pending import (.sunsynth / .sunvox)
  jingleActive: boolean;           // Startup jingle is playing
  postJingleActive: boolean;       // Jingle just ended — switch visualizer to logo mode

  // Layout presets (1-4)
  layoutPresets: (LayoutPreset | null)[];
  activeLayoutPreset: number | null;

  // Actions
  togglePanel: (panel: PanelType) => void;
  setActivePanel: (panel: PanelType) => void;
  setTrackerZoom: (zoom: number) => void;
  increaseTrackZoom: () => void;
  decreaseTrackZoom: () => void;
  openModal: (modalId: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  togglePatterns: () => void;
  toggleEditorFullscreen: () => void;
  toggleAutomationLanes: () => void;
  toggleMacroLanes: () => void;
  toggleMacroSlots: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setUseHexNumbers: (useHex: boolean) => void;
  setRowHighlightInterval: (interval: number) => void;
  toggleBeatLabels: () => void;
  toggleChordEntryMode: () => void;
  setBlankEmptyCells: (blank: boolean) => void;
  setStatusMessage: (msg: string, carry?: boolean, timeout?: number) => void;

  // Responsive layout actions
  toggleKnobPanelCollapsed: () => void;
  setKnobPanelCollapsed: (collapsed: boolean) => void;
  toggleSCCollapsed: () => void;
  setSCCollapsed: (collapsed: boolean) => void;
  toggleCMICollapsed: () => void;
  setCMICollapsed: (collapsed: boolean) => void;
  toggleOscilloscopeVisible: () => void;
  setOscilloscopeVisible: (visible: boolean) => void;
  applyAutoCompact: () => void; // Auto-collapse panels on small screens
  setShowSamplePackModal: (show: boolean) => void;
  setShowNewInstrumentBrowser: (show: boolean) => void;

  // Performance actions
  setPerformanceQuality: (quality: PerformanceQuality) => void;

  // Scratch actions
  setScratchEnabled: (enabled: boolean) => void;
  setScratchAcceleration: (enabled: boolean) => void;
  setPlatterMass: (mass: number) => void;

  // View switching actions
  setActiveView: (view: 'tracker' | 'dj' | 'drumpad' | 'vj') => void;
  toggleActiveView: () => void;

  // Tracker sub-view actions
  setTrackerViewMode: (mode: TrackerViewMode) => void;
  setGridChannelIndex: (index: number) => void;
  setShowInstrumentPanel: (show: boolean) => void;
  toggleInstrumentPanel: () => void;

  // View Exposé actions
  toggleViewExpose: () => void;
  setViewExposeActive: (active: boolean) => void;
  setViewExposeSelectedIdx: (idx: number) => void;

  // Pop-out window actions
  setInstrumentEditorPoppedOut: (v: boolean) => void;
  setHardwareUiPoppedOut: (v: boolean) => void;
  setMasterEffectsPoppedOut: (v: boolean) => void;
  setInstrumentEffectsPoppedOut: (v: boolean) => void;
  setOscilloscopePoppedOut: (v: boolean) => void;
  setVJPoppedOut: (v: boolean) => void;
  setPatternEditorPoppedOut: (v: boolean) => void;

  // Module import actions
  setPendingModuleFile: (file: File | null) => void;
  setPendingCompanionFiles: (files: File[]) => void;
  setPendingAudioFile: (file: File | null) => void;
  setPendingTD3File: (file: File | null) => void;
  setPendingSunVoxFile: (file: File | null) => void;

  // Jingle action
  setJingleActive: (v: boolean) => void;
  setPostJingleActive: (v: boolean) => void;

  // Layout preset actions
  saveLayoutPreset: (slot: number, name?: string) => void;
  loadLayoutPreset: (slot: number) => void;

  // Dialog command (keyboard → dialog bridge)
  dialogOpen: DialogCommand | null;
  showFileBrowser: boolean;
  showChannelNames: boolean;

  // Non-editable song dialog
  nonEditableDialogOpen: boolean;
  openNonEditableDialog: () => void;
  closeNonEditableDialog: () => void;

  // New Song Wizard
  newSongWizardOpen: boolean;
  openNewSongWizard: () => void;
  closeNewSongWizard: () => void;

  // Active system preset (drives instrument filtering)
  activeSystemPreset: string | null;
  setActiveSystemPreset: (id: string | null) => void;

  // Dialog bridge actions
  openDialogCommand: (dialog: DialogCommand) => void;
  closeDialogCommand: () => void;
  setShowFileBrowser: (show: boolean) => void;
  toggleChannelNames: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    immer((set) => ({
      // Initial state
      visiblePanels: ['tracker', 'oscilloscope', 'pattern-list'],
      trackerZoom: 100,
      trackWidthZoom: 3,
      activePanel: 'tracker',
      modalOpen: null,
      modalData: null,
      showPatterns: false,
      editorFullscreen: false,
      showAutomationLanes: false,
      showMacroLanes: false,
      showMacroSlots: false,
      patternEditorScrollLeft: 0,
      sidebarCollapsed: false,
      useHexNumbers: true, // Default to hex numbers (FT2 style)
      rowHighlightInterval: 4, // Highlight every 4th row (FT2 default)
      rowSecondaryHighlightInterval: 16, // Stronger highlight every 16th row (bar lines)
      showBeatLabels: false, // Beat labels off by default
      chordEntryMode: false, // Chord entry off by default
      blankEmptyCells: false, // Show ---, .., ... by default

      // Responsive layout state (default to expanded/visible)
      knobPanelCollapsed: true, // TB-303 panel ALWAYS collapsed by default
      scCollapsed: true, // SC panel collapsed by default
      cmiCollapsed: false, // CMI panel expanded by default to show rich editor
      oscilloscopeVisible: true,
      autoCompactApplied: false,
      showSamplePackModal: false,
      showNewInstrumentBrowser: false,
      uiVersion: 8, // Start at v8 to ensure migration runs

      // Performance settings (default to high quality)
      performanceQuality: 'high',

      // Scratch settings
      scratchEnabled: false, // Manual toggle off by default (scratch only during playback)
      scratchAcceleration: true, // Acceleration on by default
      platterMass: 0.5, // Technics 1200 default

      // View switching
      activeView: 'tracker' as const,

      // Tracker sub-view state
      trackerViewMode: 'tracker' as TrackerViewMode,
      gridChannelIndex: 0,
      showInstrumentPanel: true,

      // Layout presets
      layoutPresets: [null, null, null, null],
      activeLayoutPreset: null,

      // View Exposé
      viewExposeActive: false,
      viewExposeSelectedIdx: 0,

      // Pop-out window state
      instrumentEditorPoppedOut: false,
      hardwareUiPoppedOut: false,
      masterEffectsPoppedOut: false,
      instrumentEffectsPoppedOut: false,
      oscilloscopePoppedOut: false,
      vjPoppedOut: false,
      patternEditorPoppedOut: false,

      // Transient state
      statusMessage: 'All Right',
      prevStatusMessage: 'All Right',
      pendingModuleFile: null,
      pendingCompanionFiles: [],
      pendingAudioFile: null,
      pendingTD3File: null,
      pendingSunVoxFile: null,
      jingleActive: false,
      postJingleActive: false,

      // Dialog bridge (keyboard → dialog)
      dialogOpen: null,
      showFileBrowser: false,
      showChannelNames: true,

      // Non-editable song dialog
      nonEditableDialogOpen: false,

      // New Song Wizard
      newSongWizardOpen: false,

      // Active system preset
      activeSystemPreset: null,

      // Actions
      togglePanel: (panel) =>
        set((state) => {
          const index = state.visiblePanels.indexOf(panel);
          if (index !== -1) {
            state.visiblePanels.splice(index, 1);
          } else {
            state.visiblePanels.push(panel);
          }
        }),

      setActivePanel: (panel) =>
        set((state) => {
          state.activePanel = panel;
          if (!state.visiblePanels.includes(panel)) {
            state.visiblePanels.push(panel);
          }
        }),

      setTrackerZoom: (zoom) =>
        set((state) => {
          // Clamp between 80-200%
          state.trackerZoom = Math.max(80, Math.min(200, zoom));
        }),

      increaseTrackZoom: () =>
        set((state) => { state.trackWidthZoom = Math.min(6, state.trackWidthZoom + 1); }),

      decreaseTrackZoom: () =>
        set((state) => { state.trackWidthZoom = Math.max(0, state.trackWidthZoom - 1); }),

      openModal: (modalId, data) =>
        set((state) => {
          state.modalOpen = modalId;
          state.modalData = data ?? null;
        }),

      closeModal: () =>
        set((state) => {
          state.modalOpen = null;
          state.modalData = null;
        }),

      togglePatterns: () =>
        set((state) => {
          state.showPatterns = !state.showPatterns;
        }),

      toggleEditorFullscreen: () =>
        set((state) => {
          state.editorFullscreen = !state.editorFullscreen;
        }),

      toggleAutomationLanes: () =>
        set((state) => {
          state.showAutomationLanes = !state.showAutomationLanes;
        }),

      toggleMacroLanes: () =>
        set((state) => {
          state.showMacroLanes = !state.showMacroLanes;
        }),

      toggleMacroSlots: () =>
        set((state) => {
          state.showMacroSlots = !state.showMacroSlots;
        }),

      toggleSidebar: () =>
        set((state) => {
          state.sidebarCollapsed = !state.sidebarCollapsed;
        }),

      setSidebarCollapsed: (collapsed) =>
        set((state) => {
          state.sidebarCollapsed = collapsed;
        }),

      setUseHexNumbers: (useHex) =>
        set((state) => {
          state.useHexNumbers = useHex;
        }),

      setRowHighlightInterval: (interval) =>
        set((state) => {
          state.rowHighlightInterval = Math.max(1, Math.min(32, interval));
        }),

      toggleBeatLabels: () =>
        set((state) => {
          state.showBeatLabels = !state.showBeatLabels;
        }),

      toggleChordEntryMode: () =>
        set((state) => {
          state.chordEntryMode = !state.chordEntryMode;
        }),

      setBlankEmptyCells: (blank) =>
        set((state) => {
          state.blankEmptyCells = blank;
        }),

      setStatusMessage: (msg, carry = false, timeout = 2000) =>
        set((state) => {
          if (carry) {
            state.prevStatusMessage = msg;
          }
          state.statusMessage = msg;

          // Always cancel any pending auto-revert timer when a new message is set,
          // so a previous timed message can't silently overwrite live progress updates.
          const win = window as unknown as Record<string, unknown>;
          if (win._statusTimeout) {
            clearTimeout(win._statusTimeout as ReturnType<typeof setTimeout>);
            win._statusTimeout = null;
          }

          if (timeout > 0) {
            win._statusTimeout = setTimeout(() => {
              // We need to use the store's set method directly here as we're in a timeout
              const prevMsg = useUIStore.getState().prevStatusMessage;
              useUIStore.getState().setStatusMessage(prevMsg || 'All Right', false, 0);
              win._statusTimeout = null;
            }, timeout);
          }
        }),

      // Responsive layout actions
      toggleKnobPanelCollapsed: () =>
        set((state) => {
          state.knobPanelCollapsed = !state.knobPanelCollapsed;
        }),

      setKnobPanelCollapsed: (collapsed) =>
        set((state) => {
          state.knobPanelCollapsed = collapsed;
        }),

      toggleSCCollapsed: () =>
        set((state) => {
          state.scCollapsed = !state.scCollapsed;
        }),

      setSCCollapsed: (collapsed) =>
        set((state) => {
          state.scCollapsed = collapsed;
        }),

      toggleCMICollapsed: () =>
        set((state) => {
          state.cmiCollapsed = !state.cmiCollapsed;
        }),

      setCMICollapsed: (collapsed) =>
        set((state) => {
          state.cmiCollapsed = collapsed;
        }),

      toggleOscilloscopeVisible: () =>
        set((state) => {
          state.oscilloscopeVisible = !state.oscilloscopeVisible;
        }),

      setOscilloscopeVisible: (visible) =>
        set((state) => {
          state.oscilloscopeVisible = visible;
        }),

      applyAutoCompact: () =>
        set((state) => {
          const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

          // Version 4: FT2 toolbar expanded by default
          // Version 5: TB-303 panel expanded by default (was)
          // Version 6: TB-303 panel collapsed by default
          // Version 7: Force TB-303 collapsed even if already at v6
          // Version 8: Nuclear option - force collapse no matter what
          if (state.uiVersion < 8) {
            state.uiVersion = 8;
            state.knobPanelCollapsed = true; // FORCE collapse TB-303 panel
          }

          // Only apply once per session
          if (state.autoCompactApplied) return;
          state.autoCompactApplied = true;

          // If screen height is less than 800px, also hide oscilloscope
          if (screenHeight < 800) {
            state.oscilloscopeVisible = false;
          }
        }),

      setShowSamplePackModal: (show) =>
        set((state) => {
          state.showSamplePackModal = show;
        }),

      setShowNewInstrumentBrowser: (show) =>
        set((state) => {
          state.showNewInstrumentBrowser = show;
        }),

      // Performance actions
      setPerformanceQuality: (quality) =>
        set((state) => {
          state.performanceQuality = quality;
        }),

      // Scratch actions
      setScratchEnabled: (enabled) =>
        set((state) => {
          state.scratchEnabled = enabled;
        }),

      setScratchAcceleration: (enabled) =>
        set((state) => {
          state.scratchAcceleration = enabled;
        }),

      setPlatterMass: (mass) =>
        set((state) => {
          state.platterMass = Math.max(0, Math.min(1, mass));
        }),

      // View switching actions
      setActiveView: (view) =>
        set((state) => {
          const prev = state.activeView;
          state.activeView = view;

          // Mutual exclusion: stop tracker when entering DJ, stop DJ when leaving DJ
          if (view === 'dj' && prev !== 'dj') {
            // Defer to avoid calling engine mid-store-update
            setTimeout(() => {
              try {
                const { useTransportStore } = require('@stores/useTransportStore');
                const { getTrackerReplayer } = require('@engine/TrackerReplayer');
                const { getToneEngine } = require('@engine/ToneEngine');
                const transport = useTransportStore.getState();
                if (transport.isPlaying) {
                  getTrackerReplayer().stop();
                  transport.stop();
                  getToneEngine().stop();
                }
              } catch { /* not ready */ }
            }, 0);
          } else if (prev === 'dj' && view !== 'dj' && view !== 'vj' && view !== 'drumpad') {
            setTimeout(() => {
              try {
                const { useDJStore } = require('@stores/useDJStore');
                const djStore = useDJStore.getState();
                // NEVER stop decks if auto DJ is running — catastrophic at a gig
                const autoDJActive = djStore.autoDJEnabled && djStore.autoDJStatus !== 'idle';
                if (autoDJActive) return;

                const { getDJEngineIfActive } = require('@engine/dj/DJEngine');
                const djEngine = getDJEngineIfActive();
                for (const deckId of ['A', 'B', 'C'] as const) {
                  if (djStore.decks[deckId].isPlaying) {
                    djStore.setDeckPlaying(deckId, false);
                    try { djEngine?.getDeck(deckId).stop(); } catch { /* */ }
                  }
                }
              } catch { /* not ready */ }
            }, 0);
          }
        }),

      toggleActiveView: () =>
        set((state) => {
          state.activeView = state.activeView === 'tracker' ? 'dj' : 'tracker';
        }),

      // Tracker sub-view actions
      setTrackerViewMode: (mode) =>
        set((state) => { state.trackerViewMode = mode; }),
      setGridChannelIndex: (index) =>
        set((state) => { state.gridChannelIndex = index; }),
      setShowInstrumentPanel: (show) =>
        set((state) => { state.showInstrumentPanel = show; }),
      toggleInstrumentPanel: () =>
        set((state) => { state.showInstrumentPanel = !state.showInstrumentPanel; }),

      // View Exposé actions
      toggleViewExpose: () =>
        set((state) => {
          state.viewExposeActive = !state.viewExposeActive;
          if (state.viewExposeActive) {
            // Pre-select current view when opening
            const EXPOSE_VIEWS = ['tracker', 'dj', 'vj'];
            const idx = EXPOSE_VIEWS.indexOf(state.activeView);
            state.viewExposeSelectedIdx = idx >= 0 ? idx : 0;
          }
        }),

      setViewExposeActive: (active) =>
        set((state) => { state.viewExposeActive = active; }),

      setViewExposeSelectedIdx: (idx) =>
        set((state) => { state.viewExposeSelectedIdx = idx; }),

      // Pop-out window actions
      setInstrumentEditorPoppedOut: (v) =>
        set((state) => {
          state.instrumentEditorPoppedOut = v;
        }),

      setHardwareUiPoppedOut: (v: boolean) =>
        set((state) => {
          state.hardwareUiPoppedOut = v;
        }),

      setMasterEffectsPoppedOut: (v) =>
        set((state) => {
          state.masterEffectsPoppedOut = v;
        }),

      setInstrumentEffectsPoppedOut: (v) =>
        set((state) => {
          state.instrumentEffectsPoppedOut = v;
        }),

      setOscilloscopePoppedOut: (v) =>
        set((state) => {
          state.oscilloscopePoppedOut = v;
        }),

      setVJPoppedOut: (v) =>
        set((state) => {
          state.vjPoppedOut = v;
        }),

      setPatternEditorPoppedOut: (v) =>
        set((state) => {
          state.patternEditorPoppedOut = v;
        }),

      // Module import actions
      setPendingModuleFile: (file) =>
        set((state) => {
          state.pendingModuleFile = file;
        }),
      setPendingCompanionFiles: (files) =>
        set((state) => {
          state.pendingCompanionFiles = files;
        }),
      setPendingAudioFile: (file) =>
        set((state) => {
          state.pendingAudioFile = file;
        }),
      setPendingTD3File: (file) =>
        set((state) => {
          state.pendingTD3File = file;
        }),
      setPendingSunVoxFile: (file) =>
        set((state) => {
          state.pendingSunVoxFile = file;
        }),

      setJingleActive: (v) =>
        set((state) => {
          state.jingleActive = v;
        }),

      setPostJingleActive: (v) =>
        set((state) => {
          state.postJingleActive = v;
        }),

      // Layout preset actions
      saveLayoutPreset: (slot, name) =>
        set((state) => {
          state.layoutPresets[slot] = {
            name: name || `Layout ${slot + 1}`,
            showInstrumentPanel: state.showInstrumentPanel,
            showAutomationLanes: state.showAutomationLanes,
            showMacroLanes: state.showMacroLanes,
            oscilloscopeVisible: state.oscilloscopeVisible,
            editorFullscreen: state.editorFullscreen,
            trackerViewMode: state.trackerViewMode,
          };
          state.activeLayoutPreset = slot;
        }),

      loadLayoutPreset: (slot) =>
        set((state) => {
          const preset = state.layoutPresets[slot];
          if (!preset) return;
          state.showInstrumentPanel = preset.showInstrumentPanel;
          state.showAutomationLanes = preset.showAutomationLanes;
          state.showMacroLanes = preset.showMacroLanes;
          state.oscilloscopeVisible = preset.oscilloscopeVisible;
          state.editorFullscreen = preset.editorFullscreen;
          state.trackerViewMode = preset.trackerViewMode;
          state.activeLayoutPreset = slot;
        }),

      // Non-editable song dialog actions
      openNonEditableDialog: () =>
        set((state) => { state.nonEditableDialogOpen = true; }),
      closeNonEditableDialog: () =>
        set((state) => { state.nonEditableDialogOpen = false; }),

      // New Song Wizard actions
      openNewSongWizard: () =>
        set((state) => { state.newSongWizardOpen = true; }),
      closeNewSongWizard: () =>
        set((state) => { state.newSongWizardOpen = false; }),

      // Active system preset actions
      setActiveSystemPreset: (id) =>
        set((state) => { state.activeSystemPreset = id; }),

      // Dialog bridge actions
      openDialogCommand: (dialog) =>
        set((state) => { state.dialogOpen = dialog; }),

      closeDialogCommand: () =>
        set((state) => { state.dialogOpen = null; }),

      setShowFileBrowser: (show) =>
        set((state) => { state.showFileBrowser = show; }),

      toggleChannelNames: () =>
        set((state) => { state.showChannelNames = !state.showChannelNames; }),
    })),
    {
      name: 'devilbox-ui-settings',
      version: 1,
      migrate: (persistedState) => persistedState ?? {},
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Record<string, unknown>) };
        // Validate activeView — reset to 'tracker' if persisted value is invalid
        const validViews = ['tracker', 'dj', 'drumpad', 'vj'];
        if (merged.activeView && !validViews.includes(merged.activeView as string)) {
          console.warn(`[useUIStore] Invalid persisted activeView "${merged.activeView}", resetting to "tracker"`);
          merged.activeView = 'tracker';
        }
        return merged;
      },
      partialize: (state) => ({
        // Only persist layout preferences, not transient UI state
        showPatterns: state.showPatterns,
        showAutomationLanes: state.showAutomationLanes,
        showMacroLanes: state.showMacroLanes,
        showMacroSlots: state.showMacroSlots,
        knobPanelCollapsed: state.knobPanelCollapsed,
        scCollapsed: state.scCollapsed,
        cmiCollapsed: state.cmiCollapsed,
        oscilloscopeVisible: state.oscilloscopeVisible,
        sidebarCollapsed: state.sidebarCollapsed,
        trackerZoom: state.trackerZoom,
        trackWidthZoom: state.trackWidthZoom,
        useHexNumbers: state.useHexNumbers,
        rowHighlightInterval: state.rowHighlightInterval,
        showBeatLabels: state.showBeatLabels,
        chordEntryMode: state.chordEntryMode,
        blankEmptyCells: state.blankEmptyCells,
        performanceQuality: state.performanceQuality,
        scratchEnabled: state.scratchEnabled,
        scratchAcceleration: state.scratchAcceleration,
        platterMass: state.platterMass,
        activeView: state.activeView,
        trackerViewMode: state.trackerViewMode,
        gridChannelIndex: state.gridChannelIndex,
        showInstrumentPanel: state.showInstrumentPanel,
        layoutPresets: state.layoutPresets,
        activeLayoutPreset: state.activeLayoutPreset,
        uiVersion: state.uiVersion,
      }),
    }
  )
);
