/**
 * An online (Modland) StoneTracker .spm opened through openSong carries its
 * .sps sample bank into the parse, the same as a local drop (STONETRACKER-
 * COMPANION-ONLINE). The listing is what the server's modland_files index
 * returns; the server only lists the bank when its indexer whitelists the
 * Stonetracker folder (server/src/services/modlandIndexer.ts), so the listing
 * here is produced by that same indexer parse and the shared companion rule,
 * not hand-written. Real hypnosphere.spm/.sps bytes from the repo.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const calls = vi.hoisted(() => ({
  parses: [] as Array<{ name: string; companions: Map<string, ArrayBuffer> | undefined }>,
}));

vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ stop: () => {} }) }));
vi.mock('@/lib/import/parseModuleToSong', () => ({
  parseModuleToSong: async (file: File, _s?: number, _m?: unknown, _o?: unknown, companions?: Map<string, ArrayBuffer>) => {
    calls.parses.push({ name: file.name, companions });
    throw new Error('stop at the parse');
  },
}));
vi.mock('../../../../server/src/db/database', () => ({ default: {} }));

import { openSong } from '@/lib/song/openSong';
import { parseAllmodsLine } from '../../../../server/src/services/modlandIndexer';

const DIR = 'pub/modules/Stonetracker/Mytholog';
const ALLMODS = ['hypnosphere.spm', 'hypnosphere.sps'].map((n, i) => `${i + 1}\tStonetracker/Mytholog/${n}`);
const SPM = readFileSync('public/data/songs/stonetracker/hypnosphere.spm');
const SPS = readFileSync('public/data/songs/stonetracker/hypnosphere.sps');

describe('Modland StoneTracker song carries its sample bank', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the parse receives the .sps, listed from what the indexer keeps', async () => {
    const indexed = ALLMODS.map((l) => parseAllmodsLine(l)).filter((e) => e !== null).map((e) => e.filename);
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = new URL(String(input), 'http://x');
      if (url.pathname.endsWith('/modland/list')) {
        const dir = url.searchParams.get('dir') ?? '';
        const files = dir === DIR ? indexed.map((f) => ({ full_path: `${DIR}/${f}`, filename: f })) : [];
        return new Response(JSON.stringify({ files }), { status: 200 });
      }
      if (url.pathname.endsWith('/modland/download')) {
        const p = url.searchParams.get('path') ?? '';
        if (p === `${DIR}/hypnosphere.spm`) return new Response(new Uint8Array(SPM), { status: 200 });
        if (p === `${DIR}/hypnosphere.sps`) return new Response(new Uint8Array(SPS), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    calls.parses.length = 0;
    await openSong({ kind: 'modland', path: `${DIR}/hypnosphere.spm` }, { origin: 'mcp' });
    expect(calls.parses).toHaveLength(1);
    const comp = calls.parses[0].companions;
    expect([...(comp?.keys() ?? [])]).toEqual(['hypnosphere.sps']);
    expect(comp?.get('hypnosphere.sps')?.byteLength).toBe(SPS.byteLength);
  });
});
