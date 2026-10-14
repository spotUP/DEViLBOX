/**
 * Owner, 2026-10-14 (centurion_battle.rh on nuade, after a page reload): "i dont hear my notes".
 *
 * A song nuade plays keeps its module in nuadeFileData / nuadeFileName (playOnNuade takes uadeEditableFileData off).
 * The autosave / crash-recovery restore decoded a song again only from uadeEditableFileData, so a nuade song came back
 * as saved: without the parser's cell layout (uadeVariableLayout / uadePatternLayout hold functions and are never
 * saved) and without nuadeModuleFields. A typed note then had no exporter (the native export fell to a 3132-byte
 * ProTracker file for a 24590-byte module), editedModuleForPlay returned null and the live swap never sent a module:
 * every note typed into the restored song was silent, on Play and while playing.
 *
 * One reachability test per format that plays on nuade with a working edit path (NUADE-EDIT-PATH, 6 rows): the app's
 * import (importTrackerModule, engine pinned to nuade), the app's save (serializeProjectToBlob), the app's restore
 * (applySavedProject from recovery), a note typed through useTrackerStore.setCell, and the module the live swap hands
 * to nuade (editedModuleForPlay, the one editedModule both the swap and the next Play load). Sentinel: the restore's
 * re-decode ran (parseModuleToSong called with the module's file name). Measured: the handed module carries the edit
 * and nuade's own player opens it. That a module handed over is heard at its row is proven by
 * nuadeEditsAreHeard.test.ts.
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

interface Case { id: string; prefKey: string; file: string; pattern: number; channel: number; row: number }
// The NUADE-EDIT-PATH sites (nuadeEditsAreHeard.test.ts).
const CASES: Case[] = [
  { id: 'robhubbard', prefKey: 'robHubbard', file: 'public/data/songs/formats/centurion_battle.rh', pattern: 0, channel: 0, row: 48 },
  { id: 'soundmaster', prefKey: 'soundMaster', file: "public/data/songs/formats/rackney'sisland_4.sm", pattern: 12, channel: 1, row: 0 },
  { id: 'hippel', prefKey: 'hippelCoso', file: 'public/data/songs/formats/prehistoric_tale.hipc', pattern: 3, channel: 3, row: 1 },
  { id: 'instereo1', prefKey: 'inStereo1', file: 'public/data/songs/formats/fantasi8.is', pattern: 8, channel: 1, row: 0 },
  { id: 'sidmon2', prefKey: 'sidmon2', file: 'public/data/songs/formats/bruno_time.sid2', pattern: 2, channel: 1, row: 2 },
  { id: 'soundmon', prefKey: 'soundmon', file: 'public/data/songs/formats/antidust.bp3', pattern: 4, channel: 0, row: 0 },
];

describe('a note typed into a restored song that plays on nuade is heard', () => {
  let headless: NuadeHeadless;
  beforeAll(async () => {
    headless = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => headless.probeWith(id, bytes, name));
  }, 60_000);

  for (const c of CASES) {
    it(`${c.id}: after a recovery restore the live swap hands nuade a module with the typed note`, async () => {
      const { useSettingsStore } = await import('@/stores/useSettingsStore');
      useSettingsStore.getState().setFormatEngine(c.prefKey as never, 'nuade'); // pinned: the default is rollout data

      // Opened the way the app opens a file.
      const bytes = new Uint8Array(readFileSync(resolve(ROOT, c.file)));
      const name = basename(c.file);
      const file = new File([bytes.slice().buffer as ArrayBuffer], name);
      const { importTrackerModule } = await import('@/lib/song/songBranches');
      await importTrackerModule({
        metadata: { title: name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
        arrayBuffer: await file.arrayBuffer(), file,
      } as never, { useLibopenmpt: true } as never);

      // Saved and restored the way autosave / crash recovery does it.
      const { serializeProjectToBlob, applySavedProject } = await import('@hooks/useProjectPersistence');
      const { decompressProject } = await import('@/lib/projectCompression');
      const saved = JSON.parse(decompressProject(await serializeProjectToBlob().arrayBuffer()));
      parsed.names.length = 0;
      expect(await applySavedProject(saved, { fromRecovery: true })).toBe(true);
      expect(parsed.names, 'the restore decoded the stored module again').toEqual([name]);

      const { liveTrackerSong } = await import('@/lib/song/liveSong');
      const { playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
      expect(playingDescriptor(liveTrackerSong())?.key, 'the restored song plays on nuade').toBe('Nuade');

      // A note typed through the pattern editor's store action.
      const { useTrackerStore } = await import('@/stores/useTrackerStore');
      const before = useTrackerStore.getState().patterns[c.pattern].channels[c.channel].rows[c.row];
      expect(before.note, 'the site holds a note').toBeGreaterThan(0);
      useTrackerStore.getState().setCurrentPattern(c.pattern);
      useTrackerStore.getState().setCell(c.channel, c.row, { note: before.note + 2 });

      // The module the live swap (and the next Play) hands nuade.
      const song = liveTrackerSong();
      const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
      const out = await editedModuleForPlay(song, playingDescriptor(song)!);
      expect(out, 'an edited module was built (null: no swap, the note is never heard)').not.toBeNull();
      const handed = out instanceof Uint8Array ? out : new Uint8Array(out!);
      // (InStereo 1 and SoundMon sites are blocks other positions share: the writer copies the block, so the module grows.)
      expect(handed.length !== bytes.length || handed.some((v, i) => v !== bytes[i]), 'the module carries the typed note').toBe(true);
      expect(headless.probeWith(c.id, handed, name), 'nuade opens the module it is handed').toBe(0);
    }, 120_000);
  }
});
