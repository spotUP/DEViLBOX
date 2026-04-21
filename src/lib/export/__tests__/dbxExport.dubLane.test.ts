/**
 * `.dbx` file-export Pattern.dubLane round-trip (G4).
 *
 * Guards the class of regression where `exportSong` starts projecting a
 * narrower pattern shape (e.g. `{ id, channels, rows }`) and accidentally
 * drops `dubLane` from the serialized blob. IndexedDB save/load is covered
 * by `useProjectPersistence.test.ts` (G5); this test covers the user-
 * shareable `.dbx` file path separately.
 *
 * Strategy: mock `file-saver#saveAs` to capture the Blob, read it back as
 * text, `JSON.parse`, assert `patterns[0].dubLane.events[0]` matches the
 * input event byte-for-byte.
 *
 * Dependencies minimised: no engine, no store — `exportSong` accepts all
 * inputs as arguments so the test supplies synthetic data directly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DubLane } from '@/types/dub';

// Capture whatever blob `file-saver` receives.
const captured: { blob: Blob | null; filename: string | null } = { blob: null, filename: null };
vi.mock('file-saver', () => ({
  saveAs: (blob: Blob, filename: string) => {
    captured.blob = blob;
    captured.filename = filename;
  },
}));

// Shim whatever the exporters.ts module imports transitively that blows up
// in happy-dom. In practice it only needs Pattern + InstrumentConfig +
// EffectConfig shapes, all type-only. If a real runtime call from
// `exportSong` hits `getTrackerReplayer()` via require, let it throw —
// exportSong swallows that in a try/catch (line 255 of exporters.ts).

import { exportSong } from '../exporters';

const PROBE_LANE: DubLane = {
  enabled: true,
  events: [
    {
      id: 'evt-trigger-dbx',
      moveId: 'echoThrow',
      channelId: 0,
      row: 4.25,
      params: { amount: 1, intensity: 0.8 } as Record<string, number>,
    },
    {
      id: 'evt-hold-dbx',
      moveId: 'dubSiren',
      channelId: 1,
      row: 12,
      durationRows: 8,
      params: { feedback: 0.65 } as Record<string, number>,
    },
  ],
};

function makePattern(withLane: boolean) {
  const base = {
    id: 'pat-0',
    name: 'Probe pattern',
    length: 64,
    channels: Array.from({ length: 4 }, (_, i) => ({
      id: `ch-${i}`,
      name: `Ch ${i + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: [] as unknown[],
    })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withLane ? { ...base, dubLane: PROBE_LANE } : (base as any);
}

async function captureExport(pattern: unknown): Promise<Record<string, unknown>> {
  captured.blob = null;
  captured.filename = null;
  // ProjectMetadata requires id / createdAt / modifiedAt / version — fill
  // with plausible defaults. None of these fields affect the dubLane
  // round-trip assertions below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportSong(
    {
      id: 'test-id',
      name: 'test-song',
      author: '',
      description: '',
      createdAt: 0,
      modifiedAt: 0,
      version: '0.0.0',
    } as any,
    125,
    [], // instruments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [pattern as any],
    ['pat-0'],
    undefined, // automation
    undefined, // masterEffects
    undefined, // automationCurves
    {}, // options
  );
  expect(captured.blob, 'saveAs should have been called with a Blob').toBeTruthy();
  const text = await captured.blob!.text();
  return JSON.parse(text);
}

describe('exportSong — Pattern.dubLane round-trip through .dbx JSON', () => {
  beforeEach(() => {
    captured.blob = null;
    captured.filename = null;
  });

  it('filename ends in .dbx', async () => {
    await captureExport(makePattern(true));
    expect(captured.filename).toMatch(/\.dbx$/);
  });

  it('top-level format is devilbox-song', async () => {
    const data = await captureExport(makePattern(true));
    expect(data.format).toBe('devilbox-song');
  });

  it('pattern dubLane survives JSON round-trip', async () => {
    const data = await captureExport(makePattern(true));
    const patterns = data.patterns as Array<Record<string, unknown>>;
    expect(patterns).toHaveLength(1);
    const lane = patterns[0].dubLane as DubLane;
    expect(lane, 'Pattern.dubLane missing from exported JSON').toBeDefined();
    expect(lane.enabled).toBe(true);
    expect(lane.events).toHaveLength(2);
  });

  it('trigger event preserves all fields', async () => {
    const data = await captureExport(makePattern(true));
    const patterns = data.patterns as Array<{ dubLane: DubLane }>;
    const trig = patterns[0].dubLane.events.find((e) => e.id === 'evt-trigger-dbx');
    expect(trig).toBeDefined();
    expect(trig?.moveId).toBe('echoThrow');
    expect(trig?.channelId).toBe(0);
    expect(trig?.row).toBe(4.25);
    expect(trig?.params.amount).toBe(1);
    expect(trig?.params.intensity).toBeCloseTo(0.8, 5);
    // Trigger events have NO durationRows (distinguishes trigger vs hold
    // serialization — a regression that stamps a default would break hold
    // detection on import).
    expect(trig?.durationRows).toBeUndefined();
  });

  it('hold event preserves durationRows + params', async () => {
    const data = await captureExport(makePattern(true));
    const patterns = data.patterns as Array<{ dubLane: DubLane }>;
    const hold = patterns[0].dubLane.events.find((e) => e.id === 'evt-hold-dbx');
    expect(hold).toBeDefined();
    expect(hold?.moveId).toBe('dubSiren');
    expect(hold?.channelId).toBe(1);
    expect(hold?.row).toBe(12);
    expect(hold?.durationRows).toBe(8);
    expect(hold?.params.feedback).toBeCloseTo(0.65, 5);
  });

  it('pattern without dubLane exports without a dubLane key (additive schema)', async () => {
    // A v19-vintage in-memory pattern with no dubLane must NOT grow a
    // spurious empty lane on export — that would confuse importers that
    // round-trip through both v19 and v20 tools.
    const data = await captureExport(makePattern(false));
    const patterns = data.patterns as Array<Record<string, unknown>>;
    expect(patterns[0]).not.toHaveProperty('dubLane');
  });

  it('pattern ordering is preserved across export', async () => {
    // Smoke: one pattern in → one pattern out with matching id.
    const data = await captureExport(makePattern(true));
    const patterns = data.patterns as Array<{ id: string }>;
    expect(patterns.map((p) => p.id)).toEqual(['pat-0']);
  });
});

// ─── Auto Dub + DubBus snapshot round-trip ─────────────────────────────────

describe('exportSong — Auto Dub state + DubBusSettings .dbx round-trip', () => {
  beforeEach(() => {
    captured.blob = null;
    captured.filename = null;
  });

  it('autoDub block captures enabled/persona/intensity/blacklist from useDubStore', async () => {
    const { useDubStore } = await import('@/stores/useDubStore');
    const s = useDubStore.getState();
    s.setAutoDubEnabled(true);
    s.setAutoDubPersona('perry');
    s.setAutoDubIntensity(0.73);
    s.setAutoDubMoveBlacklist(['tubbyScream', 'reverseEcho']);

    const data = await captureExport(makePattern(false));
    const autoDub = data.autoDub as { enabled: boolean; persona: string; intensity: number; moveBlacklist: string[] };
    expect(autoDub).toBeDefined();
    expect(autoDub.enabled).toBe(true);
    expect(autoDub.persona).toBe('perry');
    expect(autoDub.intensity).toBeCloseTo(0.73, 5);
    expect(autoDub.moveBlacklist).toEqual(['tubbyScream', 'reverseEcho']);

    // Reset for other tests
    s.setAutoDubEnabled(false);
    s.setAutoDubPersona('custom');
    s.setAutoDubIntensity(0.5);
    s.setAutoDubMoveBlacklist([]);
  });

  it('dubBus block captures characterPreset + coloring params from useDrumPadStore', async () => {
    const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
    useDrumPadStore.getState().setDubBus({
      characterPreset: 'scientist',
      returnGain: 0.42,
      echoIntensity: 0.77,
      stereoWidth: 1.55,
    });

    const data = await captureExport(makePattern(false));
    const dubBus = data.dubBus as Record<string, unknown>;
    expect(dubBus).toBeDefined();
    expect(dubBus.characterPreset).toBe('scientist');
    expect(dubBus.returnGain).toBeCloseTo(0.42, 5);
    expect(dubBus.echoIntensity).toBeCloseTo(0.77, 5);
    expect(dubBus.stereoWidth).toBeCloseTo(1.55, 5);
  });

  it('JSON round-trip preserves every autoDub + dubBus field via JSON.parse', async () => {
    // End-to-end integrity — serialize → parse → assert. Guards against a
    // future refactor that Proxies the stores in a way JSON.stringify drops.
    const { useDubStore } = await import('@/stores/useDubStore');
    const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
    useDubStore.getState().setAutoDubPersona('jammy');
    useDubStore.getState().setAutoDubIntensity(0.35);
    useDrumPadStore.getState().setDubBus({ characterPreset: 'madProfessor' });

    const data = await captureExport(makePattern(false));
    const parsed = JSON.parse(JSON.stringify(data));
    expect(parsed.autoDub.persona).toBe('jammy');
    expect(parsed.autoDub.intensity).toBeCloseTo(0.35, 5);
    expect(parsed.dubBus.characterPreset).toBe('madProfessor');
  });
});
