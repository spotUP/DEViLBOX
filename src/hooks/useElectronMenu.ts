/**
 * useElectronMenu - Handle native OS menu actions in Electron
 */

import { useEffect, useCallback } from 'react';
import { onMenuAction, isElectron } from '@utils/electron';
import { useTrackerStore, useTransportStore, useProjectStore, useHistoryStore } from '@stores';
import { useProjectPersistence } from './useProjectPersistence';
import { getToneEngine } from '@engine/ToneEngine';

export function useElectronMenu(
  callbacks: {
    onShowExport: () => void;
    onShowHelp: () => void;
    onShowMasterFX: () => void;
    onShowInstruments: () => void;
    onImport: () => void;
  }
) {
  const { 
    currentPatternIndex, 
    setCurrentPattern,
    patterns,
    toggleRecordMode,
    reset: resetTracker,
    replacePattern
  } = useTrackerStore();
  
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const { togglePlayPause } = useTransportStore();
  const { resetProject } = useProjectStore();
  const { save: saveProject } = useProjectPersistence();

  // Handle undo action
  const handleUndo = useCallback(() => {
    if (!canUndo()) return;
    const pattern = undo();
    if (pattern) {
      replacePattern(currentPatternIndex, pattern);
    }
  }, [undo, canUndo, replacePattern, currentPatternIndex]);

  // Handle redo action
  const handleRedo = useCallback(() => {
    if (!canRedo()) return;
    const pattern = redo();
    if (pattern) {
      replacePattern(currentPatternIndex, pattern);
    }
  }, [redo, canRedo, replacePattern, currentPatternIndex]);

  useEffect(() => {
    if (!isElectron()) return;

    onMenuAction((action) => {
      console.log('[ElectronMenu] Received action:', action);
      
      switch (action) {
        // File
        case 'new-project':
          if (confirm('Create new project? Current unsaved changes will be lost.')) {
            resetProject();
            resetTracker();
            getToneEngine().resetProject();
          }
          break;
        case 'open-song':
          // Triggers file input in NavBar/Toolbar
          document.querySelector<HTMLInputElement>('input[type="file"][accept*=".json"]')?.click();
          break;
        case 'import-module':
          callbacks.onImport();
          break;
        case 'save-project':
          saveProject();
          break;
        case 'download-song':
          // Simulate click on download button in toolbar
          document.querySelector<HTMLButtonElement>('button[title*="Download song file"]')?.click();
          break;
        case 'export-audio':
          callbacks.onShowExport();
          break;

        // Edit
        case 'undo':
          handleUndo();
          break;
        case 'redo':
          handleRedo();
          break;

        // View
        case 'toggle-automation':
          // Simple selector for the automation toggle button
          document.querySelector<HTMLButtonElement>('[data-automation-toggle]')?.click();
          break;
        case 'toggle-master-fx':
          callbacks.onShowMasterFX();
          break;

        // Transport
        case 'toggle-play':
          togglePlayPause();
          break;
        case 'toggle-record':
          toggleRecordMode();
          break;
        case 'next-pattern':
          if (currentPatternIndex < patterns.length - 1) {
            setCurrentPattern(currentPatternIndex + 1);
          }
          break;
        case 'prev-pattern':
          if (currentPatternIndex > 0) {
            setCurrentPattern(currentPatternIndex - 1);
          }
          break;

        // Help
        case 'show-help':
          callbacks.onShowHelp();
          break;
        case 'show-about':
          // For now just show help
          callbacks.onShowHelp();
          break;
      }
    });
  }, [
    callbacks, 
    handleUndo, handleRedo, currentPatternIndex, setCurrentPattern, patterns.length, 
    togglePlayPause, toggleRecordMode, resetProject, resetTracker, saveProject
  ]);
}