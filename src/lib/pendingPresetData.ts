/**
 * Global pending preset data store.
 *
 * When a preset is loaded from the Library browser, the actual preset data
 * (Helm JSON or Dexed sysex binary) is stored here. Hardware UI components
 * (HelmHardwareUI, DexedHardwareUI) check this on mount and apply it if present.
 *
 * This solves the timing problem: the preset data arrives before the hardware
 * UI component mounts, so custom events would be missed.
 */

interface PendingPreset {
  type: 'helm' | 'dexed';
  data: unknown;
  timestamp: number;
}

let pending: PendingPreset | null = null;

export function setPendingPresetData(type: 'helm' | 'dexed', data: unknown): void {
  pending = { type, data, timestamp: Date.now() };
}

export function consumePendingPresetData(type: 'helm' | 'dexed'): unknown | null {
  if (!pending || pending.type !== type) return null;
  // Expire after 10 seconds
  if (Date.now() - pending.timestamp > 10_000) {
    pending = null;
    return null;
  }
  const data = pending.data;
  pending = null;
  return data;
}
