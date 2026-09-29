/**
 * Tabs Store - Multi-project tab management with state persistence per tab
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useTrackerStore } from './useTrackerStore';
import { useInstrumentStore } from './useInstrumentStore';
import { useProjectStore } from './useProjectStore';
import { applySong } from '@/lib/song/applySong';
import { savedSongToApply, type SavedSongFields } from '@/lib/song/savedSong';
import { snapshotSong } from '@/lib/song/snapshotSong';

// A tab's song while another tab is active: the same snapshot every save uses
// (snapshotSong), plus the tab's editing position. Tabs kept only patterns,
// instruments, automation, metadata and BPM, so switching away from an AHX (or
// any native-engine song) and back lost its engine data, order, speed, mixer
// and master chain (2026-09-29 audit).
interface TabState {
  song: SavedSongFields;
  currentPatternIndex: number;
  currentInstrumentId: number | null;
}

export interface ProjectTab {
  id: string;
  name: string;
  isDirty: boolean;
  state: TabState | null; // null means use current store state (active tab)
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

/** The active tab's song and editing position. */
const captureCurrentState = (): TabState => ({
  song: structuredClone(snapshotSong()),
  currentPatternIndex: useTrackerStore.getState().currentPatternIndex,
  currentInstrumentId: useInstrumentStore.getState().currentInstrumentId,
});

/**
 * Make a tab's song the current song - applySong, like every load: stops the
 * outgoing song (native replayers included), resets per-song state, applies
 * the song and its editor mode.
 */
const restoreState = (state: TabState) => {
  void (async () => {
    try {
      await applySong(savedSongToApply(structuredClone(state.song)), 'tab');
      useTrackerStore.getState().setCurrentPattern(state.currentPatternIndex);
      if (state.currentInstrumentId !== null) {
        useInstrumentStore.getState().setCurrentInstrument(state.currentInstrumentId);
      }
      useProjectStore.getState().setIsDirty(false);
    } catch (err) {
      console.error('[Tabs] could not restore the tab\'s song:', err);
    }
  })();
};

/**
 * Get fresh initial state for a new tab
 */
const getInitialState = (): TabState => {
  return {
    song: {
    patternOrder: [0],
    patterns: [{
      id: `pattern-${Date.now()}`,
      name: 'Untitled Pattern',
      length: 64,
      channels: Array.from({ length: 4 }, (_, i) => ({
        id: `channel-${i}`,
        name: `Channel ${i + 1}`,
        rows: Array.from({ length: 64 }, () => ({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        })),
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80,
        pan: 0,
        instrumentId: null,
        color: null,
      })),
    }],
    instruments: [],
    automation: [],
    metadata: {
      id: `project-${Date.now()}`,
      name: 'Untitled',
      author: 'Unknown',
      description: '',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      version: '1.0.0',
    },
    bpm: 125,
    },
    currentPatternIndex: 0,
    currentInstrumentId: 0,
  };
};

const createNewTab = (): ProjectTab => ({
  id: `tab-${Date.now()}`,
  name: 'Untitled',
  isDirty: false,
  state: null,
});

// Create initial tab with null state (uses current store state)
const initialTab = createNewTab();

export const useTabsStore = create<TabsStore>()(
  immer((set, get) => ({
    // Initial state - start with one tab
    tabs: [initialTab],
    activeTabId: initialTab.id,

    // Actions
    addTab: () => {
      const currentState = get();
      const currentTabId = currentState.activeTabId;

      // Save current tab's state before switching
      const savedState = captureCurrentState();

      set((state) => {
        // Save state to current tab
        const currentTab = state.tabs.find((t) => t.id === currentTabId);
        if (currentTab) {
          currentTab.state = savedState;
        }

        // Create new tab
        const newTab = createNewTab();
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
      });

      // Reset stores to fresh state for new tab
      const freshState = getInitialState();
      restoreState(freshState);
    },

    closeTab: (tabId) => {
      const currentState = get();

      // Don't close the last tab
      if (currentState.tabs.length <= 1) return;

      const tabIndex = currentState.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return;

      // Determine which tab to switch to
      let newActiveTabId = currentState.activeTabId;
      let needsRestore = false;

      if (currentState.activeTabId === tabId) {
        // Closing active tab - switch to adjacent
        const newIndex = tabIndex === 0 ? 1 : tabIndex - 1;
        newActiveTabId = currentState.tabs[newIndex].id;
        needsRestore = true;
      }

      // Get the state to restore before modifying tabs array
      const tabToRestore = currentState.tabs.find((t) => t.id === newActiveTabId);
      const stateToRestore = tabToRestore?.state;

      set((state) => {
        // Update active tab
        state.activeTabId = newActiveTabId;

        // Remove the closed tab
        state.tabs.splice(tabIndex, 1);

        // Clear state from now-active tab (it's now the live state)
        const activeTab = state.tabs.find((t) => t.id === newActiveTabId);
        if (activeTab) {
          activeTab.state = null;
        }
      });

      // Restore state if we switched tabs
      if (needsRestore && stateToRestore) {
        restoreState(stateToRestore);
      }
    },

    setActiveTab: (tabId) => {
      const currentState = get();

      if (!currentState.tabs.some((t) => t.id === tabId)) return;
      if (currentState.activeTabId === tabId) return;

      const currentTabId = currentState.activeTabId;

      // Save current tab's state
      const savedState = captureCurrentState();

      // Get state to restore
      const targetTab = currentState.tabs.find((t) => t.id === tabId);
      const stateToRestore = targetTab?.state;

      set((state) => {
        // Save state to current tab
        const currentTab = state.tabs.find((t) => t.id === currentTabId);
        if (currentTab) {
          currentTab.state = savedState;
        }

        // Switch active tab
        state.activeTabId = tabId;

        // Clear state from new active tab (it's now the live state)
        const newActiveTab = state.tabs.find((t) => t.id === tabId);
        if (newActiveTab) {
          newActiveTab.state = null;
        }
      });

      // Restore target tab's state
      if (stateToRestore) {
        restoreState(stateToRestore);
      }
    },

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
