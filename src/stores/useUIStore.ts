/**
 * UI Store - Panel Visibility, UI State
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { PanelType } from '@typedefs/project';

interface UIStore {
  // State
  visiblePanels: PanelType[];
  trackerZoom: number; // 80-200%
  activePanel: PanelType;
  modalOpen: string | null;
  sidebarCollapsed: boolean;
  useHexNumbers: boolean; // Display numbers in hex (true) or decimal (false)

  // Responsive layout state
  tb303Collapsed: boolean;
  oscilloscopeVisible: boolean;
  compactToolbar: boolean;
  autoCompactApplied: boolean; // Track if we've already auto-compacted this session

  // Actions
  togglePanel: (panel: PanelType) => void;
  setActivePanel: (panel: PanelType) => void;
  setTrackerZoom: (zoom: number) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setUseHexNumbers: (useHex: boolean) => void;

  // Responsive layout actions
  toggleTB303Collapsed: () => void;
  setTB303Collapsed: (collapsed: boolean) => void;
  toggleOscilloscopeVisible: () => void;
  setOscilloscopeVisible: (visible: boolean) => void;
  toggleCompactToolbar: () => void;
  setCompactToolbar: (compact: boolean) => void;
  applyAutoCompact: () => void; // Auto-collapse panels on small screens
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

      // Responsive layout state (default to expanded/visible)
      tb303Collapsed: false,
      oscilloscopeVisible: true,
      compactToolbar: false,
      autoCompactApplied: false,

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
          // Only apply once per session and only if screen is small
          if (state.autoCompactApplied) return;
          state.autoCompactApplied = true;

          const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

          // If screen height is less than 800px, enable compact mode
          if (screenHeight < 800) {
            state.tb303Collapsed = true;
            state.oscilloscopeVisible = false;
            state.compactToolbar = true;
          }
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
      }),
    }
  )
);
