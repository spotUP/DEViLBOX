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
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, useAutomationStore, useAudioStore, useEditorStore, useFormatStore } from '@stores';
import type { AutomationCurve } from '@typedefs/automation';
import type { EffectConfig } from '@typedefs/instrument';
import { needsMigration, migrateProject } from '@/lib/migration';
import { getOriginalModuleDataForExport, getNativeEngineDataForExport, getNativeEngineMetaForExport, restoreNativeEngineData } from '@/lib/export/exporters';
import { compressProject } from '@/lib/projectCompression';
import { useMixerStore } from '@stores/useMixerStore';
import { useDrumPadStore } from '@stores/useDrumPadStore';
import { useDubStore } from '@stores/useDubStore';


const AUTO_SAVE_INTERVAL = 300000; // 5 minutes

// ============================================================================
// EXPLICIT SAVE TRACKING
// ============================================================================
// Tracks whether the user has explicitly saved this project (Ctrl+S / save button).
// Auto-save and revision creation are gated on this flag to prevent:
// - Auto-saving songs that were only loaded/played (not user's own work)
// - Creating revisions for other people's songs loaded from files
// - Overwriting saved state with an externally-loaded song
let explicitlySaved = false;

// Module-level guard: prevents loadProjectFromStorage from running more than once
// per page session, even if the hook remounts (e.g. due to Vite HMR).
let hasLoadedFromStorage = false;

/**
 * Mark the current project as explicitly saved by the user.
 * Called after Ctrl+S / save button and when restoring from IDB / revision.
 */
export function markExplicitlySaved(): void { explicitlySaved = true; }

/**
 * Clear the explicit-save flag. Called when loading external songs/files.
 * This prevents auto-save from overwriting the user's saved project with
 * someone else's song that was just loaded for playback.
 */
export function clearExplicitlySaved(): void { explicitlySaved = false; }

/**
 * Check if the current project has been explicitly saved at least once.
 */
export function isExplicitlySaved(): boolean { return explicitlySaved; }

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
 * - 15: SuperCollider default now includes pre-compiled SynthDef binary so new
 *       instruments produce sound immediately without requiring sclang compilation.
 * - 16: TB-303 defaults updated to match real 303 hardware:
 *       accentDecay 0.006→0.057 (47ms→200ms), softAttack 0→0.25 (0.3ms→3ms),
 *       normalDecay 0.164→0.404 (517ms→1230ms), slideTime 0.17→0.162 (63ms→60ms).
 *       Previous values caused harsh/clicky accent sound.
 * - 17: Added speed, trackerFormat, linearPeriods, restartPosition to saved project.
 *       XM files saved as .dbx now preserve playback parameters for accurate reload.
 * - 18: Added replacedInstruments for hybrid WASM/ToneEngine synth playback.
 *       When a sample instrument is replaced with a synth, its ID is saved so
 *       hybrid playback state persists across save/reload.
 * - 19: Tracker channels now use monophonic synth instances (MonoSynth/FMSynth/AMSynth)
 *       instead of PolySynth wrappers. Enables FT2-style frequency modulation for
 *       arpeggio, vibrato, portamento effects. Old PolySynth instances incompatible.
 * - 20: Phase 1 of Tracker Dub Studio — Pattern.dubLane added for per-pattern
 *       dub automation (DubEvent[] recorded live or written in the lane editor).
 *       Purely additive; patterns without dubLane load identically to v19.
 * - 21: Time-mode dub lanes for non-editable formats (raw SID, SC68). DubLane
 *       gains optional `kind: 'row' | 'time'` and `durationSec`; DubEvent gains
 *       optional `timeSec` and `durationSec`. Absence = row mode (back-compat).
 */
const SCHEMA_VERSION = 21;

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
  arrangement?: Record<string, unknown>;
  speed?: number;
  trackerFormat?: string;
  linearPeriods?: boolean;
  restartPosition?: number;
  replacedInstruments?: number[];
  originalModuleData?: { base64: string; format: string; sourceFile?: string };
  nativeEngineData?: Record<string, string>;
  nativeEngineMeta?: Record<string, unknown>;
  mixer?: import('@stores/useMixerStore').MixerSnapshot;
  dubBus?: Partial<import('@/types/dub').DubBusSettings>;
  autoDub?: { enabled: boolean; persona: string; intensity: number; moveBlacklist: string[] };
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
  const editorState = useEditorStore.getState();

  // Derive trackerFormat from first pattern's importMetadata
  const firstPattern = trackerState.patterns[0];
  const trackerFormat = firstPattern?.importMetadata?.sourceFormat as string | undefined;

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
      // Strip raw ArrayBuffer fields before saving — data URLs (sample.url) are
      // the serializable equivalent and survive both IDB and JSON round-trips.
      const needsClean =
        inst.sample?.audioBuffer ||
        inst.metadata?.preservedSample?.audioBuffer ||
        inst.metadata?.multiSamples?.some(ms => ms.sample?.audioBuffer);
      if (needsClean) {
        const cleanedInst = { ...inst };
        if (cleanedInst.sample?.audioBuffer) {
          cleanedInst.sample = { ...cleanedInst.sample, audioBuffer: undefined };
        }
        if (cleanedInst.metadata) {
          const cleanedMeta = { ...cleanedInst.metadata };
          if (cleanedMeta.preservedSample?.audioBuffer) {
            cleanedMeta.preservedSample = {
              ...cleanedMeta.preservedSample,
              audioBuffer: undefined as unknown as ArrayBuffer,
            };
          }
          if (cleanedMeta.multiSamples) {
            cleanedMeta.multiSamples = cleanedMeta.multiSamples.map(ms =>
              ms.sample?.audioBuffer
                ? { ...ms, sample: { ...ms.sample, audioBuffer: undefined } }
                : ms
            );
          }
          cleanedInst.metadata = cleanedMeta;
        }
        return cleanedInst;
      }
      return inst;
    }),
    automation: automationState.curves,
    masterEffects: audioState.masterEffects,
    ...(transportState.grooveTemplateId !== 'straight' ? { grooveTemplateId: transportState.grooveTemplateId } : {}),
    ...(transportState.speed !== 6 ? { speed: transportState.speed } : {}),
    ...(trackerFormat ? { trackerFormat } : {}),
    ...(editorState.linearPeriods ? { linearPeriods: editorState.linearPeriods } : {}),
    ...(() => {
      const omd = getOriginalModuleDataForExport();
      return omd ? { originalModuleData: omd } : {};
    })(),
    ...(() => {
      const ned = getNativeEngineDataForExport();
      return ned ? { nativeEngineData: ned } : {};
    })(),
    ...(() => {
      const nem = getNativeEngineMetaForExport();
      return nem ? { nativeEngineMeta: nem } : {};
    })(),
    // Save replaced instrument IDs for hybrid playback persistence
    ...(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTrackerReplayer } = require('@engine/TrackerReplayer');
        const replayer = getTrackerReplayer();
        if (replayer.hasReplacedInstruments) {
          return { replacedInstruments: replayer.replacedInstrumentIds };
        }
      } catch { /* replayer not initialized */ }
      return {};
    })(),
    // Mixer state — channel volumes, pans, mutes, solos, dub sends, send buses
    mixer: {
      channels: useMixerStore.getState().channels,
      master: useMixerStore.getState().master,
      sendBuses: useMixerStore.getState().sendBuses,
    },
    // Dub bus tuning — character preset + coloring params
    dubBus: useDrumPadStore.getState().dubBus,
    // Auto Dub state
    ...(() => {
      const s = useDubStore.getState();
      return {
        autoDub: {
          enabled: s.autoDubEnabled,
          persona: s.autoDubPersona,
          intensity: s.autoDubIntensity,
          moveBlacklist: s.autoDubMoveBlacklist ?? [],
        },
      };
    })(),
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Save current project to IndexedDB.
 * @param options.explicit - If true, marks this as a user-initiated save (Ctrl+S / button).
 *   Auto-saves call without this flag and are skipped if the project hasn't been explicitly saved.
 */
export async function saveProjectToStorage(options?: { explicit?: boolean }): Promise<boolean> {
  const isExplicit = options?.explicit ?? false;

  if (isExplicit) {
    explicitlySaved = true;
  }

  // Skip auto-save for projects the user never explicitly saved
  if (!explicitlySaved) {
    return false;
  }

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
 * Convert pattern.dubLane.events[] to automation store curves.
 * Called on project load to migrate old dub lane event data (schema ≤21) to the
 * new automation-curve format. After migration, dubLane.events is cleared so the
 * same events are not migrated again on the next save/load cycle.
 *
 * Each DubEvent becomes a curve on (patternId, channelIndex):
 *   - Trigger (no durationRows): spike on/off at row / row+0.05
 *   - Hold (durationRows > 0): value=1 at row, value=0 at row+durationRows
 *   - No channelId (global): channelIndex=-1 sentinel
 */
export function migrateDubLaneEvents(pattern: { id: string; dubLane?: { events: unknown[] } }): void {
  const lane = (pattern as { dubLane?: { events: Array<{
    id: string;
    moveId: string;
    channelId?: number;
    row: number;
    durationRows?: number;
    params: Record<string, number>;
  }> } }).dubLane;
  if (!lane || !lane.events || lane.events.length === 0) return;

  const store = useAutomationStore.getState();

  for (const event of lane.events) {
    if (event.row == null) continue;
    const channelIndex: number = event.channelId ?? -1;
    const param = `dub.${event.moveId}`;

    // Find or create the curve for this pattern / channel / parameter
    const existing = store.getCurvesForPattern(pattern.id, channelIndex).find(c => c.parameter === param);
    let curveId = existing?.id ?? '';
    if (!curveId) {
      curveId = store.addCurve(pattern.id, channelIndex, param);
      if (curveId) store.updateCurve(curveId, { mode: 'steps' });
    }
    if (!curveId) continue;

    store.addPoint(curveId, event.row, 1);
    if (typeof event.durationRows === 'number' && event.durationRows > 0) {
      // Hold: release point at end of hold
      store.addPoint(curveId, event.row + event.durationRows, 0);
    } else {
      // Trigger: near-instant spike — reset to 0 just after fire row
      store.addPoint(curveId, event.row + 0.05, 0);
    }
  }

  lane.events = [];
}

/**
 * Load project from IndexedDB.
 * Pass ?reset in the URL to skip restore and clear stored data (emergency recovery).
 */
export async function loadProjectFromStorage(): Promise<boolean> {
  try {
    // Emergency escape hatch: ?reset in URL clears all stored data
    if (typeof window !== 'undefined' && window.location.search.includes('reset')) {
      console.warn('[Persistence] ?reset detected — clearing stored project data');
      await idbDelete().catch(() => {});
      // Remove the ?reset param so subsequent reloads work normally
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', url.toString());
      return false;
    }

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
    if (project.speed) transportStore.setSpeed(project.speed);

    if (project.linearPeriods != null) {
      useEditorStore.getState().setLinearPeriods(project.linearPeriods);
    }

    if (project.automation) {
      automationStore.loadCurves(project.automation);
    }

    // Migrate old dubLane.events[] → automation curves (one-time conversion)
    for (const pattern of project.patterns) {
      migrateDubLaneEvents(pattern as Parameters<typeof migrateDubLaneEvents>[0]);
    }

    if (project.masterEffects) {
      audioStore.setMasterEffects(project.masterEffects);
    }

    transportStore.setGrooveTemplate(project.grooveTemplateId || 'straight');

    // arrangement data ignored — arrangement view removed

    // Tag first pattern with sourceFormat so TrackerReplayer gets correct format
    if (project.trackerFormat && project.patterns.length > 0 && !project.patterns[0].importMetadata?.sourceFormat) {
      const p0 = project.patterns[0];
      p0.importMetadata = {
        ...p0.importMetadata,
        sourceFormat: project.trackerFormat,
      } as typeof p0.importMetadata;
    }

    // Restore native engine data (all WASM formats)
    restoreNativeEngineData(project.nativeEngineData, project.nativeEngineMeta, project.linearPeriods);
    if (project.originalModuleData?.base64) {
      useFormatStore.getState().setOriginalModuleData(project.originalModuleData as any);
    }

    instrumentStore.autoBakeInstruments();

    // Restore replaced instruments for hybrid playback
    if (project.replacedInstruments?.length) {
      setTimeout(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getTrackerReplayer } = require('@engine/TrackerReplayer');
          const replayer = getTrackerReplayer();
          replayer.restoreReplacedInstruments(project.replacedInstruments!);
        } catch (e) {
          console.warn('[Persistence] Failed to restore replaced instruments:', e);
        }
      }, 500);
    }

    projectStore.markAsSaved();

    // Restore mixer state (channel volumes, pans, mutes, solos, dub sends, send buses)
    if (project.mixer) {
      useMixerStore.getState().loadMixerState(project.mixer);
    }

    // Restore dub bus tuning
    if (project.dubBus) {
      useDrumPadStore.getState().setDubBus(project.dubBus as any);
    }

    // Restore Auto Dub state
    if (project.autoDub) {
      const s = useDubStore.getState();
      s.setAutoDubPersona(project.autoDub.persona as any);
      s.setAutoDubIntensity(project.autoDub.intensity);
      s.setAutoDubMoveBlacklist(project.autoDub.moveBlacklist ?? []);
      s.setAutoDubEnabled(project.autoDub.enabled);
    }

    // Restoring user's own saved project — auto-save is safe
    explicitlySaved = true;
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

/**
 * Serialize the current project to a compressed binary Blob (DVBZ format).
 * Falls back cleanly — old versions can't read it, but new code reads both.
 */
export function serializeProjectToBlob(): Blob {
  const savedProject = buildSavedProject();
  const json = JSON.stringify(savedProject);
  const compressed = compressProject(json);
  return new Blob([compressed], { type: 'application/octet-stream' });
}

/**
 * Deserialize and load a project from a parsed JSON object.
 * Accepts the same SavedProject structure written by serializeProjectToBlob().
 * Returns true on success, false on failure/incompatible schema.
 */
export async function loadProjectFromObject(data: unknown): Promise<boolean> {
  // Loading from external file — not the user's saved project
  explicitlySaved = false;
  try {
    const project = data as SavedProject;
    if (!project?.version || !project?.patterns || !project?.instruments) {
      console.warn('[Persistence] Invalid project structure in file');
      return false;
    }

    if (!project.schemaVersion || project.schemaVersion < SCHEMA_VERSION) {
      console.warn(
        `[Persistence] Discarding outdated project file (schema ${project.schemaVersion ?? 1} < ${SCHEMA_VERSION}).`
      );
      return false;
    }

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
    if (project.speed) transportStore.setSpeed(project.speed);
    if (project.linearPeriods != null) {
      useEditorStore.getState().setLinearPeriods(project.linearPeriods);
    }
    if (project.automation) automationStore.loadCurves(project.automation);
    // Migrate old dubLane.events[] → automation curves (one-time conversion)
    for (const pattern of project.patterns) {
      migrateDubLaneEvents(pattern as Parameters<typeof migrateDubLaneEvents>[0]);
    }
    if (project.masterEffects) audioStore.setMasterEffects(project.masterEffects);
    transportStore.setGrooveTemplate(project.grooveTemplateId || 'straight');
    // arrangement data ignored — arrangement view removed

    // Tag first pattern with sourceFormat so TrackerReplayer gets correct format
    if (project.trackerFormat && project.patterns.length > 0 && !project.patterns[0].importMetadata?.sourceFormat) {
      const p0 = project.patterns[0];
      p0.importMetadata = {
        ...p0.importMetadata,
        sourceFormat: project.trackerFormat,
      } as typeof p0.importMetadata;
    }

    // Restore native engine data (all WASM formats)
    restoreNativeEngineData(project.nativeEngineData, project.nativeEngineMeta, project.linearPeriods);
    if (project.originalModuleData?.base64) {
      useFormatStore.getState().setOriginalModuleData(project.originalModuleData as any);
    }

    instrumentStore.autoBakeInstruments();

    // Restore replaced instruments for hybrid playback
    if (project.replacedInstruments?.length) {
      setTimeout(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getTrackerReplayer } = require('@engine/TrackerReplayer');
          const replayer = getTrackerReplayer();
          replayer.restoreReplacedInstruments(project.replacedInstruments!);
        } catch (e) {
          console.warn('[Persistence] Failed to restore replaced instruments:', e);
        }
      }, 500);
    }

    projectStore.markAsSaved();

    // Restore mixer state
    if (project.mixer) {
      useMixerStore.getState().loadMixerState(project.mixer);
    }

    // Restore dub bus tuning
    if (project.dubBus) {
      useDrumPadStore.getState().setDubBus(project.dubBus as any);
    }

    // Restore Auto Dub state
    if (project.autoDub) {
      const s = useDubStore.getState();
      s.setAutoDubPersona(project.autoDub.persona as any);
      s.setAutoDubIntensity(project.autoDub.intensity);
      s.setAutoDubMoveBlacklist(project.autoDub.moveBlacklist ?? []);
      s.setAutoDubEnabled(project.autoDub.enabled);
    }

    return true;
  } catch (err) {
    console.error('[Persistence] Failed to load project from object:', err);
    return false;
  }
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
    if (project.speed) transportStore.setSpeed(project.speed);
    if (project.linearPeriods != null) {
      useEditorStore.getState().setLinearPeriods(project.linearPeriods);
    }
    if (project.automation) automationStore.loadCurves(project.automation);
    // Migrate old dubLane.events[] → automation curves (one-time conversion)
    for (const pattern of project.patterns) {
      migrateDubLaneEvents(pattern as Parameters<typeof migrateDubLaneEvents>[0]);
    }
    if (project.masterEffects) audioStore.setMasterEffects(project.masterEffects);
    transportStore.setGrooveTemplate(project.grooveTemplateId || 'straight');
    // arrangement data ignored — arrangement view removed

    // Tag first pattern with sourceFormat so TrackerReplayer gets correct format
    if (project.trackerFormat && project.patterns.length > 0 && !project.patterns[0].importMetadata?.sourceFormat) {
      const p0 = project.patterns[0];
      p0.importMetadata = {
        ...p0.importMetadata,
        sourceFormat: project.trackerFormat,
      } as typeof p0.importMetadata;
    }

    // Restore native engine data (all WASM formats)
    restoreNativeEngineData(project.nativeEngineData, project.nativeEngineMeta, project.linearPeriods);
    if (project.originalModuleData?.base64) {
      useFormatStore.getState().setOriginalModuleData(project.originalModuleData as any);
    }

    instrumentStore.autoBakeInstruments();

    // Restore replaced instruments for hybrid playback
    if (project.replacedInstruments?.length) {
      setTimeout(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getTrackerReplayer } = require('@engine/TrackerReplayer');
          const replayer = getTrackerReplayer();
          replayer.restoreReplacedInstruments(project.replacedInstruments!);
        } catch (e) {
          console.warn('[Persistence] Failed to restore replaced instruments:', e);
        }
      }, 500);
    }

    projectStore.markAsSaved();

    // Restore mixer state
    if (project.mixer) {
      useMixerStore.getState().loadMixerState(project.mixer);
    }

    // Restore dub bus tuning
    if (project.dubBus) {
      useDrumPadStore.getState().setDubBus(project.dubBus as any);
    }

    // Restore Auto Dub state
    if (project.autoDub) {
      const s = useDubStore.getState();
      s.setAutoDubPersona(project.autoDub.persona as any);
      s.setAutoDubIntensity(project.autoDub.intensity);
      s.setAutoDubMoveBlacklist(project.autoDub.moveBlacklist ?? []);
      s.setAutoDubEnabled(project.autoDub.enabled);
    }

    // Restoring user's own revision — auto-save is safe
    explicitlySaved = true;
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
  const initialLoadRef = useRef(true);

  // Load on mount (only once per page session — module-level guard survives HMR remounts)
  useEffect(() => {
    if (!hasLoadedFromStorage) {
      hasLoadedFromStorage = true;
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
      if (!isDirty || !explicitlySaved) return;

      idleCallbackRef.current = safeRequestIdleCallback(
        (deadline) => {
          if (deadline.timeRemaining() > 50) {
            void saveProjectToStorage();
          } else {
            saveTimeoutRef.current = setTimeout(() => {
              if (isDirty && explicitlySaved) {
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

  // Warn before unload if there are unsaved changes — production only.
  // In dev, the dialog blocks hot reloads / MCP page reloads and wedges the
  // browser tab, so we silently autosave if explicitlySaved was on and skip
  // the confirm. Dirty state persists in IndexedDB regardless via
  // saveProjectToStorage, so nothing is actually lost.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        if (explicitlySaved) void saveProjectToStorage();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const save = useCallback(() => saveProjectToStorage({ explicit: true }), []);
  const load = useCallback(() => loadProjectFromStorage(), []);

  return { save, load, clear: clearSavedProject, isDirty };
}
