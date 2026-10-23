/**
 * ROM Upload Dialog Store
 * Manages state for the ROM upload dialog that appears when a ROM-dependent
 * MAME synth fails to auto-load its ROMs from /public/roms/.
 */

import { create } from 'zustand';
import { CHIP_SYNTH_DEFS } from '../constants/chipParameters';

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

/**
 * Open the ROM upload dialog for an instrument whose chip could not load its ROM.
 * The one path for song preload (ToneEngine) and for a synth reporting a missing ROM
 * (MAMEBaseSynth._updateRomStatus). Returns false when the synth type has no romConfig.
 */
export function showRomDialogForInstrument(instrumentId: number, synthType: string): boolean {
  const chipDef = CHIP_SYNTH_DEFS[synthType];
  if (!chipDef?.romConfig) return false;
  // A held chord or a running pattern must not stack requests: one is already waiting for this instrument.
  if (useRomDialogStore.getState().pendingRomRequest?.instrumentId === instrumentId) return true;
  useRomDialogStore.getState().showRomDialog({
    instrumentId,
    synthType,
    chipName: chipDef.name,
    requiredZip: chipDef.romConfig.requiredZip,
    bankCount: chipDef.romConfig.bankCount,
  });
  return true;
}
