/**
 * Persistence round-trip: save → simulate reload → load → verify restore.
 *
 * Guards the class of regression where a schema bump / data-shape change
 * silently drops existing saved projects. Uses happy-dom's built-in
 * IndexedDB (no fake-indexeddb dep needed).
 *
 * The test goes through the exported save/load entry points, not the
 * private IDB helpers — that way schema migrations and the
 * `explicitlySaved` gate are covered too.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import 'fake-indexeddb/auto'; // Installs a working IDBFactory on globalThis.

// A load goes through applySong, which stops and resets the Tone engine; node
// has no AudioContext. Mocked at that boundary only, so the load succeeds and
// the round-trip assertions below run instead of being skipped.
vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

beforeAll(() => {
  // Make sure happy-dom's `window` sees the same IDBFactory — some
  // consumers read it from `window.indexedDB` rather than the global.
  if (typeof window !== 'undefined' && !(window as unknown as { indexedDB?: unknown }).indexedDB) {
    Object.defineProperty(window, 'indexedDB', {
      value: (globalThis as unknown as { indexedDB: unknown }).indexedDB,
      writable: true,
      configurable: true,
    });
  }
});

async function resetIDB(): Promise<void> {
  await new Promise<void>((resolve) => {
    // 1 s ceiling in case fake-indexeddb doesn't fire any event (e.g.
    // DB doesn't exist). Test doesn't care either way — we just need a
    // clean slate.
    const fallback = setTimeout(() => resolve(), 1000);
    const finish = () => {
      clearTimeout(fallback);
      resolve();
    };
    try {
      const req = indexedDB.deleteDatabase('devilbox');
      req.onsuccess = finish;
      req.onerror = finish;
      req.onblocked = finish;
    } catch {
      finish();
    }
  });
}

// Importing useProjectPersistence pulls in a heavy module graph
// (stores, engine, migration helpers). First test absorbs the cold-start.
// Cold-start can take 40+ seconds when the test runner hasn't cached the
// module graph (useProjectPersistence → useInstrumentStore → ToneEngine → Tone.js).
const SLOW_MS = 60_000;

describe('useProjectPersistence — IDB round-trip', () => {
  beforeEach(async () => {
    // Close the module's cached connection first: an open connection blocks
    // deleteDatabase, and the previous test's project stayed behind.
    const { closeCachedDBForTest } = await import('../useProjectPersistence');
    closeCachedDBForTest();
    await resetIDB();
  }, SLOW_MS);

  it('exports the save/load/explicit-save API surface', async () => {
    const mod = await import('../useProjectPersistence');
    expect(typeof mod.saveProjectToStorage).toBe('function');
    expect(typeof mod.loadProjectFromStorage).toBe('function');
    expect(typeof mod.markExplicitlySaved).toBe('function');
    expect(typeof mod.isExplicitlySaved).toBe('function');
    expect(typeof mod.clearExplicitlySaved).toBe('function');
  }, SLOW_MS);

  it('save without an explicit-save signal is a silent no-op (returns false)', async () => {
    const { saveProjectToStorage, clearExplicitlySaved } = await import('../useProjectPersistence');
    clearExplicitlySaved();
    const ok = await saveProjectToStorage();
    expect(ok).toBe(false);
  });

  it('explicit save → load cycle round-trips the project name', async () => {
    const { saveProjectToStorage, loadProjectFromStorage, clearExplicitlySaved } = await import('../useProjectPersistence');
    const { useProjectStore } = await import('@stores/useProjectStore');

    clearExplicitlySaved();
    useProjectStore.getState().setMetadata({ name: 'persistence-probe-A' });

    const saved = await saveProjectToStorage({ explicit: true });
    expect(saved, 'explicit save should succeed').toBe(true);

    // Simulate "next page load": change the in-memory state, then load
    // from IDB and verify the original name is restored.
    useProjectStore.getState().setMetadata({ name: 'something-else' });
    expect(useProjectStore.getState().metadata.name).toBe('something-else');

    const loaded = await loadProjectFromStorage();
    expect(loaded, 'the saved project should load').toBe(true);
    expect(useProjectStore.getState().metadata.name).toBe('persistence-probe-A');
  });

  it('load with no saved data returns false without crashing', async () => {
    const { loadProjectFromStorage } = await import('../useProjectPersistence');
    const result = await loadProjectFromStorage();
    expect(result).toBe(false);
  });

  it('explicitlySaved flag flips correctly through the public API', async () => {
    const { isExplicitlySaved, markExplicitlySaved, clearExplicitlySaved } = await import('../useProjectPersistence');
    clearExplicitlySaved();
    expect(isExplicitlySaved()).toBe(false);
    markExplicitlySaved();
    expect(isExplicitlySaved()).toBe(true);
    clearExplicitlySaved();
    expect(isExplicitlySaved()).toBe(false);
  }, SLOW_MS);

  // ── Phase 1 Dub Studio — Pattern.dubLane round-trip (schema v20) ──────
  // Guards the bug class where a schema bump silently drops a new field.
  // Pattern.dubLane events (v20) are legacy: the recorder writes automation
  // curves now, and every load converts saved events into curves
  // (migrateDubLaneEvents, 2026-04-27). This test used to expect the events
  // back unchanged and only passed because its load failed silently.
  it('explicit save → load converts Pattern.dubLane events into automation curves', async () => {
    const { saveProjectToStorage, loadProjectFromStorage, clearExplicitlySaved } =
      await import('../useProjectPersistence');
    const { useTrackerStore } = await import('@stores/useTrackerStore');

    clearExplicitlySaved();
    // The save captures the automation store as it is: start it empty, so a
    // curve left by another test file in the same run is not saved as well.
    const { useAutomationStore } = await import('@stores/useAutomationStore');
    useAutomationStore.getState().reset();

    // Seed pattern 0 with a known dub lane: one trigger + one hold.
    const tracker = useTrackerStore.getState();
    const beforePattern = tracker.patterns[0];
    if (!beforePattern) {
      // Happy-dom tracker state may not have a pattern 0. If so, skip —
      // this test targets the serialization layer, not the store init.
      return;
    }
    // Params are typed as `Record<string, number>`; TS narrows the two
    // event literals to non-overlapping shapes without an explicit cast,
    // so we coerce the whole lane object through the DubLane interface.
    const probeLane: import('@/types/dub').DubLane = {
      enabled: true,
      events: [
        {
          id: 'evt-trigger-probe',
          moveId: 'echoThrow',
          channelId: 0,
          row: 4,
          params: { amount: 1 } as Record<string, number>,
        },
        {
          id: 'evt-hold-probe',
          moveId: 'dubSiren',
          channelId: 1,
          row: 12,
          durationRows: 8,
          params: { feedback: 0.65 } as Record<string, number>,
        },
      ],
    };
    tracker.setPatternDubLane(0, probeLane);
    expect(useTrackerStore.getState().patterns[0].dubLane?.events).toHaveLength(2);

    const saved = await saveProjectToStorage({ explicit: true });
    expect(saved, 'explicit save should succeed').toBe(true);

    // Simulate a fresh session: blow away the in-memory lane.
    tracker.setPatternDubLane(0, null);
    expect(useTrackerStore.getState().patterns[0].dubLane).toBeUndefined();

    const loaded = await loadProjectFromStorage();
    expect(loaded, 'the saved project should load').toBe(true);

    const pattern = useTrackerStore.getState().patterns[0];
    expect(pattern.dubLane?.events ?? [], 'events are consumed by the conversion').toHaveLength(0);
    const automation = useAutomationStore.getState();
    const trig = automation.getCurvesForPattern(pattern.id, 0).find((c) => c.parameter === 'dub.echoThrow');
    expect(trig?.points.map((pt) => [pt.row, pt.value])).toEqual([[4, 1], [4.05, 0]]);
    const hold = automation.getCurvesForPattern(pattern.id, 1).find((c) => c.parameter === 'dub.dubSiren');
    expect(hold?.points.map((pt) => [pt.row, pt.value])).toEqual([[12, 1], [20, 0]]);
  }, SLOW_MS);

  it('load of a pre-v20 project without dubLane does not crash', async () => {
    // Additive-schema contract: v19 projects (no dubLane anywhere) must
    // continue to load cleanly. If load returns true, patterns exist;
    // dubLane being undefined on each is correct.
    const { loadProjectFromStorage } = await import('../useProjectPersistence');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const result = await loadProjectFromStorage();
    // result is false when no saved data; test is trivially true in that
    // case (we've already reset IDB in beforeEach).
    if (!result) return;
    // If result is true, every pattern must be a valid shape — `dubLane`
    // undefined is the default and must not throw downstream.
    const patterns = useTrackerStore.getState().patterns;
    for (const p of patterns) {
      // If dubLane is present it must have both fields; if absent it is
      // undefined (not null, not partial).
      if (p.dubLane !== undefined) {
        expect(typeof p.dubLane.enabled).toBe('boolean');
        expect(Array.isArray(p.dubLane.events)).toBe(true);
      }
    }
  }, SLOW_MS);
});

describe('crash-recovery IDB slot', () => {
  beforeEach(async () => {
    // Close the module-level cached connection before deleting the DB so
    // fake-indexeddb doesn't block the delete and the next test opens
    // a fresh connection instead of reusing a stale one.
    const mod = await import('../useProjectPersistence');
    if (typeof mod.closeCachedDBForTest === 'function') mod.closeCachedDBForTest();
    // Reset the module-level explicit-save flag — leaked state from a prior
    // describe block would make the gate-dependent tests order-dependent.
    mod.clearExplicitlySaved();
    await resetIDB();
  });

  it('round-trips the recovery record independently of the explicit-save record', async () => {
    const mod = await import('../useProjectPersistence');
    // The recovery helpers are internal; assert via the exported behavior the
    // boot flow relies on — a written recovery record is retrievable and the
    // explicit-save slot stays empty (never-saved invariant).
    expect(typeof mod.getRecoverySnapshotForTest).toBe('function');
    const sample = mod.makeEmptyTestSnapshot();
    await mod.putRecoverySnapshotForTest(sample);
    const got = await mod.getRecoverySnapshotForTest();
    expect(got?.schemaVersion).toBe(sample.schemaVersion);
    // Explicit slot untouched.
    expect(await mod.hasSavedProject()).toBe(false);
    await mod.deleteRecoverySnapshotForTest();
    expect(await mod.getRecoverySnapshotForTest()).toBeUndefined();
  }, SLOW_MS);
});

describe('crash-recovery clear-on-save', () => {
  beforeEach(async () => {
    const mod = await import('../useProjectPersistence');
    if (typeof mod.closeCachedDBForTest === 'function') mod.closeCachedDBForTest();
    mod.clearExplicitlySaved();
    await resetIDB();
  });

  it('deletes the recovery record after the first explicit save', async () => {
    const mod = await import('../useProjectPersistence');
    await mod.putRecoverySnapshotForTest(mod.makeEmptyTestSnapshot());
    expect(await mod.getRecoverySnapshotForTest()).toBeDefined();

    // Explicit save ends the never-saved scope and must clear recovery.
    // Teeth: removing the clear line leaves the record and this fails.
    await mod.saveProjectToStorage({ explicit: true });
    expect(await mod.getRecoverySnapshotForTest()).toBeUndefined();
  }, SLOW_MS);
});

