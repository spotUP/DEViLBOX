/**
 * View Commands - View/panel switching, UI navigation
 */

import { useUIStore } from '@stores/useUIStore';

/**
 * Show help dialog
 */
export function showHelp(): boolean {
  useUIStore.getState().setStatusMessage('Help: Press Esc to close dialogs, ? for shortcuts', false, 3000);
  return true;
}

/**
 * Open/focus pattern editor (main view)
 */
export function openPatternEditor(): boolean {
  useUIStore.getState().setStatusMessage('Pattern Editor', false, 1000);
  return true;
}

/**
 * Open/focus sample editor
 */
export function openSampleEditor(): boolean {
  useUIStore.getState().setStatusMessage('Sample Editor', false, 1000);
  return true;
}

/**
 * Open/focus instrument editor  
 */
export function openInstrumentEditor(): boolean {
  useUIStore.getState().setStatusMessage('Instrument Editor', false, 1000);
  return true;
}

/**
 * Show sample list
 */
export function openSampleList(): boolean {
  useUIStore.getState().setStatusMessage('Sample List', false, 1000);
  return true;
}

/**
 * Show instrument list
 */
export function openInstrumentList(): boolean {
  useUIStore.getState().setStatusMessage('Instrument List', false, 1000);
  return true;
}

/**
 * Show synth editor
 */
export function showSynthEditor(): boolean {
  useUIStore.getState().setStatusMessage('Synth Editor', false, 1000);
  return true;
}

/**
 * Show message/comments editor
 */
export function openMessageEditor(): boolean {
  useUIStore.getState().setStatusMessage('Message Editor', false, 1000);
  return true;
}

/**
 * Show order list / sequence panel
 */
export function showOrderList(): boolean {
  useUIStore.getState().setStatusMessage('Order List', false, 1000);
  return true;
}

/**
 * Open settings/configuration
 */
export function openSettings(): boolean {
  useUIStore.getState().setStatusMessage('Open Settings from menu', false, 1000);
  return true;
}

/**
 * Toggle tree view / browser panel
 */
export function toggleTreeView(): boolean {
  useUIStore.getState().setStatusMessage('Tree View toggled', false, 1000);
  return true;
}

/**
 * View general tab
 */
export function viewGeneral(): boolean {
  useUIStore.getState().setStatusMessage('General View', false, 1000);
  return true;
}

/**
 * View pattern tab
 */
export function viewPattern(): boolean {
  useUIStore.getState().setStatusMessage('Pattern View', false, 1000);
  return true;
}

/**
 * View samples tab
 */
export function viewSamples(): boolean {
  useUIStore.getState().setStatusMessage('Samples View', false, 1000);
  return true;
}

/**
 * View instruments tab
 */
export function viewInstruments(): boolean {
  useUIStore.getState().setStatusMessage('Instruments View', false, 1000);
  return true;
}

/**
 * View comments tab
 */
export function viewComments(): boolean {
  useUIStore.getState().setStatusMessage('Comments View', false, 1000);
  return true;
}

/**
 * View MIDI mapping
 */
export function viewMidiMapping(): boolean {
  useUIStore.getState().setStatusMessage('MIDI Mapping', false, 1000);
  return true;
}

/**
 * View options/preferences
 */
export function viewOptions(): boolean {
  useUIStore.getState().setStatusMessage('See Settings menu', false, 1000);
  return true;
}

/**
 * Toggle fullscreen
 */
export function toggleFullscreen(): boolean {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      useUIStore.getState().setStatusMessage('Fullscreen not available', false, 1000);
    });
    useUIStore.getState().setStatusMessage('Fullscreen', false, 1000);
  } else {
    document.exitFullscreen();
    useUIStore.getState().setStatusMessage('Exit fullscreen', false, 1000);
  }
  return true;
}

/**
 * Show various panels (OctaMED style)
 */
export function showFilesPanel(): boolean {
  useUIStore.getState().setStatusMessage('Files Panel', false, 1000);
  return true;
}

export function showPlayPanel(): boolean {
  useUIStore.getState().setStatusMessage('Play Panel', false, 1000);
  return true;
}

export function showInstrumentsPanel(): boolean {
  useUIStore.getState().setStatusMessage('Instruments Panel', false, 1000);
  return true;
}

export function showBlockPanel(): boolean {
  useUIStore.getState().setStatusMessage('Block Panel', false, 1000);
  return true;
}

export function showEditPanel(): boolean {
  useUIStore.getState().setStatusMessage('Edit Panel', false, 1000);
  return true;
}

export function showMiscPanel(): boolean {
  useUIStore.getState().setStatusMessage('Misc Panel', false, 1000);
  return true;
}

export function showVolumePanel(): boolean {
  useUIStore.getState().setStatusMessage('Volume Panel', false, 1000);
  return true;
}

export function showMidiPanel(): boolean {
  useUIStore.getState().setStatusMessage('MIDI Panel', false, 1000);
  return true;
}

export function showTransposePanel(): boolean {
  useUIStore.getState().setStatusMessage('Transpose Panel', false, 1000);
  return true;
}

export function showRangePanel(): boolean {
  useUIStore.getState().setStatusMessage('Range Panel', false, 1000);
  return true;
}
