/**
 * useProjectPersistence - Auto-save and load project using IndexedDB
 *
 * IndexedDB provides hundreds of MB of storage, eliminating size limits
 * that plagued the old localStorage approach.
 *
 * SCHEMA VERSIONING: When making breaking changes to instrument configs,
 * bump SCHEMA_VERSION to invalidate old cached data.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { shouldWriteRecovery, hasProjectContent, postLoadFlags, decideBootRestore } from '@/lib/persistence/recoveryGate';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore } from '@stores';
import type { AutomationCurve } from '@typedefs/automation';
import type { EffectConfig } from '@typedefs/instrument';
import { CURRENT_SCHEMA, MIN_LOADABLE_SCHEMA, migrateSavedProject } from '@/lib/persistence/migrations';
import type { SerializedCompanionFiles } from '@/lib/export/exporters';
import { applySong } from '@/lib/song/applySong';
import { savedSongToApply } from '@/lib/song/savedSong';
import { restoreFromStoredBytes } from '@/lib/song/restoreFromStoredBytes';
import { snapshotSong } from '@/lib/song/snapshotSong';
import { compressProject } from '@/lib/projectCompression';


const AUTO_SAVE_INTERVAL = 300000; // 5 minutes

// Recovery snapshots must bound continuous-edit loss to seconds. The 5-minute
// AUTO_SAVE_INTERVAL is far too coarse (the ~5s debounce never idles during
// continuous editing), so recovery uses its own short floor.
const RECOVERY_INTERVAL = 20000; // 20 seconds
const RECOVERY_DEBOUNCE = 5000; // 5 seconds after edits settle

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
const IDB_RECOVERY_KEY = 'recovery';
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
 * - 23: `performanceJournal` — the dub performer's record of what it played and
 *       WHY (intention, target, reason, gesture state). Purely additive and
 *       forward-compatible: it never affects replay, so an older build ignoring
 *       the field loses commentary and nothing else.
 * - 22: Companion/sidecar files for two-file UADE formats (Sonix .instr/.ss,
 *       TFMX mdat+smpl, Richard Joseph, Jason Page) serialized as
 *       `nativeCompanionFiles`. Purely additive AND forward-compatible: schema-21
 *       projects load under 22 (they just have no companions), so this bump does
 *       NOT hard-discard older data — see `src/lib/persistence/migrations/`.
 */
const SCHEMA_VERSION = CURRENT_SCHEMA;

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
  nativeCompanionFiles?: SerializedCompanionFiles;
  mixer?: import('@stores/useMixerStore').MixerSnapshot;
  dubBus?: Partial<import('@/types/dub').DubBusSettings>;
  autoDub?: { enabled: boolean; persona: string; intensity: number; moveBlacklist: string[] };
  /**
   * Gate M1 — what the dub performer played and why (see
   * `src/lib/dub/performanceJournal.ts`).
   *
   * Commentary, never a replay source: the lanes and cells decide what
   * happens. A project without one loads exactly as before, and one with it
   * loads in a build that has never heard of the field.
   */
  performanceJournal?: import('@/lib/dub/performanceJournal').PerformanceJournal;
  /** The grid as loaded, hashed per cell (restore tells edits from decoder output). Additive: older saves lack it. */
  gridBaseline?: import('@/lib/song/gridBaseline').GridBaseline;
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

function idbPutRecovery(project: SavedProject): Promise<void> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(project, IDB_RECOVERY_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGetRecovery(): Promise<SavedProject | undefined> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_RECOVERY_KEY);
    req.onsuccess = () => resolve(req.result as SavedProject | undefined);
    req.onerror = () => reject(req.error);
  }));
}

function idbDeleteRecovery(): Promise<void> {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_RECOVERY_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
  return {
    version: '1.0.0',
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    ...snapshotSong(),
  } as SavedProject;
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
    // First explicit save ends the never-saved window — hand off to explicit
    // auto-save and drop the crash-recovery record.
    idbDeleteRecovery().catch(() => {});
    return true;
  } catch (error) {
    console.error('[Persistence] Failed to save project:', error);
    import('@stores/useNotificationStore').then(({ notify }) => {
      notify.error('Failed to save project.');
    });
    return false;
  }
}

export { migrateDubLaneEvents } from '@/lib/song/migrateDubLaneEvents';

/**
 * Validate, migrate, and hydrate all stores from a SavedProject. Shared by the
 * normal boot load (from the explicit-save slot) and crash-recovery restore
 * (from the recovery slot). Returns false if the snapshot is structurally
 * invalid or too old to load.
 *
 * `opts.fromRecovery` restores a recovery snapshot: the project must stay in the
 * never-saved window (explicitlySaved=false, dirty=true) so the recovery
 * scheduler keeps writing and a second crash after Restore is still covered.
 * The default path (explicit-save slot) marks the project saved and arms
 * explicit auto-save.
 */
export async function applySavedProject(project: SavedProject, opts?: { fromRecovery?: boolean }): Promise<boolean> {
  if (!prepareSavedProject(project, 'discard')) return false;
  // The stored module bytes are decoded again by today's decoder; the user's
  // edited cells, instruments, mixer and the rest of the project come from the
  // save (restoreFromStoredBytes.ts says when it keeps the saved song instead).
  const stored = savedSongToApply(project);
  const restored = await restoreFromStoredBytes(stored, project.gridBaseline);
  console.log(`[restore] ${restored.redecoded ? 're-decoded from the stored module bytes' : `kept as saved (${restored.reason})`}`);
  await applySong({ ...restored.song, gridBaseline: restored.baseline }, opts?.fromRecovery ? 'recovery' : 'project');

  // Recovery restore must stay never-saved + dirty so the scheduler re-arms;
  // the default (explicit-slot) load marks saved. Decision is the pure
  // postLoadFlags() so it is unit-testable without the audio engine.
  const projectStore = useProjectStore.getState();
  if (!opts?.fromRecovery) projectStore.markAsSaved();
  const flags = postLoadFlags({ fromRecovery: opts?.fromRecovery });
  explicitlySaved = flags.explicitlySaved;
  if (flags.dirty) projectStore.markAsModified();
  return true;
}

/**
 * Check a saved project's structure and schema, and migrate an older schema
 * in place. `onOutdated`: 'discard' deletes the stored project (the boot
 * slot), 'reject' just refuses it (a file), 'accept' loads it as is (the
 * user's own revision).
 */
function prepareSavedProject(project: SavedProject, onOutdated: 'discard' | 'reject' | 'accept'): boolean {
  if (!project?.version || !project?.patterns || !project?.instruments) {
    console.warn('[Persistence] Invalid saved project structure');
    return false;
  }
  // Only genuinely-incompatible schemas (below MIN_LOADABLE_SCHEMA) are
  // refused; newer-but-older ones are forward-migrated, so additive bumps
  // (e.g. 21->22 companion files) keep loading old projects.
  if (onOutdated !== 'accept' && (!project.schemaVersion || project.schemaVersion < MIN_LOADABLE_SCHEMA)) {
    console.warn(
      `[Persistence] Discarding outdated data (schema ${project.schemaVersion || 1} < ${MIN_LOADABLE_SCHEMA}). ` +
      'This happens after app updates that fix data bugs.'
    );
    if (onOutdated === 'discard') idbDelete().catch(() => {});
    return false;
  }
  if (project.schemaVersion && project.schemaVersion < SCHEMA_VERSION) {
    migrateSavedProject(project, project.schemaVersion);
  }
  return true;
}

/**
 * Load project from IndexedDB.
 * Pass ?reset in the URL to skip restore and clear stored data (emergency recovery).
 */
/**
 * Emergency escape hatch: `?reset` in the URL clears all stored data.
 *
 * Boot no longer loads the saved project (it offers it), so this can no longer
 * live only inside `loadProjectFromStorage` — nothing would call it. Returns
 * true when a reset happened and the caller should stop.
 */
export async function handleResetParam(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.location.search.includes('reset')) return false;
  console.warn('[Persistence] ?reset detected — clearing stored project data');
  await idbDelete().catch(() => {});
  await idbDeleteRecovery().catch(() => {}); // also clear recovery on reset
  // Remove the ?reset param so subsequent reloads work normally
  const url = new URL(window.location.href);
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', url.toString());
  return true;
}

export async function loadProjectFromStorage(): Promise<boolean> {
  try {
    if (await handleResetParam()) return false;

    const project = await idbGet();
    if (!project) return false;
    return await applySavedProject(project);
  } catch (error) {
    console.error('[Persistence] Failed to load project:', error);
    return false;
  }
}

// Test-only shims — keep IDB helpers internal to app code while letting the
// suite exercise the recovery slot round-trip. Not used by the app.
export const putRecoverySnapshotForTest = idbPutRecovery;
export const getRecoverySnapshotForTest = idbGetRecovery;
export const deleteRecoverySnapshotForTest = idbDeleteRecovery;
export function makeEmptyTestSnapshot(): SavedProject {
  return buildSavedProject();
}
/** Close and evict the module-level IDB connection. Call this in test teardown
 *  after `indexedDB.deleteDatabase('devilbox')` so the next test opens a fresh
 *  connection rather than reusing a stale cached one. */
export function closeCachedDBForTest(): void {
  if (cachedDB) {
    try { cachedDB.close(); } catch { /* ignore */ }
    cachedDB = null;
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
    if (!prepareSavedProject(project, 'reject')) return false;
    await applySong(savedSongToApply(project), 'project');
    useProjectStore.getState().markAsSaved();
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
    if (!project || !prepareSavedProject(project, 'accept')) return false;
    await applySong(savedSongToApply(project), 'revision');
    useProjectStore.getState().markAsSaved();
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
  const [recoverySnapshot, setRecoverySnapshot] = useState<SavedProject | null>(null);
  /** Which slot the pending prompt came from — it decides the post-load flags. */
  const recoverySourceRef = useRef<'saved' | 'recovery' | null>(null);
  /** Same value, for rendering: the prompt's wording differs by source. */
  const [recoverySource, setRecoverySource] = useState<'saved' | 'recovery' | null>(null);

  // Boot OFFERS stored work; it never loads it silently.
  //
  // It used to call `loadProjectFromStorage()` outright whenever a project had
  // ever been saved, so every session opened on top of the last one: "i load a
  // song on every boot because a stale song is there on every boot"
  // (2026-09-22). That second load also re-wires the dub bus underneath the
  // deck while the real song comes in.
  //
  // Only once per page session — the module-level guard survives HMR remounts.
  useEffect(() => {
    if (hasLoadedFromStorage) return;
    hasLoadedFromStorage = true;
    void (async () => {
      if (await handleResetParam()) return;

      const everExplicitlySaved = await hasSavedProject();
      const saved = everExplicitlySaved ? await idbGet().catch(() => null) : null;
      const savedHasContent =
        !!saved && hasProjectContent({
          instrumentCount: saved.instruments?.length ?? 0,
          patternCount: saved.patterns?.length ?? 0,
        });

      const rec = await idbGetRecovery().catch(() => null);
      const hasRecoveryRecord =
        !!rec && hasProjectContent({
          instrumentCount: rec.instruments?.length ?? 0,
          patternCount: rec.patterns?.length ?? 0,
        });

      const decision = decideBootRestore({
        everExplicitlySaved,
        savedHasContent,
        hasRecoveryRecord,
        savedAt: saved?.metadata?.modifiedAt ?? null,
        recoveryAt: rec?.metadata?.modifiedAt ?? null,
      });
      if (decision.kind === 'saved') {
        // The explicit slot is authoritative, as before — a crash snapshot
        // beside it is stale by definition.
        await idbDeleteRecovery().catch(() => {});
        recoverySourceRef.current = 'saved';
        setRecoverySource('saved');
        setRecoverySnapshot(saved!);
      } else if (decision.kind === 'recovery') {
        recoverySourceRef.current = 'recovery';
        setRecoverySource('recovery');
        setRecoverySnapshot(rec!);
      }
    })();
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

  // ── Crash-recovery snapshot scheduler ─────────────────────────────────────
  const recoveryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const writeRecoveryNow = useCallback(() => {
    const isDirty = useProjectStore.getState().isDirty;
    const instrumentCount = useInstrumentStore.getState().instruments.length;
    const patternCount = useTrackerStore.getState().patterns.length;
    const hasContent = hasProjectContent({ instrumentCount, patternCount });
    if (!shouldWriteRecovery({ explicitlySaved, isDirty, hasContent })) return;
    try {
      idbPutRecovery(buildSavedProject()).catch((err) => {
        // IDB write rejected (quota / abort) — best-effort net, swallow.
        console.warn('[Persistence] recovery snapshot write failed:', err);
      });
    } catch (err) {
      // buildSavedProject threw synchronously — never crash the editor.
      console.warn('[Persistence] recovery snapshot skipped:', err);
    }
  }, []);

  // Debounced recovery write — coalesces edit bursts, never writes mid-drag.
  useEffect(() => {
    if (!isDirty || explicitlySaved) return;
    if (recoveryDebounceRef.current) clearTimeout(recoveryDebounceRef.current);
    recoveryDebounceRef.current = setTimeout(writeRecoveryNow, RECOVERY_DEBOUNCE);
    return () => {
      if (recoveryDebounceRef.current) clearTimeout(recoveryDebounceRef.current);
    };
  }, [isDirty, writeRecoveryNow]);

  // Interval floor — guarantees a write during continuous editing when the
  // debounce never idles.
  useEffect(() => {
    recoveryIntervalRef.current = setInterval(writeRecoveryNow, RECOVERY_INTERVAL);
    return () => {
      if (recoveryIntervalRef.current) clearInterval(recoveryIntervalRef.current);
    };
  }, [writeRecoveryNow]);

  // Best-effort flush on backgrounding (does NOT fire on a hard crash, but
  // catches tab hide / mobile). Cheap: gated by writeRecoveryNow's own checks.
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') writeRecoveryNow(); };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [writeRecoveryNow]);

  const restoreRecovery = useCallback(() => {
    if (!recoverySnapshot) return;
    // A crash snapshot restores with `fromRecovery`, which keeps the project
    // never-saved + dirty so the scheduler re-arms and a second crash after
    // Restore is still covered (spec). The explicit-save slot must NOT use
    // that tail — it is saved work, and marking it unsaved would re-arm
    // recovery over a project that already has a home.
    const fromRecovery = recoverySourceRef.current === 'recovery';
    void applySavedProject(recoverySnapshot, { fromRecovery });
    recoverySourceRef.current = null;
    setRecoverySource(null);
    setRecoverySnapshot(null);
  }, [recoverySnapshot]);

  const discardRecovery = useCallback(() => {
    const wasRecovery = recoverySourceRef.current === 'recovery';
    recoverySourceRef.current = null;
    setRecoverySource(null);
    setRecoverySnapshot(null);
    // Dismissing the offer of a SAVED project must never delete it — the user
    // still finds it under Load. Only a crash snapshot is consumed by being
    // declined.
    if (wasRecovery) void idbDeleteRecovery().catch(() => {});
  }, []);

  const save = useCallback(() => saveProjectToStorage({ explicit: true }), []);
  const load = useCallback(() => loadProjectFromStorage(), []);

  return { save, load, clear: clearSavedProject, isDirty, recoverySnapshot, recoverySource, restoreRecovery, discardRecovery };
}
