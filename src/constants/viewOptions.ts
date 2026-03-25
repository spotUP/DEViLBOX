/**
 * Shared view switching constants and logic.
 *
 * !! SINGLE SOURCE OF TRUTH for all view definitions !!
 * NavBar, MobileMenu, MobileTabBar, SplitView, VJView, PixiNavBar all consume this.
 */

import { useUIStore } from '@stores/useUIStore';

export interface ViewOption {
  value: string;
  label: string;
  /** Short label for tight spaces (nav bar, mobile) */
  shortLabel: string;
  /** Show in desktop nav bar */
  showInNavBar: boolean;
  /** Show in mobile hamburger menu */
  showInMobileMenu: boolean;
  /** Show in mobile bottom tab bar */
  showInMobileTabBar: boolean;
  /** Is this a modal action rather than a real view switch? */
  isModal?: boolean;
}

/** All views available in the app, in display order. */
export const VIEW_OPTIONS: ViewOption[] = [
  { value: 'tracker',     label: 'Tracker',      shortLabel: 'Tracker',  showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: true },
  { value: 'arrangement', label: 'Arrangement',   shortLabel: 'Arrange',  showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: true },
  { value: 'pianoroll',   label: 'Piano Roll',   shortLabel: 'Piano',    showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: true },
  { value: 'mixer',       label: 'Mixer',        shortLabel: 'Mixer',    showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: true },
  { value: 'dj',          label: 'DJ Mixer',     shortLabel: 'DJ',       showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: false },
  { value: 'drumpad',     label: 'Drum Pads',    shortLabel: 'Pads',     showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: true },
  { value: 'vj',          label: 'VJ View',      shortLabel: 'VJ',       showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: false },
  { value: 'studio',      label: 'Studio',       shortLabel: 'Studio',   showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: false },
  { value: 'split',       label: 'Split View',   shortLabel: 'Split',    showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: false },
  { value: 'grid',        label: 'Grid',         shortLabel: 'Grid',     showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: false },
  { value: 'tb303',       label: 'TB-303',       shortLabel: '303',      showInNavBar: true,  showInMobileMenu: true,  showInMobileTabBar: false },
];

/** Filtered subsets for each context */
export const NAV_BAR_VIEWS = VIEW_OPTIONS.filter(v => v.showInNavBar);
export const MOBILE_MENU_VIEWS = VIEW_OPTIONS.filter(v => v.showInMobileMenu);
export const MOBILE_TAB_BAR_VIEWS = VIEW_OPTIONS.filter(v => v.showInMobileTabBar);

/** View IDs for type safety */
export type ViewId = typeof VIEW_OPTIONS[number]['value'];

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
