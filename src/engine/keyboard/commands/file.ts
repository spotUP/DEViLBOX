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

      // UADE chip RAM export (all UADE formats with encoder)
      if (song?.uadePatternLayout) {
        const { UADEChipEditor } = await import('@engine/uade/UADEChipEditor');
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        if (UADEEngine.hasInstance()) {
          const editor = new UADEChipEditor(UADEEngine.getInstance());
          const filename = (song.name || 'module') + '.' + song.uadePatternLayout.formatId;
          await editor.exportEditedModule(song.uadePatternLayout, filename);
          useUIStore.getState().setStatusMessage('Module exported', false, 1500);
          return;
        }
      }

      // Non-UADE native format exports
      if (song) {
        const sourceFormat = song.patterns[0]?.importMetadata?.sourceFormat;

        // Digital Symphony (.dsym) export via LZW compressor
        if (sourceFormat === 'DigitalSymphony') {
          const { exportDigitalSymphony } = await import('@/lib/export/DigitalSymphonyExporter');
          const { saveAs } = await import('file-saver');
          const buf = exportDigitalSymphony(song);
          const filename = (song.name || 'module').replace(/\.[^/.]+$/, '') + '.dsym';
          saveAs(new Blob([buf]), filename);
          useUIStore.getState().setStatusMessage('Digital Symphony exported', false, 1500);
          return;
        }

        // MusicLine (.ml) export
        if (sourceFormat === 'MusicLine') {
          const { exportMusicLineFile } = await import('@/lib/export/MusicLineExporter');
          const { saveAs } = await import('file-saver');
          const data = exportMusicLineFile(song);
          const filename = (song.name || 'module').replace(/\.[^/.]+$/, '') + '.ml';
          saveAs(new Blob([data as BlobPart]), filename);
          useUIStore.getState().setStatusMessage('MusicLine exported', false, 1500);
          return;
        }

        // PumaTracker (.puma) export
        if (sourceFormat === 'PumaTracker' && song.pumaTrackerFileData) {
          const { exportPumaTrackerFile } = await import('@/lib/export/PumaTrackerExporter');
          const { saveAs } = await import('file-saver');
          const data = exportPumaTrackerFile(song);
          const filename = (song.name || 'module').replace(/\.[^/.]+$/, '') + '.puma';
          saveAs(new Blob([data as BlobPart]), filename);
          useUIStore.getState().setStatusMessage('PumaTracker exported', false, 1500);
          return;
        }
      }
    } catch { /* replayer not initialized */ }
  })();
  return doSave();
}
