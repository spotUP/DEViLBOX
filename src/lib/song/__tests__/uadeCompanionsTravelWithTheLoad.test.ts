/**
 * A Modland bob4e.dum opened through openSong reaches UADE with bob4.ins IN
 * the load call (companions are owned by the call; nothing is written into
 * the engine's filesystem ahead of it - UADE reported "file not found
 * '/uade/bob4.ins'" when a browser pre-wrote them, 2026-10-06). Real openSong,
 * acquire step, Modland resolver and prepareModuleImport; the engine is a
 * recorder with NO addCompanionFile, so a pre-write would throw.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const calls = vi.hoisted(() => ({
  loads: [] as Array<{ name: string; companions: ReadonlyMap<string, ArrayBuffer> | undefined }>,
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
vi.mock('@engine/uade/UADEEngine', () => {
  const engine = {
    onInitProgress: () => () => {},
    ready: async () => {},
    reinitIfNeeded: async () => {},
    enableTickSnapshots: () => {},
    resetTickSnapshots: () => {},
    load: async (_b: ArrayBuffer, name: string, _skip?: boolean, _sub?: number, _t?: number, _l?: boolean, _p?: boolean, companions?: ReadonlyMap<string, ArrayBuffer>) => {
      calls.loads.push({ name, companions });
      return { subsongCount: 1, formatName: 'Infogrames' };
    },
  };
  return { UADEEngine: { getInstance: () => engine } };
});

import { openSong } from '@/lib/song/openSong';

const DIR = 'pub/modules/Infogrames/Charles Callet';
const FILES = ['bob4e.dum', 'bob4.ins', 'bob4d.ins', 'bob4f.dum'].map((n) => `${DIR}/${n}`);

describe('a UADE-only module and its partner reach the engine in one load call', () => {
  it('prepareModuleImport hands the partner file to UADEEngine.load, once, with the call', async () => {
    const { prepareModuleImport } = await import('@/lib/import/prepareModuleImport');
    calls.loads.length = 0;
    await prepareModuleImport(new File([new Uint8Array(64)], 'tomy.song'), [new File([new Uint8Array(8)], 'smp.song')]);
    expect(calls.loads).toHaveLength(1);
    expect([...(calls.loads[0].companions?.keys() ?? [])]).toEqual(['smp.song']);
  });
});

describe('a Modland bob4e.dum carries bob4.ins with the load', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the parse receives bob4.ins exactly once, under its relative name', async () => {
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = new URL(String(input), 'http://x');
      if (url.pathname.endsWith('/modland/list')) {
        const dir = url.searchParams.get('dir') ?? '';
        const files = FILES.filter((f) => f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/'))
          .map((f) => ({ full_path: f, filename: f.split('/').pop() }));
        return new Response(JSON.stringify({ files }), { status: 200 });
      }
      if (url.pathname.endsWith('/modland/download')) {
        return FILES.includes(url.searchParams.get('path') ?? '') ? new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }) : new Response('{}', { status: 404 });
      }
      return new Response('{}', { status: 404 });
    });
    calls.loads.length = 0;
    calls.parses.length = 0;
    await openSong({ kind: 'modland', path: `${DIR}/bob4e.dum` }, { origin: 'mcp' });
    // bob4e.dum has a native parser: the companions ride the parse, and nothing wrote them ahead of it.
    expect(calls.parses).toHaveLength(1);
    expect(calls.parses[0].name).toBe('bob4e.dum');
    expect([...(calls.parses[0].companions?.keys() ?? [])]).toEqual(['bob4.ins']);
  });
});
