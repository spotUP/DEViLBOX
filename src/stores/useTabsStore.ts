/**
 * Tabs Store - Multi-project tab management with state persistence per tab
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useTrackerStore } from './useTrackerStore';
import { useInstrumentStore } from './useInstrumentStore';
import { useAutomationStore } from './useAutomationStore';
import { useProjectStore } from './useProjectStore';
import { useTransportStore } from './useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { AutomationCurve } from '@typedefs/automation';
import type { ProjectMetadata } from '@typedefs/project';

// State snapshot for a tab
interface TabState {
  patterns: Pattern[];
  currentPatternIndex: number;
  instruments: InstrumentConfig[];
  currentInstrumentId: number | null;
  automationCurves: AutomationCurve[];
  metadata: ProjectMetadata;
  bpm: number;
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

/**
 * Capture current state from all stores
 */
const captureCurrentState = (): TabState => {
  const trackerState = useTrackerStore.getState();
  const instrumentState = useInstrumentStore.getState();
  const automationState = useAutomationStore.getState();
  const projectState = useProjectStore.getState();
  const transportState = useTransportStore.getState();

  return {
    patterns: JSON.parse(JSON.stringify(trackerState.patterns)),
    currentPatternIndex: trackerState.currentPatternIndex,
    instruments: JSON.parse(JSON.stringify(instrumentState.instruments)),
    currentInstrumentId: instrumentState.currentInstrumentId,
    automationCurves: JSON.parse(JSON.stringify(automationState.curves)),
    metadata: JSON.parse(JSON.stringify(projectState.metadata)),
    bpm: transportState.bpm,
  };
};

/**
 * Restore state to all stores
 */
const restoreState = (state: TabState) => {
  // Stop any playback first
  const engine = getToneEngine();
  try {
    engine.stop();
  } catch (e) {
    // Ignore errors if engine not initialized
  }

  // Reset transport
  useTransportStore.getState().reset();
  useTransportStore.getState().setBPM(state.bpm);

  // Restore project metadata
  useProjectStore.getState().setMetadata(state.metadata);
  useProjectStore.getState().setIsDirty(false);

  // Restore tracker (patterns)
  useTrackerStore.getState().loadPatterns(state.patterns);
  useTrackerStore.getState().setCurrentPattern(state.currentPatternIndex);

  // Restore instruments
  useInstrumentStore.getState().loadInstruments(state.instruments);
  if (state.currentInstrumentId !== null) {
    useInstrumentStore.getState().setCurrentInstrument(state.currentInstrumentId);
  }

  // Restore automation
  useAutomationStore.getState().loadCurves(state.automationCurves);

  console.log('[TabsStore] Restored state for tab');
};

/**
 * Get fresh initial state for a new tab
 */
const getInitialState = (): TabState => {
  return {
    patterns: [{
      id: `pattern-${Date.now()}`,
      name: 'Untitled Pattern',
      length: 64,
      channels: Array.from({ length: 4 }, (_, i) => ({
        id: `channel-${i}`,
        name: `Channel ${i + 1}`,
        rows: Array.from({ length: 64 }, () => ({
          note: null,
          instrument: null,
          volume: null,
          effect: null,
        })),
        muted: false,
        solo: false,
        volume: 80,
        pan: 0,
        instrumentId: null,
        color: null,
      })),
    }],
    currentPatternIndex: 0,
    instruments: [{
      id: 0,
      name: 'TB303 Classic',
      synthType: 'TB303',
      tb303: {
        oscillator: { type: 'sawtooth' },
        filter: { cutoff: 400, resonance: 15 },
        filterEnvelope: { envMod: 50, decay: 300 },
        accent: { amount: 0.8 },
        slide: { time: 60, mode: 'exponential' },
      },
      oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
      filter: { type: 'lowpass', frequency: 2000, Q: 1, rolloff: -12 },
      effects: [],
      volume: -6,
      pan: 0,
    }],
    currentInstrumentId: 0,
    automationCurves: [],
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
