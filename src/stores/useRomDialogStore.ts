/**
 * ROM Upload Dialog Store
 * Manages state for the ROM upload dialog that appears when a ROM-dependent
 * MAME synth fails to auto-load its ROMs from /public/roms/.
 */

import { create } from 'zustand';

export interface RomRequest {
  instrumentId: number;
  synthType: string;
  chipName: string;
  requiredZip: string;
  bankCount: number;
}

interface RomDialogStore {
  pendingRomRequest: RomRequest | null;
  showRomDialog: (request: RomRequest) => void;
  dismissRomDialog: () => void;
}

export const useRomDialogStore = create<RomDialogStore>((set) => ({
  pendingRomRequest: null,

  showRomDialog: (request) => {
    set({ pendingRomRequest: request });
  },

  dismissRomDialog: () => {
    set({ pendingRomRequest: null });
  },
}));
