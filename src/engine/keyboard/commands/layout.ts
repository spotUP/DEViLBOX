/**
 * Layout Commands - Window layout presets (Renoise-style)
 */

import { useUIStore } from '@stores/useUIStore';
import type { PanelType } from '@typedefs/project';

interface LayoutPreset {
  panels: PanelType[];
  view: 'tracker' | 'arrangement' | 'dj' | 'drumpad' | 'pianoroll' | 'vj';
  label: string;
}

const LAYOUT_PRESETS: Record<number, LayoutPreset> = {
  1: { panels: ['tracker', 'pattern-list'], view: 'tracker', label: 'Pattern Editor' },
  2: { panels: ['tracker', 'pattern-list', 'oscilloscope'], view: 'tracker', label: 'Pattern + Scopes' },
  3: { panels: ['tracker', 'pattern-list', 'instrument-editor'], view: 'tracker', label: 'Pattern + Instruments' },
  4: { panels: ['instrument-editor'], view: 'tracker', label: 'Instrument Editor' },
  5: { panels: ['tracker', 'automation'], view: 'tracker', label: 'Pattern + Automation' },
  6: { panels: ['tracker', 'pattern-list', 'oscilloscope', 'instrument-editor'], view: 'tracker', label: 'Full View' },
  7: { panels: ['arrangement'], view: 'arrangement', label: 'Arrangement' },
  8: { panels: ['tracker', 'oscilloscope', 'instrument-editor', 'automation', 'pattern-list'], view: 'tracker', label: 'All Panels' },
};

function applyLayoutPreset(index: number): boolean {
  const preset = LAYOUT_PRESETS[index];
  if (!preset) {
    useUIStore.getState().setStatusMessage(`Layout ${index} not defined`, false, 1000);
    return true;
  }
  useUIStore.setState({
    visiblePanels: preset.panels,
    activeView: preset.view,
    activePanel: preset.panels[0],
  });
  useUIStore.getState().setStatusMessage(`Layout: ${preset.label}`, false, 1000);
  return true;
}

export function loadLayout1(): boolean { return applyLayoutPreset(1); }
export function loadLayout2(): boolean { return applyLayoutPreset(2); }
export function loadLayout3(): boolean { return applyLayoutPreset(3); }
export function loadLayout4(): boolean { return applyLayoutPreset(4); }
export function loadLayout5(): boolean { return applyLayoutPreset(5); }
export function loadLayout6(): boolean { return applyLayoutPreset(6); }
export function loadLayout7(): boolean { return applyLayoutPreset(7); }
export function loadLayout8(): boolean { return applyLayoutPreset(8); }

// Save layouts — record current panel state to a simple in-memory store
const savedLayouts: Record<number, LayoutPreset> = {};

function saveLayoutPreset(index: number): boolean {
  const { visiblePanels, activeView } = useUIStore.getState();
  savedLayouts[index] = { panels: [...visiblePanels], view: activeView, label: `Custom ${index}` };
  useUIStore.getState().setStatusMessage(`Layout ${index} saved`, false, 1000);
  return true;
}

export function saveLayout1(): boolean { return saveLayoutPreset(1); }
export function saveLayout2(): boolean { return saveLayoutPreset(2); }
export function saveLayout3(): boolean { return saveLayoutPreset(3); }
export function saveLayout4(): boolean { return saveLayoutPreset(4); }
export function saveLayout5(): boolean { return saveLayoutPreset(5); }
export function saveLayout6(): boolean { return saveLayoutPreset(6); }
export function saveLayout7(): boolean { return saveLayoutPreset(7); }
export function saveLayout8(): boolean { return saveLayoutPreset(8); }

export function toggleDiskBrowser(): boolean {
  useUIStore.getState().setShowFileBrowser(true);
  return true;
}

export function toggleInstrumentPanel(): boolean {
  useUIStore.getState().togglePanel('instrument-editor');
  return true;
}

export function toggleSamplePanel(): boolean {
  useUIStore.getState().togglePanel('instrument-editor');
  useUIStore.getState().setStatusMessage('Sample panel (instrument editor)', false, 1000);
  return true;
}

export function toggleMixerPanel(): boolean {
  useUIStore.getState().setStatusMessage('Mixer: not available', false, 1000);
  return true;
}

export function toggleAutomationPanel(): boolean {
  useUIStore.getState().togglePanel('automation');
  return true;
}

export function toggleTrackScopes(): boolean {
  useUIStore.getState().toggleOscilloscopeVisible();
  const visible = useUIStore.getState().oscilloscopeVisible;
  useUIStore.getState().setStatusMessage(`Track scopes: ${visible ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMasterSpectrum(): boolean {
  return toggleTrackScopes();
}

export function maximizePanel(): boolean {
  const { activePanel } = useUIStore.getState();
  useUIStore.setState({ visiblePanels: [activePanel] });
  useUIStore.getState().setStatusMessage('Panel maximized', false, 1000);
  return true;
}

export function restorePanelSizes(): boolean {
  useUIStore.setState({ visiblePanels: ['tracker', 'oscilloscope', 'pattern-list'] });
  useUIStore.getState().setStatusMessage('Panels restored', false, 1000);
  return true;
}

export function focusNextPanel(): boolean {
  const { visiblePanels, activePanel, setActivePanel } = useUIStore.getState();
  const idx = visiblePanels.indexOf(activePanel);
  const next = visiblePanels[(idx + 1) % visiblePanels.length];
  if (next) setActivePanel(next);
  return true;
}

export function focusPrevPanel(): boolean {
  const { visiblePanels, activePanel, setActivePanel } = useUIStore.getState();
  const idx = visiblePanels.indexOf(activePanel);
  const prev = visiblePanels[(idx - 1 + visiblePanels.length) % visiblePanels.length];
  if (prev) setActivePanel(prev);
  return true;
}

export function toggleBottomFrame(): boolean {
  useUIStore.getState().toggleTB303Collapsed();
  return true;
}

export function toggleUpperFrame(): boolean {
  useUIStore.getState().toggleOscilloscopeVisible();
  return true;
}

export function cycleGlobalView(): boolean {
  useUIStore.getState().toggleActiveView();
  const view = useUIStore.getState().activeView;
  useUIStore.getState().setStatusMessage(`View: ${view}`, false, 1000);
  return true;
}
