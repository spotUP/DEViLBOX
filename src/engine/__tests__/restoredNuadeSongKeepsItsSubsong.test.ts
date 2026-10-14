/**
 * Owner ledger NUADE-SUBSONG-RESTORE: a nuade song with several subsongs came back from an autosave / crash recovery on
 * subsong 0. liveSong saves the start field (nuadeSubsong), but the restore re-decodes the stored module and takes the
 * engine fields from the fresh decode, which starts the player's default subsong and has no nuadeSubsong.
 *
 * One reachability test: the app's import (importTrackerModule, engine pinned to nuade), nuade reporting subsong 4 of
 * the real module's subsongs (budokan.rh, 6 tunes), the app's save (serializeProjectToBlob) and restore
 * (applySavedProject from recovery). Sentinel: the restore's re-decode ran. Asserted: the restored song's load args
 * (what NuadeEngine.loadTune receives) carry subsong 4, not undefined / 0.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import '@/stores/useTrackerStore';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ROOT } from './workletHarness';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { setNuadeProbe } from '../nuade/nuadeProbe';

vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
const parsed = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock('@/lib/import/parseModuleToSong', async (orig) => {
  const real = await orig<typeof import('@/lib/import/parseModuleToSong')>();
  return {
    ...real,
    parseModuleToSong: (async (file: File, ...rest: unknown[]) => {
      parsed.names.push(file.name);
      return (real.parseModuleToSong as (...a: unknown[]) => Promise<unknown>)(file, ...rest);
    }) as typeof real.parseModuleToSong,
  };
});

const FILE = 'public/data/songs/rob-hubbard/budokan.rh';
const SAVED_ON = 4;

describe('a restored nuade song with subsongs opens on the tune it was saved on', () => {
  let headless: NuadeHeadless;
  beforeAll(async () => {
    headless = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => headless.probeWith(id, bytes, name));
  }, 60_000);

  it('budokan.rh saved on subsong 4 of 6 restores with nuade told to start subsong 4', async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().setFormatEngine('robHubbard' as never, 'nuade'); // pinned: the default is rollout data

    const bytes = new Uint8Array(readFileSync(resolve(ROOT, FILE)));
    const name = basename(FILE);
    headless.open(bytes, name, 'robhubbard');
    const subsongs = headless.subsongCount;
    expect(subsongs, 'the real module holds several subsongs').toBeGreaterThan(SAVED_ON);

    const file = new File([bytes.slice().buffer as ArrayBuffer], name);
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    await importTrackerModule({
      metadata: { title: name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);

    // NuadeEngine reports the subsong it plays on load and on a switch.
    const { reportSubsongs } = await import('@/engine/wasm/subsongRequests');
    reportSubsongs('Nuade', subsongs, SAVED_ON);

    const { serializeProjectToBlob, applySavedProject } = await import('@hooks/useProjectPersistence');
    const { decompressProject } = await import('@/lib/projectCompression');
    const saved = JSON.parse(decompressProject(await serializeProjectToBlob().arrayBuffer()));
    parsed.names.length = 0;
    expect(await applySavedProject(saved, { fromRecovery: true })).toBe(true);
    expect(parsed.names, 'the restore decoded the stored module again').toEqual([name]);

    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const { WASM_ENGINES } = await import('../replayer/wasmEngineRegistry');
    const song = liveTrackerSong();
    const nuade = WASM_ENGINES.find((d) => d.key === 'Nuade')!;
    expect(nuade.getLoadArgs!(song)[2], 'nuade is loaded on the saved subsong').toBe(SAVED_ON);
  }, 120_000);
});
