/**
 * boogie.mus opened through the real openSong never reaches UADE.
 *
 * It is neither UFO (FORM/DDAT/BODY/CHAN), Karl Morton (SONG/SMPL chunks) nor
 * a libopenmpt module, and UADE has no other `.mus` player, so UADE answered
 * "module check failed" (and left a stray WantedTeam.bin / a breached
 * supervisor stack) after the last-resort fallback in parseModuleToSong still
 * handed it over. The open must end in a named refusal with the engine untouched.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';

const loads = vi.hoisted(() => [] as string[]);

vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
// libopenmpt refuses boogie.mus ("ptr"); its wasm is not what this test is about.
vi.mock('@/lib/import/ModuleLoader', async (orig) => ({
  ...(await orig<typeof import('@/lib/import/ModuleLoader')>()),
  loadModuleFile: async () => { throw new Error('ptr'); },
}));
vi.mock('@/lib/import/parsers/PatternExtractor', async (orig) => ({
  ...(await orig<typeof import('@/lib/import/parsers/PatternExtractor')>()),
  parseTrackerModule: async () => { throw new Error('ptr'); },
}));
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ stop: () => {} }) }));
vi.mock('@engine/uade/UADEEngine', () => {
  const engine = {
    onInitProgress: () => () => {},
    ready: async () => {},
    reinitIfNeeded: async () => {},
    enableTickSnapshots: () => {},
    resetTickSnapshots: () => {},
    load: async (_b: ArrayBuffer, name: string) => { loads.push(name); throw new Error('module check failed'); },
  };
  return { UADEEngine: { getInstance: () => engine, hasInstance: () => true } };
});

import { openSong } from '@/lib/song/openSong';

describe('a .mus that is not UFO or Karl Morton', () => {
  it('boogie.mus opens as a named refusal and UADE is never asked to load it', async () => {
    const bytes = new Uint8Array(readFileSync('public/data/songs/formats/boogie.mus'));
    const file = new File([bytes], 'boogie.mus');
    const r = await openSong({ kind: 'file', file }, { origin: 'dialog' });
    expect(loads).toEqual([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/boogie\.mus/);
    if (!r.ok) expect(r.error).toMatch(/no player/i);
  });
});
