/**
 * Shared view switching constants and logic.
 *
 * Single source of truth for available views and the view-switch handler
 * used by PixiViewHeader (Pixi GL dropdown) and VJView (DOM <select>).
 */

import { useUIStore } from '@stores/useUIStore';

export interface ViewOption {
  value: string;
  label: string;
}

/** All views available in the view switcher, in display order. */
export const VIEW_OPTIONS: ViewOption[] = [
  { value: 'tracker',     label: 'Tracker' },
  { value: 'grid',        label: 'Grid' },
  { value: 'pianoroll',   label: 'Piano Roll' },
  { value: 'tb303',       label: 'TB-303' },
  { value: 'arrangement', label: 'Arrangement' },
  { value: 'dj',          label: 'DJ Mixer' },
  { value: 'drumpad',     label: 'Drum Pads' },
  { value: 'mixer',       label: 'Mixer' },
  { value: 'vj',          label: 'VJ View' },
  { value: 'studio',      label: 'Studio' },
  { value: 'split',       label: 'Split View' },
];

/** Tracker sub-modes that stay within the tracker activeView */
const TRACKER_SUB_MODES = new Set(['tracker', 'grid', 'tb303']);

/**
 * Switch view via the UI store. Handles tracker sub-modes (grid/tb303)
 * by setting trackerViewMode instead of switching activeView.
 *
 * @param target  The view value to switch to.
 * @param current The currently active view value (to skip no-op switches).
 */
export function switchView(target: string, current?: string): void {
  if (target === current) return;
  const store = useUIStore.getState();

  if (TRACKER_SUB_MODES.has(target)) {
    setTimeout(() => {
      store.setActiveView('tracker');
      store.setTrackerViewMode(target as 'tracker' | 'grid' | 'tb303');
    }, 0);
  } else {
    setTimeout(() => store.setActiveView(target as never), 0);
  }
}
