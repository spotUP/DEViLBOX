/**
 * The parent id of a share upload names the share the current song came from,
 * and only while that song is still loaded: opening another song drops it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { packShare } from '../shareContainer';
import { storedFragment } from '../shareLink';

let generation = 1;
const uploads: (string | undefined)[] = [];
const sharedBytes = packShare({ name: 'a.mod', bytes: new Uint8Array(4000).map((_, i) => (i * 7919) & 255), companions: [] });

vi.mock('@/lib/song/songLifecycle', () => ({ currentSongGeneration: () => generation }));
vi.mock('@lib/song/openSong', () => ({ openSong: async () => { generation += 1; return { ok: true }; } }));
vi.mock('@lib/export/moduleExportService', () => ({ nativeExportAvailableForLiveSong: async () => false, exportNativeFile: async () => null }));
vi.mock('@lib/export/exporters', () => ({ songDbxBytes: () => ({ filename: 'x.dbx', bytes: new Uint8Array(4) }) }));
vi.mock('../shareApi', () => ({
  uploadShare: async (_c: Uint8Array, parent?: string) => { uploads.push(parent); return { id: `new${uploads.length}`, ownerKey: 'k' }; },
  downloadShare: async () => sharedBytes,
}));

describe('share parent id', () => {
  beforeEach(() => { uploads.length = 0; });

  it('is the opened share while that song is current, and gone after another song opens', async () => {
    const { buildShareLink, openShareHash } = await import('../shareService');
    expect(await openShareHash(`#share=${storedFragment('orig0001')}`)).toBe(true);
    await buildShareLink();
    generation += 1; // another song opened
    await buildShareLink();
    expect(uploads).toEqual(['orig0001', undefined]);
  });
});
