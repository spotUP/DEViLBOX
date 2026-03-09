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

        // AMOS Music Bank (.abk) export
        if (sourceFormat === 'AMOSMusicBank') {
          const { exportAMOSMusicBank } = await import('@/lib/export/AMOSMusicBankExporter');
          const { saveAs } = await import('file-saver');
          const buf = exportAMOSMusicBank(song);
          const filename = (song.name || 'module').replace(/\.[^/.]+$/, '') + '.abk';
          saveAs(new Blob([buf]), filename);
          useUIStore.getState().setStatusMessage('AMOS Music Bank exported', false, 1500);
          return;
        }

        // FuturePlayer (.fp) export with shadow array edits
        if (sourceFormat === 'FuturePlayer' && song.futurePlayerFileData) {
          const { exportAsFuturePlayer } = await import('@/lib/export/FuturePlayerExporter');
          const { saveAs } = await import('file-saver');
          const result = await exportAsFuturePlayer(song);
          saveAs(result.data, result.filename);
          // Also save sidecar if present
          if (result.sidecar) {
            saveAs(result.sidecar.data, result.sidecar.filename);
          }
          const msg = result.warnings.length > 0
            ? `FuturePlayer exported — ${result.warnings[0]}`
            : 'FuturePlayer exported';
          useUIStore.getState().setStatusMessage(msg, false, 2500);
          return;
        }

        // SidMon II (.sd2) export
        if (sourceFormat === 'SIDMON2' && song.sd2FileData) {
          const { exportSidMon2File } = await import('@/lib/export/SidMon2Exporter');
          const { saveAs } = await import('file-saver');
          const data = await exportSidMon2File(song);
          const filename = (song.name || 'module').replace(/\.[^/.]+$/, '') + '.sd2';
          saveAs(new Blob([data as BlobPart]), filename);
          useUIStore.getState().setStatusMessage('SidMon II exported', false, 1500);
          return;
        }

        // Music Assembler (.ma) export
        if (sourceFormat === 'MusicAssembler' && song.maFileData) {
          const { exportAsMusicAssembler } = await import('@/lib/export/MusicAssemblerExporter');
          const { saveAs } = await import('file-saver');
          const result = await exportAsMusicAssembler(song);
          saveAs(result.data, result.filename);
          useUIStore.getState().setStatusMessage('Music Assembler exported', false, 1500);
          return;
        }

        // Symphonie Pro (.symmod) export
        if (sourceFormat === 'Symphonie' && song.symphonieFileData) {
          const { exportSymphonieProFile } = await import('@/lib/export/SymphonieProExporter');
          const { saveAs } = await import('file-saver');
          const data = exportSymphonieProFile(song);
          const filename = (song.name || 'module').replace(/\.[^/.]+$/, '') + '.symmod';
          saveAs(new Blob([data as BlobPart]), filename);
          useUIStore.getState().setStatusMessage('Symphonie exported', false, 1500);
          return;
        }
      }
    } catch { /* replayer not initialized */ }
  })();
  return doSave();
}
