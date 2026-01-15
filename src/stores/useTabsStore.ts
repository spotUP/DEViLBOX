/**
 * Tabs Store - Multi-project tab management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface ProjectTab {
  id: string;
  name: string;
  isDirty: boolean;
}

interface TabsStore {
  // State
  tabs: ProjectTab[];
  activeTabId: string;

  // Actions
  addTab: () => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabName: (tabId: string, name: string) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
}

const createNewTab = (): ProjectTab => ({
  id: `tab-${Date.now()}`,
  name: 'Untitled',
  isDirty: false,
});

const initialTab = createNewTab();

export const useTabsStore = create<TabsStore>()(
  immer((set, _get) => ({
    // Initial state - start with one tab
    tabs: [initialTab],
    activeTabId: initialTab.id,

    // Actions
    addTab: () =>
      set((state) => {
        const newTab = createNewTab();
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
      }),

    closeTab: (tabId) =>
      set((state) => {
        // Don't close the last tab
        if (state.tabs.length <= 1) return;

        const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
        if (tabIndex === -1) return;

        // If closing active tab, switch to adjacent tab
        if (state.activeTabId === tabId) {
          const newIndex = tabIndex === 0 ? 1 : tabIndex - 1;
          state.activeTabId = state.tabs[newIndex].id;
        }

        state.tabs.splice(tabIndex, 1);
      }),

    setActiveTab: (tabId) =>
      set((state) => {
        if (state.tabs.some((t) => t.id === tabId)) {
          state.activeTabId = tabId;
        }
      }),

    updateTabName: (tabId, name) =>
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId);
        if (tab) {
          tab.name = name;
        }
      }),

    markTabDirty: (tabId, isDirty) =>
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId);
        if (tab) {
          tab.isDirty = isDirty;
        }
      }),
  }))
);
