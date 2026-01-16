/**
 * Live Mode Store - Manages live performance mode state
 * Handles mode switching, pattern queueing, and live channel actions
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type ChannelAction =
  | { type: 'trigger'; pattern: 'kicks' | 'build' | 'drop' | 'breakdown' }
  | { type: 'stutter' }
  | { type: 'roll'; division: '1/4' | '1/8' | '1/16' }
  | { type: 'filterSweep'; direction: 'up' | 'down'; bars: number }
  | { type: 'volumeFade'; direction: 'in' | 'out'; bars: number }
  | { type: 'kill' };

interface LiveModeState {
  // Mode toggle
  isLiveMode: boolean;

  // Pattern queueing
  pendingPatternIndex: number | null;
  pendingPositionIndex: number | null;
  queueMode: 'immediate' | 'end-of-pattern' | 'end-of-bar';

  // Channel action queues (for live effects)
  channelQueues: Map<number, ChannelAction[]>;

  // Visual state
  showQueueCountdown: boolean;
  barsUntilSwitch: number;
}

interface LiveModeActions {
  // Mode control
  toggleLiveMode: () => void;
  setLiveMode: (enabled: boolean) => void;

  // Pattern queueing
  queuePattern: (index: number) => void;
  queuePosition: (index: number) => void;
  clearQueue: () => void;
  setQueueMode: (mode: 'immediate' | 'end-of-pattern' | 'end-of-bar') => void;

  // Channel actions
  queueChannelAction: (channelIndex: number, action: ChannelAction) => void;
  clearChannelQueue: (channelIndex: number) => void;
  popChannelAction: (channelIndex: number) => ChannelAction | undefined;

  // Visual updates
  updateBarsUntilSwitch: (bars: number) => void;
  setShowQueueCountdown: (show: boolean) => void;
}

type LiveModeStore = LiveModeState & LiveModeActions;

export const useLiveModeStore = create<LiveModeStore>()(
  immer((set, get) => ({
    // Initial state
    isLiveMode: false,
    pendingPatternIndex: null,
    pendingPositionIndex: null,
    queueMode: 'end-of-pattern',
    channelQueues: new Map(),
    showQueueCountdown: true,
    barsUntilSwitch: 0,

    // Mode control
    toggleLiveMode: () => {
      const currentMode = get().isLiveMode;
      const newMode = !currentMode;
      console.log('[LiveMode] Toggling:', currentMode, '->', newMode);
      set((state) => {
        state.isLiveMode = newMode;
        // Clear queues when switching to edit mode
        if (!newMode) {
          state.pendingPatternIndex = null;
          state.pendingPositionIndex = null;
          state.channelQueues = new Map();
        }
      });
    },

    setLiveMode: (enabled: boolean) => {
      set((state) => {
        state.isLiveMode = enabled;
        if (!enabled) {
          state.pendingPatternIndex = null;
          state.pendingPositionIndex = null;
          state.channelQueues.clear();
        }
      });
    },

    // Pattern queueing
    queuePattern: (index: number) => {
      set((state) => {
        state.pendingPatternIndex = index;
      });
    },

    queuePosition: (index: number) => {
      set((state) => {
        state.pendingPositionIndex = index;
      });
    },

    clearQueue: () => {
      set((state) => {
        state.pendingPatternIndex = null;
        state.pendingPositionIndex = null;
      });
    },

    setQueueMode: (mode) => {
      set((state) => {
        state.queueMode = mode;
      });
    },

    // Channel actions
    queueChannelAction: (channelIndex: number, action: ChannelAction) => {
      set((state) => {
        const queue = state.channelQueues.get(channelIndex) || [];
        queue.push(action);
        state.channelQueues.set(channelIndex, queue);
      });
    },

    clearChannelQueue: (channelIndex: number) => {
      set((state) => {
        state.channelQueues.delete(channelIndex);
      });
    },

    popChannelAction: (channelIndex: number) => {
      const queue = get().channelQueues.get(channelIndex);
      if (!queue || queue.length === 0) return undefined;

      const action = queue.shift();
      set((state) => {
        if (queue.length === 0) {
          state.channelQueues.delete(channelIndex);
        } else {
          state.channelQueues.set(channelIndex, queue);
        }
      });
      return action;
    },

    // Visual updates
    updateBarsUntilSwitch: (bars: number) => {
      set((state) => {
        state.barsUntilSwitch = bars;
      });
    },

    setShowQueueCountdown: (show: boolean) => {
      set((state) => {
        state.showQueueCountdown = show;
      });
    },
  }))
);

// Selector hooks for common patterns
export const useIsLiveMode = () => useLiveModeStore((state) => state.isLiveMode);
export const usePendingPattern = () => useLiveModeStore((state) => state.pendingPatternIndex);
export const usePendingPosition = () => useLiveModeStore((state) => state.pendingPositionIndex);
