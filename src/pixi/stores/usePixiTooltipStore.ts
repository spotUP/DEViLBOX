/**
 * usePixiTooltipStore — Global registry for the active Pixi GL tooltip.
 *
 * Follows the same pattern as usePixiDropdownStore: components set tooltip
 * data in screen-space coordinates, and PixiGlobalTooltipLayer renders it
 * at root stage level (zIndex 9998) outside every window mask.
 */

import { create } from 'zustand';

export interface TooltipData {
  text: string;
  x: number;       // screen-space center X
  y: number;       // screen-space top edge (tooltip renders above this)
  accent: number;   // 0xRRGGBB border tint
}

interface PixiTooltipStore {
  tooltip: TooltipData | null;
  showTooltip: (data: TooltipData) => void;
  updateTooltip: (data: Partial<TooltipData>) => void;
  hideTooltip: () => void;
}

export const usePixiTooltipStore = create<PixiTooltipStore>()((set, get) => ({
  tooltip: null,

  showTooltip: (data) => set({ tooltip: data }),

  updateTooltip: (data) => {
    const prev = get().tooltip;
    if (prev) set({ tooltip: { ...prev, ...data } });
  },

  hideTooltip: () => set({ tooltip: null }),
}));
