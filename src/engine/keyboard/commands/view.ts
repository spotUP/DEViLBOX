/**
 * View Commands - View/panel switching, UI navigation
 */

import { useUIStore } from '@stores/useUIStore';

export function showHelp(): boolean {
  useUIStore.getState().openDialogCommand('keyboard-help');
  return true;
}

export function openPatternEditor(): boolean {
  useUIStore.getState().setActiveView('tracker');
  useUIStore.getState().setStatusMessage('Pattern Editor', false, 1000);
  return true;
}

export function openSampleEditor(): boolean {
  useUIStore.getState().setStatusMessage('Sample editor: use instrument list', false, 1500);
  return true;
}

export function openInstrumentEditor(): boolean {
  const { visiblePanels, togglePanel, setActivePanel } = useUIStore.getState();
  if (!visiblePanels.includes('instrument-editor')) togglePanel('instrument-editor');
  setActivePanel('instrument-editor');
  useUIStore.getState().setStatusMessage('Instrument Editor', false, 1000);
  return true;
}

export function openSampleList(): boolean {
  useUIStore.getState().setStatusMessage('Sample list: use instrument panel', false, 1500);
  return true;
}

export function openInstrumentList(): boolean {
  return openInstrumentEditor();
}

export function showSynthEditor(): boolean {
  return openInstrumentEditor();
}

export function openMessageEditor(): boolean {
  useUIStore.getState().setStatusMessage('Comments: use File menu', false, 1500);
  return true;
}

export function showOrderList(): boolean {
  const { visiblePanels, togglePanel, setActivePanel } = useUIStore.getState();
  if (!visiblePanels.includes('pattern-list')) togglePanel('pattern-list');
  setActivePanel('pattern-list');
  useUIStore.getState().setStatusMessage('Pattern List', false, 1000);
  return true;
}

export function openSettings(): boolean {
  useUIStore.getState().openModal('settings');
  return true;
}

export function toggleTreeView(): boolean {
  const { sidebarCollapsed, toggleSidebar } = useUIStore.getState();
  toggleSidebar();
  useUIStore.getState().setStatusMessage(`Sidebar: ${sidebarCollapsed ? 'shown' : 'hidden'}`, false, 1000);
  return true;
}

export function viewGeneral(): boolean {
  useUIStore.getState().setActiveView('tracker');
  useUIStore.getState().setStatusMessage('General view', false, 1000);
  return true;
}

export function viewPattern(): boolean {
  useUIStore.getState().setActiveView('tracker');
  useUIStore.getState().setStatusMessage('Pattern View', false, 1000);
  return true;
}

export function viewSamples(): boolean {
  return openSampleEditor();
}

export function viewInstruments(): boolean {
  return openInstrumentEditor();
}

export function viewComments(): boolean {
  return openMessageEditor();
}

export function viewMidiMapping(): boolean {
  useUIStore.getState().openModal('settings');
  useUIStore.getState().setStatusMessage('MIDI: see Settings → MIDI', false, 1500);
  return true;
}

export function viewOptions(): boolean {
  return openSettings();
}

export function toggleFullscreen(): boolean {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      useUIStore.getState().setStatusMessage('Fullscreen not available', false, 1000);
    });
    useUIStore.getState().setStatusMessage('Fullscreen ON', false, 1000);
  } else {
    document.exitFullscreen();
    useUIStore.getState().setStatusMessage('Fullscreen OFF', false, 1000);
  }
  return true;
}

// OctaMED panel commands — map to nearest equivalent
export function showFilesPanel(): boolean { return openSettings(); }
export function showPlayPanel(): boolean { return viewPattern(); }
export function showInstrumentsPanel(): boolean { return openInstrumentEditor(); }
export function showBlockPanel(): boolean { return viewPattern(); }
export function showEditPanel(): boolean { return viewPattern(); }
export function showMiscPanel(): boolean { return viewOptions(); }
export function showVolumePanel(): boolean { return openInstrumentEditor(); }
export function showMidiPanel(): boolean { return viewMidiMapping(); }
export function showTransposePanel(): boolean { return viewPattern(); }
export function showRangePanel(): boolean { return viewPattern(); }
