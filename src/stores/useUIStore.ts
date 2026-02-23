/**
 * UI Store - Panel Visibility, UI State
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { PanelType } from '@typedefs/project';

export type PerformanceQuality = 'high' | 'medium' | 'low';

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
  | 'pattern-matrix'
  | 'automation'
  | 'collaboration'
  | 'randomize'
  | 'acid-pattern';

interface UIStore {
  // State
  visiblePanels: PanelType[];
  trackerZoom: number; // 80-200%
  activePanel: PanelType;
  modalOpen: string | null;
  modalData: Record<string, unknown> | null;
  showPatterns: boolean;
  showAutomationLanes: boolean;
  showMacroLanes: boolean;
  showMacroSlots: boolean;
  sidebarCollapsed: boolean;
  useHexNumbers: boolean; // Display numbers in hex (true) or decimal (false)
  rowHighlightInterval: number; // Every N rows gets highlight (default 4, FT2 style)
  showBeatLabels: boolean; // Show beat.tick labels alongside row numbers
  chordEntryMode: boolean; // Chord entry: spread notes across channels
  blankEmptyCells: boolean; // Hide ---, .., ... etc. for clean pattern view

  // Responsive layout state
  tb303Collapsed: boolean;
  oscilloscopeVisible: boolean;
  compactToolbar: boolean;
  autoCompactApplied: boolean; // Track if we've already auto-compacted this session
  showSamplePackModal: boolean;
  uiVersion: number; // Track UI migrations

  // Performance settings
  performanceQuality: PerformanceQuality; // Auto-adjusted based on FPS

  // Scratch settings
  scratchEnabled: boolean; // Manual scratch toggle (true = always enabled, false = only during playback)
  scratchAcceleration: boolean; // Scroll acceleration for scratch (true = smoothed, false = raw 1:1)
  platterMass: number; // Turntable platter mass 0-1 (0=CDJ light, 0.5=Technics 1200, 1=heavy)

  // View switching (tracker vs arrangement vs DJ vs drum pads vs piano roll)
  activeView: 'tracker' | 'arrangement' | 'dj' | 'drumpad' | 'pianoroll';

  // Pop-out window state
  tb303PoppedOut: boolean;
  instrumentEditorPoppedOut: boolean;
  masterEffectsPoppedOut: boolean;
  instrumentEffectsPoppedOut: boolean;
  pianoRollPoppedOut: boolean;
  oscilloscopePoppedOut: boolean;
  arrangementPoppedOut: boolean;

  // Transient UI state (not persisted)
  statusMessage: string;
  prevStatusMessage: string;
  pendingModuleFile: File | null; // Module file pending import (set by drag-drop, consumed by TrackerView)

  // Actions
  togglePanel: (panel: PanelType) => void;
  setActivePanel: (panel: PanelType) => void;
  setTrackerZoom: (zoom: number) => void;
  openModal: (modalId: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  togglePatterns: () => void;
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
  toggleTB303Collapsed: () => void;
  setTB303Collapsed: (collapsed: boolean) => void;
  toggleOscilloscopeVisible: () => void;
  setOscilloscopeVisible: (visible: boolean) => void;
  toggleCompactToolbar: () => void;
  setCompactToolbar: (compact: boolean) => void;
  applyAutoCompact: () => void; // Auto-collapse panels on small screens
  setShowSamplePackModal: (show: boolean) => void;

  // Performance actions
  setPerformanceQuality: (quality: PerformanceQuality) => void;

  // Scratch actions
  setScratchEnabled: (enabled: boolean) => void;
  setScratchAcceleration: (enabled: boolean) => void;
  setPlatterMass: (mass: number) => void;

  // View switching actions
  setActiveView: (view: 'tracker' | 'arrangement' | 'dj' | 'drumpad' | 'pianoroll') => void;
  toggleActiveView: () => void;

  // Pop-out window actions
  setTB303PoppedOut: (v: boolean) => void;
  setInstrumentEditorPoppedOut: (v: boolean) => void;
  setMasterEffectsPoppedOut: (v: boolean) => void;
  setInstrumentEffectsPoppedOut: (v: boolean) => void;
  setPianoRollPoppedOut: (v: boolean) => void;
  setOscilloscopePoppedOut: (v: boolean) => void;
  setArrangementPoppedOut: (v: boolean) => void;

  // Module import actions
  setPendingModuleFile: (file: File | null) => void;

  // Dialog command (keyboard → dialog bridge)
  dialogOpen: DialogCommand | null;
  showFileBrowser: boolean;
  showChannelNames: boolean;

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
      activePanel: 'tracker',
      modalOpen: null,
      modalData: null,
      showPatterns: false,
      showAutomationLanes: false,
      showMacroLanes: false,
      showMacroSlots: false,
      sidebarCollapsed: false,
      useHexNumbers: true, // Default to hex numbers (FT2 style)
      rowHighlightInterval: 4, // Highlight every 4th row (FT2 default)
      showBeatLabels: false, // Beat labels off by default
      chordEntryMode: false, // Chord entry off by default
      blankEmptyCells: false, // Show ---, .., ... by default

      // Responsive layout state (default to expanded/visible)
      tb303Collapsed: true, // TB-303 panel ALWAYS collapsed by default
      oscilloscopeVisible: true,
      compactToolbar: false, // FT2 toolbar expanded by default
      autoCompactApplied: false,
      showSamplePackModal: false,
      uiVersion: 8, // Start at v8 to ensure migration runs

      // Performance settings (default to high quality)
      performanceQuality: 'high',

      // Scratch settings
      scratchEnabled: false, // Manual toggle off by default (scratch only during playback)
      scratchAcceleration: true, // Acceleration on by default
      platterMass: 0.5, // Technics 1200 default

      // View switching
      activeView: 'tracker' as const,

      // Pop-out window state
      tb303PoppedOut: false,
      instrumentEditorPoppedOut: false,
      masterEffectsPoppedOut: false,
      instrumentEffectsPoppedOut: false,
      pianoRollPoppedOut: false,
      oscilloscopePoppedOut: false,
      arrangementPoppedOut: false,

      // Transient state
      statusMessage: 'All Right',
      prevStatusMessage: 'All Right',
      pendingModuleFile: null,

      // Dialog bridge (keyboard → dialog)
      dialogOpen: null,
      showFileBrowser: false,
      showChannelNames: false,

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

          // Clear after timeout if specified
          if (timeout > 0) {
            const win = window as unknown as Record<string, unknown>;
            if (win._statusTimeout) {
              clearTimeout(win._statusTimeout as ReturnType<typeof setTimeout>);
            }

            win._statusTimeout = setTimeout(() => {
              // We need to use the store's set method directly here as we're in a timeout
              const prevMsg = useUIStore.getState().prevStatusMessage;
              useUIStore.getState().setStatusMessage(prevMsg || 'All Right', false, 0);
              win._statusTimeout = null;
            }, timeout);
          }
        }),

      // Responsive layout actions
      toggleTB303Collapsed: () =>
        set((state) => {
          state.tb303Collapsed = !state.tb303Collapsed;
        }),

      setTB303Collapsed: (collapsed) =>
        set((state) => {
          state.tb303Collapsed = collapsed;
        }),

      toggleOscilloscopeVisible: () =>
        set((state) => {
          state.oscilloscopeVisible = !state.oscilloscopeVisible;
        }),

      setOscilloscopeVisible: (visible) =>
        set((state) => {
          state.oscilloscopeVisible = visible;
        }),

      toggleCompactToolbar: () =>
        set((state) => {
          state.compactToolbar = !state.compactToolbar;
        }),

      setCompactToolbar: (compact) =>
        set((state) => {
          state.compactToolbar = compact;
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
            state.tb303Collapsed = true; // FORCE collapse TB-303 panel
            state.compactToolbar = false; // Expand FT2 toolbar
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
          state.activeView = view;
        }),

      toggleActiveView: () =>
        set((state) => {
          state.activeView = state.activeView === 'tracker' ? 'arrangement' : 'tracker';
        }),

      // Pop-out window actions
      setTB303PoppedOut: (v) =>
        set((state) => {
          state.tb303PoppedOut = v;
        }),

      setInstrumentEditorPoppedOut: (v) =>
        set((state) => {
          state.instrumentEditorPoppedOut = v;
        }),

      setMasterEffectsPoppedOut: (v) =>
        set((state) => {
          state.masterEffectsPoppedOut = v;
        }),

      setInstrumentEffectsPoppedOut: (v) =>
        set((state) => {
          state.instrumentEffectsPoppedOut = v;
        }),

      setPianoRollPoppedOut: (v) =>
        set((state) => {
          state.pianoRollPoppedOut = v;
        }),

      setOscilloscopePoppedOut: (v) =>
        set((state) => {
          state.oscilloscopePoppedOut = v;
        }),

      setArrangementPoppedOut: (v) =>
        set((state) => {
          state.arrangementPoppedOut = v;
        }),

      // Module import actions
      setPendingModuleFile: (file) =>
        set((state) => {
          state.pendingModuleFile = file;
        }),

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
      partialize: (state) => ({
        // Only persist layout preferences, not transient UI state
        showPatterns: state.showPatterns,
        showAutomationLanes: state.showAutomationLanes,
        showMacroLanes: state.showMacroLanes,
        showMacroSlots: state.showMacroSlots,
        tb303Collapsed: state.tb303Collapsed,
        oscilloscopeVisible: state.oscilloscopeVisible,
        compactToolbar: state.compactToolbar,
        sidebarCollapsed: state.sidebarCollapsed,
        trackerZoom: state.trackerZoom,
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
        uiVersion: state.uiVersion,
      }),
    }
  )
);
