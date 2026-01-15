/**
 * useProjectPersistence - Auto-save and load project from localStorage
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore } from '@stores';

const STORAGE_KEY = 'scribbleton-project';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

interface SavedProject {
  version: string;
  savedAt: string;
  metadata: ReturnType<typeof useProjectStore.getState>['metadata'];
  bpm: number;
  patterns: ReturnType<typeof useTrackerStore.getState>['patterns'];
  instruments: ReturnType<typeof useInstrumentStore.getState>['instruments'];
}

/**
 * Save current project to localStorage
 */
export function saveProjectToStorage(): boolean {
  try {
    const trackerState = useTrackerStore.getState();
    const instrumentState = useInstrumentStore.getState();
    const projectState = useProjectStore.getState();
    const transportState = useTransportStore.getState();

    const savedProject: SavedProject = {
      version: '1.0.0',
      savedAt: new Date().toISOString(),
      metadata: projectState.metadata,
      bpm: transportState.bpm,
      patterns: trackerState.patterns,
      instruments: instrumentState.instruments,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProject));
    projectState.markAsSaved();
    console.log('[Persistence] Project saved to localStorage');
    return true;
  } catch (error) {
    console.error('[Persistence] Failed to save project:', error);
    return false;
  }
}

/**
 * Load project from localStorage
 */
export function loadProjectFromStorage(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      console.log('[Persistence] No saved project found');
      return false;
    }

    const project: SavedProject = JSON.parse(saved);

    // Validate structure
    if (!project.version || !project.patterns || !project.instruments) {
      console.warn('[Persistence] Invalid saved project structure');
      return false;
    }

    // Load data into stores
    const trackerStore = useTrackerStore.getState();
    const instrumentStore = useInstrumentStore.getState();
    const projectStore = useProjectStore.getState();
    const transportStore = useTransportStore.getState();
    // Note: automationStore.loadCurves would be called here once implemented

    // Load patterns
    trackerStore.loadPatterns(project.patterns);

    // Load instruments
    instrumentStore.loadInstruments(project.instruments);

    // Load metadata
    projectStore.setMetadata(project.metadata);

    // Load BPM
    transportStore.setBPM(project.bpm);

    // TODO: Add automation curve persistence once loadCurves method is available

    projectStore.markAsSaved();
    console.log('[Persistence] Project loaded from localStorage:', project.metadata.name);
    return true;
  } catch (error) {
    console.error('[Persistence] Failed to load project:', error);
    return false;
  }
}

/**
 * Check if there's a saved project
 */
export function hasSavedProject(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null;
  } catch {
    return false;
  }
}

/**
 * Clear saved project from localStorage
 */
export function clearSavedProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Persistence] Saved project cleared');
  } catch (error) {
    console.error('[Persistence] Failed to clear saved project:', error);
  }
}

/**
 * Hook for auto-save functionality
 */
export function useProjectPersistence() {
  const { isDirty, markAsModified } = useProjectStore();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);
  const initialLoadRef = useRef(true);

  // Load on mount (only once)
  useEffect(() => {
    if (!hasLoadedRef.current && hasSavedProject()) {
      hasLoadedRef.current = true;
      loadProjectFromStorage();
    }
  }, []);

  // Subscribe to tracker store changes to mark as dirty
  useEffect(() => {
    const unsubscribe = useTrackerStore.subscribe((state, prevState) => {
      // Skip marking dirty during initial load
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
      // Check if patterns changed
      if (state.patterns !== prevState.patterns) {
        markAsModified();
      }
    });

    return unsubscribe;
  }, [markAsModified]);

  // Subscribe to instrument store changes
  useEffect(() => {
    const unsubscribe = useInstrumentStore.subscribe((state, prevState) => {
      if (state.instruments !== prevState.instruments) {
        markAsModified();
      }
    });

    return unsubscribe;
  }, [markAsModified]);

  // Subscribe to transport store changes (BPM)
  useEffect(() => {
    const unsubscribe = useTransportStore.subscribe((state, prevState) => {
      if (state.bpm !== prevState.bpm) {
        markAsModified();
      }
    });

    return unsubscribe;
  }, [markAsModified]);

  // Auto-save when dirty
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (isDirty) {
        saveProjectToStorage();
      }
    }, AUTO_SAVE_INTERVAL);
  }, [isDirty]);

  // Set up auto-save interval
  useEffect(() => {
    if (isDirty) {
      scheduleAutoSave();
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isDirty, scheduleAutoSave]);

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        saveProjectToStorage();
        // Show confirmation dialog
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Manual save function
  const save = useCallback(() => {
    return saveProjectToStorage();
  }, []);

  // Manual load function
  const load = useCallback(() => {
    return loadProjectFromStorage();
  }, []);

  return {
    save,
    load,
    hasSaved: hasSavedProject(),
    clear: clearSavedProject,
    isDirty,
  };
}
