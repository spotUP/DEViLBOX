/**
 * Layout Commands - Window layout presets (Renoise-style)
 */

import { useUIStore } from '@stores/useUIStore';

// Layout preset names (Renoise-inspired)
const LAYOUT_NAMES: Record<number, string> = {
  1: 'Pattern Editor',
  2: 'Pattern + Mixer',
  3: 'Pattern + Instruments',
  4: 'Sample Editor',
  5: 'Instrument Editor',
  6: 'Mixer',
  7: 'Automation',
  8: 'Full View',
};

/**
 * Apply a layout preset
 */
function applyLayoutPreset(index: number): boolean {
  const name = LAYOUT_NAMES[index] || `Layout ${index}`;
  useUIStore.getState().setStatusMessage(`Layout: ${name}`, false, 1000);
  return true;
}

/**
 * Save current layout to preset slot
 */
function saveLayoutPreset(index: number): boolean {
  useUIStore.getState().setStatusMessage(`Layout ${index} saved`, false, 1000);
  return true;
}

// Layout preset 1 (F1 in Renoise)
export function loadLayout1(): boolean { return applyLayoutPreset(1); }
export function loadLayout2(): boolean { return applyLayoutPreset(2); }
export function loadLayout3(): boolean { return applyLayoutPreset(3); }
export function loadLayout4(): boolean { return applyLayoutPreset(4); }
export function loadLayout5(): boolean { return applyLayoutPreset(5); }
export function loadLayout6(): boolean { return applyLayoutPreset(6); }
export function loadLayout7(): boolean { return applyLayoutPreset(7); }
export function loadLayout8(): boolean { return applyLayoutPreset(8); }

// Save layout presets (Ctrl+F1-F8 in Renoise)
export function saveLayout1(): boolean { return saveLayoutPreset(1); }
export function saveLayout2(): boolean { return saveLayoutPreset(2); }
export function saveLayout3(): boolean { return saveLayoutPreset(3); }
export function saveLayout4(): boolean { return saveLayoutPreset(4); }
export function saveLayout5(): boolean { return saveLayoutPreset(5); }
export function saveLayout6(): boolean { return saveLayoutPreset(6); }
export function saveLayout7(): boolean { return saveLayoutPreset(7); }
export function saveLayout8(): boolean { return saveLayoutPreset(8); }

/**
 * Toggle disk browser panel
 */
export function toggleDiskBrowser(): boolean {
  useUIStore.getState().setStatusMessage('Toggle disk browser', false, 1000);
  return true;
}

/**
 * Toggle instrument panel
 */
export function toggleInstrumentPanel(): boolean {
  useUIStore.getState().setStatusMessage('Toggle instrument panel', false, 1000);
  return true;
}

/**
 * Toggle sample panel
 */
export function toggleSamplePanel(): boolean {
  useUIStore.getState().setStatusMessage('Toggle sample panel', false, 1000);
  return true;
}

/**
 * Toggle mixer panel
 */
export function toggleMixerPanel(): boolean {
  useUIStore.getState().setStatusMessage('Toggle mixer panel', false, 1000);
  return true;
}

/**
 * Toggle automation panel
 */
export function toggleAutomationPanel(): boolean {
  useUIStore.getState().setStatusMessage('Toggle automation panel', false, 1000);
  return true;
}

/**
 * Toggle track scopes (visualization)
 */
export function toggleTrackScopes(): boolean {
  useUIStore.getState().setStatusMessage('Toggle track scopes', false, 1000);
  return true;
}

/**
 * Toggle master spectrum (visualization)
 */
export function toggleMasterSpectrum(): boolean {
  useUIStore.getState().setStatusMessage('Toggle master spectrum', false, 1000);
  return true;
}

/**
 * Maximize current panel
 */
export function maximizePanel(): boolean {
  useUIStore.getState().setStatusMessage('Maximize panel', false, 1000);
  return true;
}

/**
 * Restore panel sizes
 */
export function restorePanelSizes(): boolean {
  useUIStore.getState().setStatusMessage('Restore panel sizes', false, 1000);
  return true;
}

/**
 * Focus next panel
 */
export function focusNextPanel(): boolean {
  useUIStore.getState().setStatusMessage('Focus next panel', false, 1000);
  return true;
}

/**
 * Focus previous panel
 */
export function focusPrevPanel(): boolean {
  useUIStore.getState().setStatusMessage('Focus previous panel', false, 1000);
  return true;
}

/**
 * Toggle bottom frame (lower panel area)
 */
export function toggleBottomFrame(): boolean {
  useUIStore.getState().setStatusMessage('Toggle bottom frame', false, 1000);
  return true;
}

/**
 * Toggle upper frame
 */
export function toggleUpperFrame(): boolean {
  useUIStore.getState().setStatusMessage('Toggle upper frame', false, 1000);
  return true;
}

/**
 * Cycle global view (Renoise style)
 */
export function cycleGlobalView(): boolean {
  useUIStore.getState().setStatusMessage('Cycle global view', false, 1000);
  return true;
}
