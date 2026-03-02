/**
 * usePixiDropdownStore — Global registry for the one active Pixi dropdown.
 *
 * Dropdowns inside PixiWindows are clipped by the window's Graphics mask
 * regardless of zIndex. This store allows PixiSelect and PixiMenuBar to
 * register their open dropdown data; PixiGlobalDropdownLayer renders it at
 * root stage level (zIndex 9999), outside every mask.
 */

import { create } from 'zustand';
import type { SelectOption } from '../components/PixiSelect';
import type { MenuItem } from '../components/PixiMenuBar';

interface SelectDropdown {
  kind: 'select';
  id: string;
  x: number;          // screen-space left edge (from container.toGlobal)
  y: number;          // screen-space top edge (below trigger button)
  width: number;
  options: SelectOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
}

interface MenuDropdown {
  kind: 'menu';
  id: string;
  x: number;
  y: number;
  width: number;
  items: MenuItem[];
  onClose: () => void;
}

export type GlobalDropdown = SelectDropdown | MenuDropdown;

interface PixiDropdownStore {
  dropdown: GlobalDropdown | null;
  openDropdown: (d: GlobalDropdown) => void;
  closeDropdown: (id: string) => void;
  closeAll: () => void;
}

export const usePixiDropdownStore = create<PixiDropdownStore>()((set, get) => ({
  dropdown: null,

  openDropdown: (d) => {
    // Close previous dropdown if it's from a different trigger
    const prev = get().dropdown;
    if (prev && prev.id !== d.id) prev.onClose();
    set({ dropdown: d });
  },

  closeDropdown: (id) => {
    if (get().dropdown?.id === id) set({ dropdown: null });
  },

  closeAll: () => {
    get().dropdown?.onClose();
    set({ dropdown: null });
  },
}));
