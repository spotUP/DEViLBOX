/**
 * File Commands - File operations (save, load, new, export)
 */

import { useUIStore } from '@stores/useUIStore';
import { saveProjectToStorage } from '@hooks/useProjectPersistence';

function openFileBrowser(): boolean {
  useUIStore.getState().setShowFileBrowser(true);
  return true;
}

function doSave(): boolean {
  void saveProjectToStorage({ explicit: true }).then(ok => {
    useUIStore.getState().setStatusMessage(ok ? 'Project saved' : 'Save failed', false, 1500);
  });
  return true;
}

function doNew(): boolean {
  useUIStore.getState().openNewSongWizard();
  return true;
}

export function newFile(): boolean { return doNew(); }
export function openFile(): boolean { return openFileBrowser(); }
export function closeFile(): boolean {
  useUIStore.getState().setStatusMessage('Close: use browser refresh', false, 1500);
  return true;
}
export function saveFile(): boolean { return doSave(); }
export function saveAs(): boolean { return doSave(); }
export function newProject(): boolean { return doNew(); }
export function openProject(): boolean { return openFileBrowser(); }
export function saveProject(): boolean { return doSave(); }
export function newSong(): boolean { return doNew(); }
export function loadSong(): boolean { return openFileBrowser(); }
export function saveSong(): boolean { return doSave(); }
export function loadModule(): boolean { return openFileBrowser(); }
export function saveModule(): boolean {
  // If a UADE format with pattern layout is loaded, also export native format
  void (async () => {
    try {
      const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
      const replayer = getTrackerReplayer();
      const song = replayer.getSong();
      if (song?.uadePatternLayout) {
        const { UADEChipEditor } = await import('@engine/uade/UADEChipEditor');
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        if (UADEEngine.hasInstance()) {
          const editor = new UADEChipEditor(UADEEngine.getInstance());
          const filename = (song.name || 'module') + '.' + song.uadePatternLayout.formatId;
          await editor.exportEditedModule(song.uadePatternLayout, filename);
          useUIStore.getState().setStatusMessage('Module exported', false, 1500);
        }
      }
    } catch { /* replayer not initialized */ }
  })();
  return doSave();
}
