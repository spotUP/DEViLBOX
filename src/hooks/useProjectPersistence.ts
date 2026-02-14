/**
 * useProjectPersistence - Auto-save and load project from localStorage
 * 
 * SCHEMA VERSIONING: When making breaking changes to instrument configs,
 * bump SCHEMA_VERSION to invalidate old cached data.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, useAutomationStore, useAudioStore } from '@stores';
import { useArrangementStore } from '@stores/useArrangementStore';
import type { AutomationCurve } from '@typedefs/automation';
import type { EffectConfig } from '@typedefs/instrument';
import type { ArrangementSnapshot } from '@typedefs/arrangement';
import { needsMigration, migrateProject } from '@/lib/migration';


const STORAGE_KEY = 'devilbox-project';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

/**
 * SCHEMA VERSION - Bump this when making breaking changes to stored data format.
 * This will cause old localStorage data to be discarded on load.
 *
 * History:
 * - 2: Fixed filterSelect=255 bug (was invalid, now defaults to 1)
 * - 3: Split WAM plugins — effects moved to effect browser, synths are individual types
 * - 4: Fixed DB303 defaults to match db303 default-preset.xml (diodeCharacter=1, filterInputDrive=0.169, etc.)
 * - 5: Fixed DB303 Korg parameter mirroring + inversions (HMR could save schema 4 with stale configs)
 * - 6: Fixed DB303 defaults — was using preset XML values (passbandCompensation=0.09, diodeCharacter=1)
 *      instead of app startup defaults (0.9, 0). Old values nearly neutralized the filter.
 * - 7: Fixed DB303 volume 0.8→1.0 (reference never sets volume; lower values starve filter nonlinearities)
 *      Fixed applyConfig param order: oversamplingOrder+filterSelect now set FIRST (matching reference init).
 * - 8: DevilFish now defaults to disabled (vanilla 303). Volume knob restored.
 *      Fixed volume mismatch between default instrument (was -6dB) and presets (was 1dB).
 * - 9: Added korgEnabled, lfo.enabled toggles. pulseWidth default 1→0 (50% duty = true square).
 *      Wave blend knob replaces SAW/SQR toggle.
 * - 10: Added arrangement timeline view snapshot to saved project.
 * - 11: Fixed TB-303 DevilFish defaults to match reference default-preset.xml
 *       (accentDecay 0.1→0.006, normalDecay 0.5→0.164, accentSoftAttack 0.5→0.1,
 *        filterInputDrive 0→0.169, diodeCharacter 0→1, duffingAmount 0→0.03).
 *       Old defaults killed acid screams — accentDecay was 17x too slow.
 * - 12: Fixed passbandCompensation (0.9→0.09) and resTracking (0.7→0.257) — both were
 *       inverted params where app value ≠ XML value. WASM was getting 0.1 instead of 0.91
 *       for passbandCompensation and 0.3 instead of 0.743 for resTracking.
 *       Fixed filterSelect migration (was hardcoding invalid value 1, now 0).
 */
const SCHEMA_VERSION = 13;

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
  arrangement?: ArrangementSnapshot; // Arrangement timeline view data
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
    const arrangementState = useArrangementStore.getState();

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
        // Strip non-serializable audioBuffer from samples before saving.
        // ArrayBuffer becomes {} after JSON.stringify, breaking restore.
        // The base64 data URL (sample.url) is the serializable equivalent.
        if (inst.sample?.audioBuffer) {
          const cleanedInst = { ...inst };
          cleanedInst.sample = { ...inst.sample, audioBuffer: undefined };
          // Also strip audioBuffer from preservedSample in metadata
          if (cleanedInst.metadata?.preservedSample?.audioBuffer) {
            cleanedInst.metadata = {
              ...cleanedInst.metadata,
              preservedSample: { ...cleanedInst.metadata.preservedSample, audioBuffer: undefined as unknown as ArrayBuffer },
            };
          }
          return cleanedInst;
        }
        return inst;
      }),
      automation: automationState.curves,
      masterEffects: audioState.masterEffects,
      // Only save groove template if not the default
      ...(transportState.grooveTemplateId !== 'straight' ? { grooveTemplateId: transportState.grooveTemplateId } : {}),
      // Save arrangement if it has any tracks/clips
      ...(arrangementState.tracks.length > 0 ? { arrangement: arrangementState.getSnapshot() } : {}),
    };

    // Sample audioBuffers have been stripped above — base64 data URLs are the
    // serializable equivalent and survive JSON round-trips. On restore, ToneEngine
    // falls through to URL-based loading when audioBuffer is missing.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProject));
    } catch (storageError) {
      // QuotaExceededError: project too large for localStorage (usually 5-10 MB limit)
      // This can happen with many large sample-based instruments
      console.warn('[Persistence] localStorage quota exceeded, project not saved:', storageError);
      return false;
    }
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

    // Load arrangement timeline data
    if (project.arrangement) {
      const arrangementStore = useArrangementStore.getState();
      arrangementStore.loadSnapshot(project.arrangement);
    }

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

  // Subscribe to arrangement store changes (clips, tracks, markers)
  useEffect(() => {
    const unsubscribe = useArrangementStore.subscribe((state, prevState) => {
      if (state.clips !== prevState.clips ||
          state.tracks !== prevState.tracks ||
          state.markers !== prevState.markers) {
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
