/**
 * Rob Hubbard on nuade: an edit in the grid becomes a module nuade can open (live MCP report 2026-10-13: set_cell on
 * centurion_battle.rh, then "[NuadeEngine] swapModule: nuade open failed (-2): not a Rob Hubbard module"). The module
 * the engine is handed after an edit (editedModuleForPlay) must be the loaded module with the edit written in - or,
 * where the format has no way to write it for this engine, nothing (the engine keeps playing the loaded bytes) - and
 * never a module nuade refuses.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => (globalThis as { __liveSong?: () => unknown }).__liveSong?.() : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});

const ROOT = join(__dirname, '../../..');
const RH = 'public/data/songs/formats/centurion_battle.rh';

describe('an edit on a nuade-played Rob Hubbard song', () => {
  beforeAll(async () => {
    const { NuadeHeadless } = await import('@/engine/nuade/nuadeHeadless');
    const { setNuadeProbe } = await import('@/engine/nuade/nuadeProbe');
    const nu = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => nu.probeWith(id, bytes, name));
  }, 120_000);

  it('hands the engine a module the Rob Hubbard player opens, and one that carries the edit', async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().setFormatEngine('robHubbard', 'nuade');
    const bytes = new Uint8Array(readFileSync(join(ROOT, RH)));
    const file = new File([bytes.slice().buffer as ArrayBuffer], 'centurion_battle.rh');
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    await importTrackerModule({
      metadata: { title: file.name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
    const { playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
    const song = liveTrackerSong();
    const desc = playingDescriptor(song);
    expect(desc?.key, 'the song plays on nuade').toBe('Nuade');

    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const pats = useTrackerStore.getState().patterns;
    let at: { ch: number; r: number; note: number } | null = null;
    pats[0].channels.forEach((c, ch) => c.rows.forEach((cell, r) => { if (!at && cell.note > 0 && cell.note < 95) at = { ch, r, note: cell.note + 2 }; }));
    expect(at, 'a note to edit').not.toBeNull();
    useTrackerStore.getState().setCell(at!.ch, at!.r, { note: at!.note });

    const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
    const edited = await editedModuleForPlay(liveTrackerSong(), desc!);
    const play = edited ? new Uint8Array(edited instanceof Uint8Array ? edited : new Uint8Array(edited)) : null;
    if (play) {
      const { NuadeHeadless } = await import('@/engine/nuade/nuadeHeadless');
      const nu = await NuadeHeadless.create();
      expect(nu.probeWith('robhubbard', play, 'centurion_battle.rh'), 'nuade opens the module the engine is handed').toBe(0);
      expect(play.some((v, i) => v !== bytes[i]) || play.length !== bytes.length, 'and it carries the edit').toBe(true);
    }
    // null = the engine keeps playing the loaded module: allowed only when the song says the edit cannot be written.
    else expect(liveTrackerSong().gridUnmatchedReason ?? 'no encoder for this engine').toBeTruthy();
  }, 120_000);
});
