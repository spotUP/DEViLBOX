/**
 * UI Store - Panel Visibility, UI State
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { PanelType } from '@typedefs/project';

export type PerformanceQuality = 'high' | 'medium' | 'low';

interface UIStore {
  // State
  visiblePanels: PanelType[];
  trackerZoom: number; // 80-200%
  activePanel: PanelType;
  modalOpen: string | null;
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

  // Transient UI state (not persisted)
  statusMessage: string;
  prevStatusMessage: string;

  // Actions
  togglePanel: (panel: PanelType) => void;
  setActivePanel: (panel: PanelType) => void;
  setTrackerZoom: (zoom: number) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
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
}

export const useUIStore = create<UIStore>()(
  persist(
    immer((set, _get) => ({
      // Initial state
      visiblePanels: ['tracker', 'oscilloscope', 'pattern-list'],
      trackerZoom: 100,
      activePanel: 'tracker',
      modalOpen: null,
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

      // Transient state
      statusMessage: '',
      prevStatusMessage: '',

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

      openModal: (modalId) =>
        set((state) => {
          state.modalOpen = modalId;
        }),

      closeModal: () =>
        set((state) => {
          state.modalOpen = null;
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
            if ((window as any)._statusTimeout) {
              clearTimeout((window as any)._statusTimeout);
            }

            (window as any)._statusTimeout = setTimeout(() => {
              // We need to use the store's set method directly here as we're in a timeout
              useUIStore.getState().setStatusMessage(useUIStore.getState().prevStatusMessage, false, 0);
              (window as any)._statusTimeout = null;
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
            console.log('[UIStore] Migration v8: Forcing TB-303 collapsed (was:', state.tb303Collapsed, ')');
            state.uiVersion = 8;
            state.tb303Collapsed = true; // FORCE collapse TB-303 panel
            state.compactToolbar = false; // Expand FT2 toolbar
            console.log('[UIStore] Migration v8: TB-303 now collapsed:', state.tb303Collapsed);
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
    })),
    {
      name: 'devilbox-ui-settings',
      partialize: (state) => ({
        // Only persist layout preferences, not transient UI state
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
        uiVersion: state.uiVersion,
      }),
    }
  )
);
