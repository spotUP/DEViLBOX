/**
 * useProjectPersistence - Auto-save and load project using IndexedDB
 *
 * IndexedDB provides hundreds of MB of storage, eliminating size limits
 * that plagued the old localStorage approach.
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


const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

// IndexedDB constants
const IDB_NAME = 'devilbox';
const IDB_VERSION = 2;
const IDB_STORE = 'project';
const IDB_REVISIONS_STORE = 'revisions';
const IDB_PROJECT_KEY = 'current';
const MAX_REVISIONS = 50;

// Safari fallback for requestIdleCallback
const requestIdleCallbackPolyfill =
  typeof window !== 'undefined' && window.requestIdleCallback ||
  ((cb: IdleRequestCallback) => setTimeout(() => cb({
    didTimeout: false,
    timeRemaining: () => 50
  } as IdleDeadline), 1) as unknown as typeof window.requestIdleCallback);

const cancelIdleCallbackPolyfill =
  typeof window !== 'undefined' && window.cancelIdleCallback ||
  ((id: number) => clearTimeout(id));

const safeRequestIdleCallback = requestIdleCallbackPolyfill;
const safeCancelIdleCallback = cancelIdleCallbackPolyfill;

/**
 * SCHEMA VERSION - Bump this when making breaking changes to stored data format.
 * This will cause old data to be discarded on load.
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
 * - 14: Clean initial state — no default instruments, no song. Tracker starts empty.
 */
const SCHEMA_VERSION = 14;

interface SavedProject {
  version: string;
  schemaVersion?: number;
  savedAt: string;
  metadata: ReturnType<typeof useProjectStore.getState>['metadata'];
  bpm: number;
  patterns: ReturnType<typeof useTrackerStore.getState>['patterns'];
  patternOrder?: number[];
  instruments: ReturnType<typeof useInstrumentStore.getState>['instruments'];
  automation?: AutomationCurve[];
  masterEffects?: EffectConfig[];
  grooveTemplateId?: string;
  arrangement?: ArrangementSnapshot;
}

// ============================================================================
// INDEXEDDB LAYER
// ============================================================================

let cachedDB: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  if (cachedDB) return Promise.resolve(cachedDB);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_REVISIONS_STORE)) {
        const store = db.createObjectStore(IDB_REVISIONS_STORE, { autoIncrement: true });
        store.createIndex('savedAt', 'savedAt');
      }
    };
    req.onsuccess = () => {
      cachedDB = req.result;
      cachedDB.onclose = () => { cachedDB = null; };
      resolve(cachedDB);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbPut(project: SavedProject): Promise<void> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(project, IDB_PROJECT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGet(): Promise<SavedProject | undefined> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_PROJECT_KEY);
    req.onsuccess = () => resolve(req.result as SavedProject | undefined);
    req.onerror = () => reject(req.error);
  }));
}

function idbDelete(): Promise<void> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_PROJECT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbHas(): Promise<boolean> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).count(IDB_PROJECT_KEY);
    req.onsuccess = () => resolve(req.result > 0);
    req.onerror = () => reject(req.error);
  }));
}

// ============================================================================
// REVISION STORAGE
// ============================================================================

export interface LocalRevision {
  key: number;
  savedAt: string;
  name: string;
  patternCount: number;
  instrumentCount: number;
}

function idbPutRevision(project: SavedProject): Promise<void> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_REVISIONS_STORE, 'readwrite');
    tx.objectStore(IDB_REVISIONS_STORE).add(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbListRevisions(): Promise<LocalRevision[]> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_REVISIONS_STORE, 'readonly');
    const store = tx.objectStore(IDB_REVISIONS_STORE);
    const req = store.openCursor(null, 'prev');
    const results: LocalRevision[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const val = cursor.value as SavedProject;
        results.push({
          key: cursor.key as number,
          savedAt: val.savedAt,
          name: val.metadata?.name || 'Untitled',
          patternCount: val.patterns?.length || 0,
          instrumentCount: val.instruments?.length || 0,
        });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  }));
}

function idbGetRevision(key: number): Promise<SavedProject | undefined> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_REVISIONS_STORE, 'readonly');
    const req = tx.objectStore(IDB_REVISIONS_STORE).get(key);
    req.onsuccess = () => resolve(req.result as SavedProject | undefined);
    req.onerror = () => reject(req.error);
  }));
}

function idbDeleteRevision(key: number): Promise<void> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_REVISIONS_STORE, 'readwrite');
    tx.objectStore(IDB_REVISIONS_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbPruneRevisions(max: number): Promise<void> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_REVISIONS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_REVISIONS_STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result;
      if (total <= max) { resolve(); return; }
      // Delete oldest entries (lowest keys)
      const toDelete = total - max;
      const cursorReq = store.openCursor();
      let deleted = 0;
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// ============================================================================
// PROJECT SERIALIZATION
// ============================================================================

function buildSavedProject(): SavedProject {
  const trackerState = useTrackerStore.getState();
  const instrumentState = useInstrumentStore.getState();
  const projectState = useProjectStore.getState();
  const transportState = useTransportStore.getState();
  const automationState = useAutomationStore.getState();
  const audioState = useAudioStore.getState();
  const arrangementState = useArrangementStore.getState();

  return {
    version: '1.0.0',
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    metadata: projectState.metadata,
    bpm: transportState.bpm,
    patterns: trackerState.patterns,
    patternOrder: trackerState.patternOrder,
    instruments: instrumentState.instruments.map(inst => {
      // Don't save blob URLs for baked instruments — re-calculated on load
      if (inst.metadata?.preservedSynth && inst.sample?.url?.startsWith('blob:')) {
        const cleanedInst = { ...inst };
        cleanedInst.sample = { ...inst.sample, url: '' };
        return cleanedInst;
      }
      // Strip non-serializable audioBuffer (IndexedDB uses structured clone
      // which handles more types than JSON, but AudioBuffer isn't clonable).
      // The base64 data URL (sample.url) is the serializable equivalent.
      if (inst.sample?.audioBuffer) {
        const cleanedInst = { ...inst };
        cleanedInst.sample = { ...inst.sample, audioBuffer: undefined };
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
    ...(transportState.grooveTemplateId !== 'straight' ? { grooveTemplateId: transportState.grooveTemplateId } : {}),
    ...(arrangementState.tracks.length > 0 ? { arrangement: arrangementState.getSnapshot() } : {}),
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Save current project to IndexedDB
 */
export async function saveProjectToStorage(): Promise<boolean> {
  try {
    const savedProject = buildSavedProject();
    await idbPut(savedProject);
    // Save a revision copy (non-blocking — don't let revision failures block saves)
    idbPutRevision(savedProject)
      .then(() => idbPruneRevisions(MAX_REVISIONS))
      .catch(err => console.warn('[Persistence] Failed to save revision:', err));
    useProjectStore.getState().markAsSaved();
    return true;
  } catch (error) {
    console.error('[Persistence] Failed to save project:', error);
    import('@stores/useNotificationStore').then(({ notify }) => {
      notify.error('Failed to save project.');
    });
    return false;
  }
}

/**
 * Load project from IndexedDB
 */
export async function loadProjectFromStorage(): Promise<boolean> {
  try {
    const project = await idbGet();
    if (!project) return false;

    // Validate structure
    if (!project.version || !project.patterns || !project.instruments) {
      console.warn('[Persistence] Invalid saved project structure');
      return false;
    }

    // SCHEMA VERSION CHECK: Discard old data if schema is outdated
    if (!project.schemaVersion || project.schemaVersion < SCHEMA_VERSION) {
      console.warn(
        `[Persistence] Discarding outdated data (schema ${project.schemaVersion || 1} < ${SCHEMA_VERSION}). ` +
        'This happens after app updates that fix data bugs.'
      );
      await idbDelete().catch(() => {});
      return false;
    }

    // Check if migration is needed (old format → new XM format)
    if (needsMigration(project.patterns, project.instruments)) {
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

    trackerStore.loadPatterns(project.patterns);

    if (project.patternOrder && project.patternOrder.length > 0) {
      trackerStore.setPatternOrder(project.patternOrder);
    }

    instrumentStore.loadInstruments(project.instruments);
    projectStore.setMetadata(project.metadata);
    transportStore.setBPM(project.bpm);

    if (project.automation) {
      automationStore.loadCurves(project.automation);
    }

    if (project.masterEffects) {
      audioStore.setMasterEffects(project.masterEffects);
    }

    transportStore.setGrooveTemplate(project.grooveTemplateId || 'straight');

    if (project.arrangement) {
      const arrangementStore = useArrangementStore.getState();
      arrangementStore.loadSnapshot(project.arrangement);
    }

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
export async function hasSavedProject(): Promise<boolean> {
  try {
    return await idbHas();
  } catch {
    return false;
  }
}

/**
 * Clear saved project
 */
export async function clearSavedProject(): Promise<void> {
  try { await idbDelete(); } catch { /* ignore */ }
}

// ============================================================================
// LOCAL REVISIONS PUBLIC API
// ============================================================================

/**
 * List all local revisions, newest-first
 */
export async function listLocalRevisions(): Promise<LocalRevision[]> {
  try {
    return await idbListRevisions();
  } catch (err) {
    console.error('[Persistence] Failed to list revisions:', err);
    return [];
  }
}

/**
 * Load a local revision by key into all stores (same as loadProjectFromStorage)
 */
export async function loadLocalRevision(key: number): Promise<boolean> {
  try {
    const project = await idbGetRevision(key);
    if (!project) return false;
    if (!project.version || !project.patterns || !project.instruments) return false;

    if (needsMigration(project.patterns, project.instruments)) {
      const migrated = migrateProject(project.patterns, project.instruments);
      project.patterns = migrated.patterns;
      project.instruments = migrated.instruments;
    }

    const trackerStore = useTrackerStore.getState();
    const instrumentStore = useInstrumentStore.getState();
    const projectStore = useProjectStore.getState();
    const transportStore = useTransportStore.getState();
    const automationStore = useAutomationStore.getState();
    const audioStore = useAudioStore.getState();

    trackerStore.loadPatterns(project.patterns);
    if (project.patternOrder && project.patternOrder.length > 0) {
      trackerStore.setPatternOrder(project.patternOrder);
    }
    instrumentStore.loadInstruments(project.instruments);
    projectStore.setMetadata(project.metadata);
    transportStore.setBPM(project.bpm);
    if (project.automation) automationStore.loadCurves(project.automation);
    if (project.masterEffects) audioStore.setMasterEffects(project.masterEffects);
    transportStore.setGrooveTemplate(project.grooveTemplateId || 'straight');
    if (project.arrangement) {
      const arrangementStore = useArrangementStore.getState();
      arrangementStore.loadSnapshot(project.arrangement);
    }
    instrumentStore.autoBakeInstruments();
    projectStore.markAsSaved();
    return true;
  } catch (err) {
    console.error('[Persistence] Failed to load revision:', err);
    return false;
  }
}

/**
 * Delete a single local revision by key
 */
export async function deleteLocalRevision(key: number): Promise<void> {
  try {
    await idbDeleteRevision(key);
  } catch (err) {
    console.error('[Persistence] Failed to delete revision:', err);
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
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      hasSavedProject().then(has => {
        if (has) loadProjectFromStorage();
      });
    }
  }, []);

  // Subscribe to tracker store changes to mark as dirty
  useEffect(() => {
    const unsubscribe = useTrackerStore.subscribe((state, prevState) => {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
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

  // Auto-save with requestIdleCallback
  const idleCallbackRef = useRef<ReturnType<typeof safeRequestIdleCallback> | null>(null);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (idleCallbackRef.current) {
      safeCancelIdleCallback(idleCallbackRef.current as number);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (!isDirty) return;

      idleCallbackRef.current = safeRequestIdleCallback(
        (deadline) => {
          if (deadline.timeRemaining() > 50) {
            void saveProjectToStorage();
          } else {
            saveTimeoutRef.current = setTimeout(() => {
              if (isDirty) {
                void saveProjectToStorage();
              }
            }, 5000);
          }
        },
        { timeout: 60000 }
      );
    }, AUTO_SAVE_INTERVAL);
  }, [isDirty]);

  useEffect(() => {
    if (isDirty) {
      scheduleAutoSave();
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (idleCallbackRef.current) {
        safeCancelIdleCallback(idleCallbackRef.current as number);
      }
    };
  }, [isDirty, scheduleAutoSave]);

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        void saveProjectToStorage();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const save = useCallback(() => saveProjectToStorage(), []);
  const load = useCallback(() => loadProjectFromStorage(), []);

  return { save, load, clear: clearSavedProject, isDirty };
}
