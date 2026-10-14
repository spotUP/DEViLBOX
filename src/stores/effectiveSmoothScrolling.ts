/**
 * The one place that decides whether the pattern view scrolls per sub-row:
 * the saved Smooth Scrolling preference, OR a scratch in progress (transient
 * override, never written to the preference).
 */
import { useSettingsStore } from './useSettingsStore';
import { useUIStore } from './useUIStore';

export function getEffectiveSmoothScrolling(): boolean {
  return useSettingsStore.getState().smoothScrolling || useUIStore.getState().scratchActive;
}

export function useEffectiveSmoothScrolling(): boolean {
  const setting = useSettingsStore((s) => s.smoothScrolling);
  const scratching = useUIStore((s) => s.scratchActive);
  return setting || scratching;
}
