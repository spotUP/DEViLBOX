/**
 * useProjectPersistence - Auto-save and load project from localStorage
 * 
 * SCHEMA VERSIONING: When making breaking changes to instrument configs,
 * bump SCHEMA_VERSION to invalidate old cached data.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, useAutomationStore, useAudioStore } from '@stores';
import type { AutomationCurve } from '@typedefs/automation';
import type { EffectConfig } from '@typedefs/instrument';
import { needsMigration, migrateProject } from '@/lib/migration';

const STORAGE_KEY = 'devilbox-project';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

/**
 * SCHEMA VERSION - Bump this when making breaking changes to stored data format.
 * This will cause old localStorage data to be discarded on load.
 * 
 * History:
 * - 2: Fixed filterSelect=255 bug (was invalid, now defaults to 1)
 */
const SCHEMA_VERSION = 2;

interface SavedProject {
  version: string;
  schemaVersion?: number; // Schema version for breaking change detection
  savedAt: string;
  metadata: ReturnType<typeof useProjectStore.getState>['metadata'];
  bpm: number;
  patterns: ReturnType<typeof useTrackerStore.getState>['patterns'];
  patternOrder?: number[]; // Song arrangement - which patterns play in which order
  instruments: ReturnType<typeof useInstrumentStore.getState>['instruments'];
  automation?: AutomationCurve[];
  masterEffects?: EffectConfig[];
  grooveTemplateId?: string; // Groove/swing template ID
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
    const automationState = useAutomationStore.getState();
    const audioState = useAudioStore.getState();

    const savedProject: SavedProject = {
      version: '1.0.0',
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      metadata: projectState.metadata,
      bpm: transportState.bpm,
      patterns: trackerState.patterns,
      patternOrder: trackerState.patternOrder,
      instruments: instrumentState.instruments.map(inst => {
        // Optimization: Don't save blob URLs for baked instruments
        // They will be re-calculated on load
        if (inst.metadata?.preservedSynth && inst.sample?.url?.startsWith('blob:')) {
          const cleanedInst = { ...inst };
          cleanedInst.sample = { ...inst.sample, url: '' };
          return cleanedInst;
        }
        return inst;
      }),
      automation: automationState.curves,
      masterEffects: audioState.masterEffects,
      // Only save groove template if not the default
      ...(transportState.grooveTemplateId !== 'straight' ? { grooveTemplateId: transportState.grooveTemplateId } : {}),
    };

    // Don't save projects with MOD/XM/IT/S3M imported instruments
    // Sample data (AudioBuffers, blob URLs) can't be serialized to JSON
    // Better to not save at all than to save broken/silent data
    const hasImportedModules = savedProject.instruments.some(
      (inst) => inst.metadata?.importedFrom === 'MOD' || 
                inst.metadata?.importedFrom === 'XM' ||
                inst.metadata?.importedFrom === 'IT' ||
                inst.metadata?.importedFrom === 'S3M'
    );

    if (hasImportedModules) {
      console.log('[Persistence] Skipping save: project contains imported module data that cannot persist');
      return false;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProject));
    projectState.markAsSaved();
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
      return false;
    }

    const project: SavedProject = JSON.parse(saved);

    // Validate structure
    if (!project.version || !project.patterns || !project.instruments) {
      console.warn('[Persistence] Invalid saved project structure');
      return false;
    }

    // SCHEMA VERSION CHECK: Discard old data if schema is outdated
    if (!project.schemaVersion || project.schemaVersion < SCHEMA_VERSION) {
      console.warn(
        `[Persistence] Discarding outdated localStorage data (schema ${project.schemaVersion || 1} < ${SCHEMA_VERSION}). ` +
        'This happens after app updates that fix data bugs. Your work was auto-saved but needs to be re-imported.'
      );
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }

    // Check if migration is needed (old format → new XM format)
    if (needsMigration(project.patterns, project.instruments)) {
      // Perform migration
      const migrated = migrateProject(project.patterns, project.instruments);
      project.patterns = migrated.patterns;
      project.instruments = migrated.instruments;

    }

    // Load data into stores
    const trackerStore = useTrackerStore.getState();
    const instrumentStore = useInstrumentStore.getState();
    const projectStore = useProjectStore.getState();
    const transportStore = useTransportStore.getState();
    const automationStore = useAutomationStore.getState();
    const audioStore = useAudioStore.getState();

    // Load patterns
    trackerStore.loadPatterns(project.patterns);

    // Load pattern order (song arrangement)
    if (project.patternOrder && project.patternOrder.length > 0) {
      trackerStore.setPatternOrder(project.patternOrder);
    }

    // Load instruments
    instrumentStore.loadInstruments(project.instruments);

    // Load metadata
    projectStore.setMetadata(project.metadata);

    // Load BPM
    transportStore.setBPM(project.bpm);

    // Load automation curves
    if (project.automation) {
      automationStore.loadCurves(project.automation);
    }

    // Load master effects
    if (project.masterEffects) {
      audioStore.setMasterEffects(project.masterEffects);
    }

    // Load groove template (always reset to straight if not specified)
    transportStore.setGrooveTemplate(project.grooveTemplateId || 'straight');

    // Auto-bake any instruments that need it (async)
    instrumentStore.autoBakeInstruments();

    projectStore.markAsSaved();
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

  // Subscribe to transport store changes (BPM, groove template)
  useEffect(() => {
    const unsubscribe = useTransportStore.subscribe((state, prevState) => {
      if (state.bpm !== prevState.bpm || state.grooveTemplateId !== prevState.grooveTemplateId) {
        markAsModified();
      }
    });

    return unsubscribe;
  }, [markAsModified]);

  // Don't subscribe to automation store changes - we're not saving automation
  // useEffect(() => {
  //   const unsubscribe = useAutomationStore.subscribe((state, prevState) => {
  //     if (state.curves !== prevState.curves) {
  //       markAsModified();
  //     }
  //   });
  //
  //   return unsubscribe;
  // }, [markAsModified]);

  // Don't subscribe to audio store changes (master effects) - we're not saving master effects
  // useEffect(() => {
  //   const unsubscribe = useAudioStore.subscribe((state, prevState) => {
  //     if (state.masterEffects !== prevState.masterEffects) {
  //       markAsModified();
  //     }
  //   });
  //
  //   return unsubscribe;
  // }, [markAsModified]);

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
