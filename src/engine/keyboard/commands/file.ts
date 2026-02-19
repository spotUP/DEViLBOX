/**
 * File Commands - File operations (save, load, new, export)
 */

import { useUIStore } from '@stores/useUIStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { saveProjectToStorage } from '@hooks/useProjectPersistence';

function openFileBrowser(): boolean {
  useUIStore.getState().setShowFileBrowser(true);
  return true;
}

function doSave(): boolean {
  const ok = saveProjectToStorage();
  useUIStore.getState().setStatusMessage(ok ? 'Project saved' : 'Save failed', false, 1500);
  return true;
}

function doNew(): boolean {
  if (!confirm('Start a new project? Unsaved changes will be lost.')) return true;
  useTrackerStore.getState().reset();
  useTransportStore.getState().reset();
  useUIStore.getState().setStatusMessage('New project', false, 1500);
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
export function saveModule(): boolean { return doSave(); }
