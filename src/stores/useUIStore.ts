/**
 * UI Store - Panel Visibility, Theme, UI State
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ThemeType, PanelType } from '@typedefs/project';

interface UIStore {
  // State
  theme: ThemeType;
  visiblePanels: PanelType[];
  trackerZoom: number; // 80-200%
  activePanel: PanelType;
  modalOpen: string | null;
  sidebarCollapsed: boolean;

  // Actions
  setTheme: (theme: ThemeType) => void;
  togglePanel: (panel: PanelType) => void;
  setActivePanel: (panel: PanelType) => void;
  setTrackerZoom: (zoom: number) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  immer((set, _get) => ({
    // Initial state
    theme: 'ft2-blue',
    visiblePanels: ['tracker', 'oscilloscope', 'pattern-list'],
    trackerZoom: 100,
    activePanel: 'tracker',
    modalOpen: null,
    sidebarCollapsed: false,

    // Actions
    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
      }),

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
  }))
);
