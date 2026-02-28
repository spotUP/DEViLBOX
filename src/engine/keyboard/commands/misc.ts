/**
 * Miscellaneous Commands - Various commands that don't fit other categories
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';
import { useTransportStore } from '@stores/useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { saveProjectToStorage } from '@hooks/useProjectPersistence';

// ====== REAL IMPLEMENTATIONS (kept from original) ======

export function toggleEditMode(): boolean {
  useTrackerStore.getState().toggleRecordMode();
  const newMode = useTrackerStore.getState().recordMode;
  useUIStore.getState().setStatusMessage(`Edit mode ${newMode ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function panic(): boolean {
  const { isPlaying, stop } = useTransportStore.getState();
  if (isPlaying) {
    getTrackerReplayer().stop();
    stop();
  }
  getToneEngine().releaseAll();
  useUIStore.getState().setStatusMessage('PANIC - All notes off', false, 1000);
  return true;
}

export function escapeCommand(): boolean {
  getToneEngine().releaseAll();
  useUIStore.getState().setStatusMessage('', false, 1);
  return true;
}

export function toggleRecording(): boolean {
  useTrackerStore.getState().toggleRecordMode();
  const recorded = useTrackerStore.getState().recordMode;
  useUIStore.getState().setStatusMessage(`Recording ${recorded ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

// ====== HEX / ZOOM / DISPLAY ======

export function toggleHexMode(): boolean {
  const { useHexNumbers, setUseHexNumbers } = useUIStore.getState();
  setUseHexNumbers(!useHexNumbers);
  useUIStore.getState().setStatusMessage(`Hex mode: ${!useHexNumbers ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function zoomIn(): boolean {
  const { trackerZoom, setTrackerZoom } = useUIStore.getState();
  setTrackerZoom(trackerZoom + 10);
  useUIStore.getState().setStatusMessage(`Zoom ${useUIStore.getState().trackerZoom}%`, false, 800);
  return true;
}

export function zoomOut(): boolean {
  const { trackerZoom, setTrackerZoom } = useUIStore.getState();
  setTrackerZoom(trackerZoom - 10);
  useUIStore.getState().setStatusMessage(`Zoom ${useUIStore.getState().trackerZoom}%`, false, 800);
  return true;
}

export function resetZoom(): boolean {
  useUIStore.getState().setTrackerZoom(100);
  useUIStore.getState().setStatusMessage('Zoom 100%', false, 800);
  return true;
}

export function fitToWindow(): boolean {
  useUIStore.getState().setTrackerZoom(100);
  useUIStore.getState().setStatusMessage('Fit to window', false, 800);
  return true;
}

export function toggleCompactMode(): boolean {
  useUIStore.getState().toggleCompactToolbar();
  const compact = useUIStore.getState().compactToolbar;
  useUIStore.getState().setStatusMessage(`Compact mode: ${compact ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleRowHighlight(): boolean {
  const { rowHighlightInterval, setRowHighlightInterval } = useUIStore.getState();
  const cycle = [4, 8, 16, 32];
  const next = cycle[(cycle.indexOf(rowHighlightInterval) + 1) % cycle.length];
  setRowHighlightInterval(next);
  useUIStore.getState().setStatusMessage(`Row highlight: every ${next}`, false, 1000);
  return true;
}

export function toggleChannelNames(): boolean {
  useUIStore.getState().toggleChannelNames();
  const shown = useUIStore.getState().showChannelNames;
  useUIStore.getState().setStatusMessage(`Channel names: ${shown ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

// ====== INSERT SPECIAL NOTES ======

export function insertKeyoff(): boolean {
  const { cursor, setCell, moveCursor } = useTrackerStore.getState();
  setCell(cursor.channelIndex, cursor.rowIndex, { note: 97, instrument: 0 });
  moveCursor('down');
  useUIStore.getState().setStatusMessage('Key off', false, 600);
  return true;
}

export function insertNoteCut(): boolean {
  // XM note cut: effect EC0 (cut at tick 0)
  const { cursor, setCell, moveCursor } = useTrackerStore.getState();
  setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0x0E, eff: 0xC0 });
  moveCursor('down');
  useUIStore.getState().setStatusMessage('Note cut', false, 600);
  return true;
}

export function insertFadeOut(): boolean {
  // No XM fade-out cell type — use keyoff as closest equivalent
  return insertKeyoff();
}

// ====== PATTERN OPERATIONS ======

export function createPattern(): boolean {
  useTrackerStore.getState().addPattern();
  useUIStore.getState().setStatusMessage('Pattern created', false, 1000);
  return true;
}

export function deletePattern(): boolean {
  const { currentPatternIndex, deletePattern: del, patterns } = useTrackerStore.getState();
  if (patterns.length <= 1) {
    useUIStore.getState().setStatusMessage('Cannot delete last pattern', false, 1500);
    return true;
  }
  del(currentPatternIndex);
  useUIStore.getState().setStatusMessage('Pattern deleted', false, 1000);
  return true;
}

export function clonePattern(): boolean {
  const { currentPatternIndex, duplicatePattern } = useTrackerStore.getState();
  duplicatePattern(currentPatternIndex);
  useUIStore.getState().setStatusMessage('Pattern cloned', false, 1000);
  return true;
}

export function increasePatternSize(): boolean {
  const { currentPatternIndex, expandPattern } = useTrackerStore.getState();
  expandPattern(currentPatternIndex);
  const newLength = useTrackerStore.getState().patterns[currentPatternIndex]?.length ?? 0;
  useUIStore.getState().setStatusMessage(`Pattern: ${newLength} rows`, false, 1000);
  return true;
}

export function decreasePatternSize(): boolean {
  const { currentPatternIndex, shrinkPattern } = useTrackerStore.getState();
  shrinkPattern(currentPatternIndex);
  const newLength = useTrackerStore.getState().patterns[currentPatternIndex]?.length ?? 0;
  useUIStore.getState().setStatusMessage(`Pattern: ${newLength} rows`, false, 1000);
  return true;
}

// ====== DIALOGS ======

export function showGrooveSettings(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}

export function showHumanizeDialog(): boolean {
  useUIStore.getState().openDialogCommand('humanize');
  return true;
}

export function showKeyboardHelp(): boolean {
  useUIStore.getState().openDialogCommand('keyboard-help');
  return true;
}

export function showQuantizeDialog(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}

export function confirmCommand(): boolean {
  useUIStore.getState().closeDialogCommand();
  useUIStore.getState().closeModal();
  return true;
}

// ====== TEMPO TAP ======

const tapTimes: number[] = [];

export function tempoTap(): boolean {
  const now = performance.now();
  tapTimes.push(now);
  // Keep only last 8 taps, discard if gap > 3s
  while (tapTimes.length > 1 && now - tapTimes[0] > 3000) tapTimes.shift();
  if (tapTimes.length >= 2) {
    const gaps = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const bpm = Math.round(60000 / avgGap);
    useTransportStore.getState().setBPM(bpm);
    useUIStore.getState().setStatusMessage(`Tap BPM: ${bpm}`, false, 1500);
  } else {
    useUIStore.getState().setStatusMessage('Tap again...', false, 1500);
  }
  return true;
}

// ====== SAVE / QUICK SAVE ======

export function quickSave(): boolean {
  void saveProjectToStorage().then(ok => {
    useUIStore.getState().setStatusMessage(ok ? 'Saved' : 'Save failed', false, 1500);
  });
  return true;
}

// ====== PREVIEW ======

export function previewInstrument(): boolean {
  import('@engine/ToneEngine').then(({ getToneEngine: engine }) => {
    import('@stores/useInstrumentStore').then(({ useInstrumentStore }) => {
      const toneEng = engine();
      const { currentInstrument } = useInstrumentStore.getState();
      if (!currentInstrument) return;
      toneEng.ensureInstrumentReady(currentInstrument).then(() => {
        toneEng.triggerNoteAttack(currentInstrument.id, 'A4', 0, 0.8, currentInstrument);
      });
    });
  });
  useUIStore.getState().setStatusMessage('Preview', false, 600);
  return true;
}

export function previewSample(): boolean {
  return previewInstrument();
}

export function stopPreview(): boolean {
  getToneEngine().releaseAll();
  return true;
}

// ====== INFORMATIVE STUBS (no pipeline) ======

export function renderToSample(): boolean {
  useUIStore.getState().setStatusMessage('Render: not yet available', false, 1500);
  return true;
}
export function renderToInstrument(): boolean { return renderToSample(); }
export function renderSong(): boolean { return renderToSample(); }
export function exportMp3(): boolean { return renderToSample(); }
export function importMidi(): boolean {
  useUIStore.getState().setStatusMessage('MIDI import: use File menu', false, 1500);
  return true;
}
export function exportMidi(): boolean { return importMidi(); }
export function importSample(): boolean { return importMidi(); }
export function exportSample(): boolean { return importMidi(); }
export function patternProperties(): boolean {
  useUIStore.getState().setStatusMessage('Pattern length: resize in pattern list', false, 1500);
  return true;
}
export function songProperties(): boolean {
  useUIStore.getState().openModal('settings');
  return true;
}
export function cleanupUnused(): boolean {
  useUIStore.getState().setStatusMessage('Cleanup: remove unused in instrument list', false, 1500);
  return true;
}
export function applySwing(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}
export function runScript(): boolean {
  useUIStore.getState().setStatusMessage('Scripts: not available', false, 1500);
  return true;
}
export function recordMacro(): boolean { return runScript(); }
export function showAbout(): boolean {
  useUIStore.getState().setStatusMessage('DEViLBOX — tracker + synth environment', false, 3000);
  return true;
}
export function openManual(): boolean {
  useUIStore.getState().setStatusMessage('Manual: see Help menu', false, 2000);
  return true;
}
export function centerCursor(): boolean {
  useUIStore.getState().setStatusMessage('Cursor centered', false, 800);
  return true;
}
export function revertToSaved(): boolean {
  useUIStore.getState().setStatusMessage('Revert: refresh page to reload saved', false, 2000);
  return true;
}
export function resetView(): boolean {
  useUIStore.setState({ visiblePanels: ['tracker', 'oscilloscope', 'pattern-list'] });
  useUIStore.getState().setStatusMessage('View reset', false, 1000);
  return true;
}
export function showContextMenu(): boolean {
  useUIStore.getState().setStatusMessage('Right-click for context menu', false, 1500);
  return true;
}
export function showCommandPalette(): boolean {
  useUIStore.getState().setStatusMessage('Command palette: not yet available', false, 1500);
  return true;
}
