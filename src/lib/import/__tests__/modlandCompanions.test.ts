/**
 * A Modland download resolves companions through the one resolver, against
 * Modland's own directory listing. Reported 2026-10-06: downloading
 * bob4e.dum fetched no companion; UADE then failed with "file not found
 * '/uade/bob4e.ins'" and "'/uade/bob4.ins'" although Modland ships bob4.ins.
 * Only the network (listing + download) is mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadUADECompanions, downloadTFMXCompanion } from '../../modlandApi';

const DIR = 'pub/modules/Infogrames/Bob Morane';

function serveModland(files: string[]): string[] {
  const downloaded: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(String(input), 'http://x');
    if (url.pathname.endsWith('/modland/list')) {
      const dir = url.searchParams.get('dir') ?? '';
      const list = files.filter((f) => f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/'))
        .map((f) => ({ full_path: f, filename: f.split('/').pop() }));
      return new Response(JSON.stringify({ files: list }), { status: 200 });
    }
    if (url.pathname.endsWith('/modland/download')) {
      const path = url.searchParams.get('path') ?? '';
      if (!files.includes(path)) return new Response(JSON.stringify({ error: 'nf' }), { status: 404 });
      downloaded.push(path.split('/').pop() ?? '');
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    return new Response('', { status: 404 });
  });
  return downloaded;
}

describe('Modland companions go through the resolver', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(() => { vi.restoreAllMocks(); });

  it('a Modland bob4e.dum download fetches bob4.ins', async () => {
    const got = serveModland([`${DIR}/bob4e.dum`, `${DIR}/bob4.ins`, `${DIR}/other.dum`]);
    const found = await downloadUADECompanions(`${DIR}/bob4e.dum`);
    expect(found.map((c) => c.filename)).toEqual(['bob4.ins']);
    expect(got).toEqual(['bob4.ins']);
  });

  it('a Modland jpn.x download fetches smp.x (prefix form)', async () => {
    serveModland([`${DIR}/jpn.virocop-14`, `${DIR}/smp.virocop-14`]);
    expect((await downloadUADECompanions(`${DIR}/jpn.virocop-14`)).map((c) => c.filename)).toEqual(['smp.virocop-14']);
  });

  it('a Modland x.jpn download fetches x.smp (extension form)', async () => {
    serveModland([`${DIR}/virocop-14.jpn`, `${DIR}/virocop-14.smp`]);
    expect((await downloadUADECompanions(`${DIR}/virocop-14.jpn`)).map((c) => c.filename)).toEqual(['virocop-14.smp']);
  });

  it('a Modland sdr song with nothing of its own takes the shared smp.set', async () => {
    serveModland([`${DIR}/sdr.monsterbusiness_5`, `${DIR}/smp.set`]);
    expect((await downloadUADECompanions(`${DIR}/sdr.monsterbusiness_5`)).map((c) => c.filename)).toEqual(['smp.set']);
  });

  it('a Modland mdat.x download fetches smpl.x through the same resolver', async () => {
    serveModland([`${DIR}/mdat.tune`, `${DIR}/smpl.tune`]);
    expect((await downloadTFMXCompanion(`${DIR}/mdat.tune`))?.filename).toBe('smpl.tune');
  });

  it('a plain module with no partners fetches nothing', async () => {
    const got = serveModland([`${DIR}/a.mod`, `${DIR}/b.mod`]);
    expect(await downloadUADECompanions(`${DIR}/a.mod`)).toEqual([]);
    expect(got).toEqual([]);
  });
});
