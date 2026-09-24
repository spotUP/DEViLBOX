/**
 * Schema-bump / migration tests for persisted Zustand stores.
 *
 * Guards against the "bump the version, forget the migration" class of
 * regression that can lose user settings on upgrade.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const STORE_KEY = 'devilbox-settings';

function seed(version: number, state: Record<string, unknown>): void {
  localStorage.setItem(STORE_KEY, JSON.stringify({ state, version }));
}

async function freshLoad() {
  // Clear Vitest's module cache so the store re-runs its init (including
  // the persist middleware's migrate path) against the seeded data.
  vi.resetModules();
  const mod = await import('../useSettingsStore');
  return mod.useSettingsStore.getState();
}

describe('useSettingsStore — persist migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fresh boot (no stored data) uses defaults', async () => {
    const s = await freshLoad();
    expect(s.formatEngine).toBeDefined();
    expect(s.masterTuning).toBeGreaterThan(0);
  });

  /**
   * v10: the default stereo separation mode became ModPlug.
   *
   * The PT-2 clone's hard LRRL is the Amiga's own panning and it is the wrong
   * default for listening — asked for 2026-09-24: "change the default stereo
   * separation in the settings dialog to modplug not pt-2 clone".
   *
   * The flip cannot tell a stored default apart from a deliberate choice of
   * 'pt2'; neither could the v8 SunTronic or v4 PSM migrations above it. That
   * is the accepted trade in this file, and the setting is one click away.
   */
  it('v10: a fresh boot defaults to ModPlug separation', async () => {
    const s = await freshLoad();
    expect(s.stereoSeparationMode).toBe('modplug');
  });

  it('v10: stored pt2 is migrated to modplug', async () => {
    seed(9, { stereoSeparationMode: 'pt2', masterTuning: 432 });
    const s = await freshLoad();
    expect(s.stereoSeparationMode).toBe('modplug');
    expect(s.masterTuning, 'unrelated settings survive the bump').toBe(432);
  });

  it('v10: someone already on modplug is left alone', async () => {
    seed(9, { stereoSeparationMode: 'modplug', modplugSeparation: 120 });
    const s = await freshLoad();
    expect(s.stereoSeparationMode).toBe('modplug');
    expect(s.modplugSeparation, 'their separation amount is theirs').toBe(120);
  });

  it('v3 data: stale formatEngine is wiped', async () => {
    // v3 migration deletes the formatEngine sub-object entirely.
    seed(2, { formatEngine: { mod: 'native', hvl: 'native' }, masterTuning: 432 });
    const s = await freshLoad();
    // Defaults re-apply; user's unrelated field (masterTuning) preserved.
    expect(s.masterTuning).toBe(432);
    expect(s.formatEngine).toBeDefined();
  });

  it('v5 → v6: stereoSeparation 50 gets migrated to 25 (rich-mono default)', async () => {
    seed(5, { stereoSeparation: 50, modplugSeparation: 100 });
    const s = await freshLoad();
    expect(s.stereoSeparation).toBe(25);
    expect(s.modplugSeparation).toBe(50);
  });

  it('v8 \u2192 v9: the deleted WebGL-UI shader keys are dropped, neighbours survive', async () => {
    seed(8, {
      masterTuning: 432,
      wobbleWindows: true,
      crtEnabled: true,
      crtParams: { scanlineIntensity: 0.9, curvature: 0.4 },
      lensEnabled: true,
      lensPreset: 'fisheye',
      lensParams: { barrel: 0.7, chromatic: 0.3, vignette: 0.5 },
    });
    const s = (await freshLoad()) as unknown as Record<string, unknown>;
    for (const key of ['wobbleWindows', 'crtEnabled', 'crtParams', 'lensEnabled', 'lensPreset', 'lensParams']) {
      expect(s[key], `${key} survived the v9 migration`).toBeUndefined();
    }
    // An unrelated persisted setting is untouched by the drop.
    expect(s.masterTuning).toBe(432);
  });

  it('unknown future version (version > current) loads without crashing', async () => {
    seed(99, { stereoSeparation: 70, formatEngine: { mod: 'uade' } });
    // Downgrading from a future version shouldn't throw — persist layer
    // just keeps whatever fields it doesn't understand.
    let threw: Error | null = null;
    try {
      await freshLoad();
    } catch (e) {
      threw = e as Error;
    }
    expect(threw, `downgrade crash: ${threw?.message}`).toBeNull();
  });

  it('malformed persisted JSON (missing `state` wrapper) does not crash the boot', async () => {
    localStorage.setItem(STORE_KEY, '{"not":"a persist envelope"}');
    let threw: Error | null = null;
    try {
      await freshLoad();
    } catch (e) {
      threw = e as Error;
    }
    expect(threw, `malformed-data crash: ${threw?.message}`).toBeNull();
  });
});
