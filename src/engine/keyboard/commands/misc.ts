/**
 * Miscellaneous Commands - Various commands that don't fit other categories
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { useTransportStore } from '@stores/useTransportStore';

/**
 * Show about dialog
 */
export function showAbout(): boolean {
  useUIStore.getState().setStatusMessage('About DEViLBOX', false, 2000);
  return true;
}

/**
 * Show keyboard shortcuts help
 */
export function showKeyboardHelp(): boolean {
  useUIStore.getState().setStatusMessage('Keyboard shortcuts', false, 1000);
  return true;
}

/**
 * Open manual/documentation
 */
export function openManual(): boolean {
  window.open('https://github.com/username/devilbox/wiki', '_blank');
  useUIStore.getState().setStatusMessage('Opening manual...', false, 1000);
  return true;
}

/**
 * Toggle edit mode
 */
export function toggleEditMode(): boolean {
  useTrackerStore.getState().toggleRecordMode();
  const newMode = useTrackerStore.getState().recordMode;
  useUIStore.getState().setStatusMessage(`Edit mode ${newMode ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

/**
 * Panic - stop all sounds immediately
 */
export function panic(): boolean {
  // Actually silence all audio — stop replayer, engine, and release all notes
  const { isPlaying, stop } = useTransportStore.getState();
  if (isPlaying) {
    getTrackerReplayer().stop();
    stop();
  }
  getToneEngine().releaseAll();
  useUIStore.getState().setStatusMessage('PANIC - All notes off', false, 1000);
  return true;
}

/**
 * Center cursor (scroll to center current position)
 */
export function centerCursor(): boolean {
  useUIStore.getState().setStatusMessage('Cursor centered', false, 1000);
  return true;
}

/**
 * Insert keyoff note
 */
export function insertKeyoff(): boolean {
  useUIStore.getState().setStatusMessage('Insert keyoff', false, 1000);
  return true;
}

/**
 * Insert note cut
 */
export function insertNoteCut(): boolean {
  useUIStore.getState().setStatusMessage('Insert note cut', false, 1000);
  return true;
}

/**
 * Insert fade out
 */
export function insertFadeOut(): boolean {
  useUIStore.getState().setStatusMessage('Insert fade out', false, 1000);
  return true;
}

/**
 * Render selection to sample
 */
export function renderToSample(): boolean {
  useUIStore.getState().setStatusMessage('Render to sample', false, 1000);
  return true;
}

/**
 * Render selection to new instrument
 */
export function renderToInstrument(): boolean {
  useUIStore.getState().setStatusMessage('Render to instrument', false, 1000);
  return true;
}

/**
 * Render entire song to WAV
 */
export function renderSong(): boolean {
  useUIStore.getState().setStatusMessage('Render song', false, 1000);
  return true;
}

/**
 * Export to MP3
 */
export function exportMp3(): boolean {
  useUIStore.getState().setStatusMessage('Export MP3', false, 1000);
  return true;
}

/**
 * Quick save (auto-named backup)
 */
export function quickSave(): boolean {
  useUIStore.getState().setStatusMessage('Quick save', false, 1000);
  return true;
}

/**
 * Revert to last saved
 */
export function revertToSaved(): boolean {
  useUIStore.getState().setStatusMessage('Revert to saved', false, 1000);
  return true;
}

/**
 * Toggle compact mode
 */
export function toggleCompactMode(): boolean {
  useUIStore.getState().setStatusMessage('Toggle compact mode', false, 1000);
  return true;
}

/**
 * Reset view to default
 */
export function resetView(): boolean {
  useUIStore.getState().setStatusMessage('View reset', false, 1000);
  return true;
}

/**
 * Increase pattern size
 */
export function increasePatternSize(): boolean {
  useUIStore.getState().setStatusMessage('Increase pattern size', false, 1000);
  return true;
}

/**
 * Decrease pattern size
 */
export function decreasePatternSize(): boolean {
  useUIStore.getState().setStatusMessage('Decrease pattern size', false, 1000);
  return true;
}

/**
 * Toggle hex mode
 */
export function toggleHexMode(): boolean {
  useUIStore.getState().setStatusMessage('Toggle hex mode', false, 1000);
  return true;
}

/**
 * Toggle row highlight
 */
export function toggleRowHighlight(): boolean {
  useUIStore.getState().setStatusMessage('Toggle row highlight', false, 1000);
  return true;
}

/**
 * Toggle channel names
 */
export function toggleChannelNames(): boolean {
  useUIStore.getState().setStatusMessage('Toggle channel names', false, 1000);
  return true;
}

/**
 * Zoom in
 */
export function zoomIn(): boolean {
  useUIStore.getState().setStatusMessage('Zoom in', false, 1000);
  return true;
}

/**
 * Zoom out
 */
export function zoomOut(): boolean {
  useUIStore.getState().setStatusMessage('Zoom out', false, 1000);
  return true;
}

/**
 * Reset zoom
 */
export function resetZoom(): boolean {
  useUIStore.getState().setStatusMessage('Zoom reset', false, 1000);
  return true;
}

/**
 * Fit to window
 */
export function fitToWindow(): boolean {
  useUIStore.getState().setStatusMessage('Fit to window', false, 1000);
  return true;
}

/**
 * Clone pattern to slot
 */
export function clonePattern(): boolean {
  useUIStore.getState().setStatusMessage('Clone pattern', false, 1000);
  return true;
}

/**
 * Create new pattern
 */
export function createPattern(): boolean {
  useUIStore.getState().setStatusMessage('Create pattern', false, 1000);
  return true;
}

/**
 * Delete current pattern
 */
export function deletePattern(): boolean {
  useUIStore.getState().setStatusMessage('Delete pattern', false, 1000);
  return true;
}

/**
 * Import MIDI file
 */
export function importMidi(): boolean {
  useUIStore.getState().setStatusMessage('Import MIDI', false, 1000);
  return true;
}

/**
 * Export MIDI file
 */
export function exportMidi(): boolean {
  useUIStore.getState().setStatusMessage('Export MIDI', false, 1000);
  return true;
}

/**
 * Import sample
 */
export function importSample(): boolean {
  useUIStore.getState().setStatusMessage('Import sample', false, 1000);
  return true;
}

/**
 * Export sample
 */
export function exportSample(): boolean {
  useUIStore.getState().setStatusMessage('Export sample', false, 1000);
  return true;
}

/**
 * Open pattern properties
 */
export function patternProperties(): boolean {
  useUIStore.getState().setStatusMessage('Pattern properties', false, 1000);
  return true;
}

/**
 * Open song properties
 */
export function songProperties(): boolean {
  useUIStore.getState().setStatusMessage('Song properties', false, 1000);
  return true;
}

/**
 * Open cleanup dialog
 */
export function cleanupUnused(): boolean {
  useUIStore.getState().setStatusMessage('Cleanup unused', false, 1000);
  return true;
}

/**
 * Toggle recording
 */
export function toggleRecording(): boolean {
  useTrackerStore.getState().toggleRecordMode();
  const recorded = useTrackerStore.getState().recordMode;
  useUIStore.getState().setStatusMessage(`Recording ${recorded ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

/**
 * Preview current instrument
 */
export function previewInstrument(): boolean {
  useUIStore.getState().setStatusMessage('Preview instrument', false, 1000);
  return true;
}

/**
 * Preview current sample
 */
export function previewSample(): boolean {
  useUIStore.getState().setStatusMessage('Preview sample', false, 1000);
  return true;
}

/**
 * Stop preview
 */
export function stopPreview(): boolean {
  useUIStore.getState().setStatusMessage('Stop preview', false, 1000);
  return true;
}

/**
 * Show tempo tap dialog
 */
export function tempoTap(): boolean {
  useUIStore.getState().setStatusMessage('Tempo tap', false, 1000);
  return true;
}

/**
 * Show quantize dialog
 */
export function showQuantizeDialog(): boolean {
  useUIStore.getState().setStatusMessage('Quantize', false, 1000);
  return true;
}

/**
 * Show humanize dialog
 */
export function showHumanizeDialog(): boolean {
  useUIStore.getState().setStatusMessage('Humanize', false, 1000);
  return true;
}

/**
 * Show groove settings
 */
export function showGrooveSettings(): boolean {
  useUIStore.getState().setStatusMessage('Groove settings', false, 1000);
  return true;
}

/**
 * Apply swing
 */
export function applySwing(): boolean {
  useUIStore.getState().setStatusMessage('Apply swing', false, 1000);
  return true;
}

/**
 * Run script/macro
 */
export function runScript(): boolean {
  useUIStore.getState().setStatusMessage('Run script', false, 1000);
  return true;
}

/**
 * Record macro
 */
export function recordMacro(): boolean {
  useUIStore.getState().setStatusMessage('Record macro', false, 1000);
  return true;
}

/**
 * Escape - cancel current operation
 */
export function escapeCommand(): boolean {
  // Silence any hanging note previews
  getToneEngine().releaseAll();
  useUIStore.getState().setStatusMessage('', false, 1);
  return true;
}

/**
 * Confirm current operation
 */
export function confirmCommand(): boolean {
  useUIStore.getState().setStatusMessage('Confirmed', false, 1000);
  return true;
}

/**
 * Show context menu
 */
export function showContextMenu(): boolean {
  useUIStore.getState().setStatusMessage('Context menu', false, 1000);
  return true;
}

/**
 * Show quick command palette
 */
export function showCommandPalette(): boolean {
  useUIStore.getState().setStatusMessage('Command palette', false, 1000);
  return true;
}
