/**
 * Store for register-capture automation lanes.
 * Tracks which chip register parameters are shown as lanes.
 * Lanes are added/removed via channel context menus.
 */
import { create } from 'zustand';

export interface RegisterLane {
  id: string;
  paramId: string;
  height: number; // 24 | 48 | 72
}

interface RegisterLaneStore {
  lanes: RegisterLane[];
  addLane: (paramId: string) => void;
  removeLane: (paramId: string) => void;
  toggleLane: (paramId: string) => void;
  hasLane: (paramId: string) => boolean;
  setLaneHeight: (paramId: string, height: number) => void;
  clear: () => void;
}

let idCounter = 0;

export const useRegisterLaneStore = create<RegisterLaneStore>((set, get) => ({
  lanes: [],

  addLane: (paramId) => {
    if (get().lanes.some(l => l.paramId === paramId)) return;
    set(s => ({
      lanes: [...s.lanes, { id: `rlane-${++idCounter}`, paramId, height: 48 }],
    }));
  },

  removeLane: (paramId) => {
    set(s => ({
      lanes: s.lanes.filter(l => l.paramId !== paramId),
    }));
  },

  toggleLane: (paramId) => {
    if (get().lanes.some(l => l.paramId === paramId)) {
      get().removeLane(paramId);
    } else {
      get().addLane(paramId);
    }
  },

  hasLane: (paramId) => get().lanes.some(l => l.paramId === paramId),

  setLaneHeight: (paramId, height) => {
    set(s => ({
      lanes: s.lanes.map(l => l.paramId === paramId ? { ...l, height } : l),
    }));
  },

  clear: () => set({ lanes: [] }),
}));
