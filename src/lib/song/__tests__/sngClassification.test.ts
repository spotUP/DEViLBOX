/**
 * One rule for .sng (U4.5). Three formats use the extension and the registry's
 * name-only answer for every .sng is Zound Monitor, so a file is classified by
 * its bytes: GoatTracker by its GTS magic, Richard Joseph by RJP + SMOD, the
 * rest Zound Monitor. Every opener, the song index and the sweep reach the same
 * rule (detectFormatFromContent). One wiring test per entry family for the
 * GoatTracker song (the one that fell out); the rule itself is tested on all three.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { classifySong } from '@/lib/song/openSong';
import { detectFormatFromContent } from '@/lib/import/FormatRegistry';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const GT = 'public/data/songs/goat-tracker-ultra/$3jammar-akhbar.sng';
const ZM = 'public/data/songs/zoundmonitor/sonjavanveen.sng';
const RJ = 'public/data/songs/richard-joseph/cannon fodder (intro).sng';
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(ROOT, p)));
const fileOf = (p: string): File => new File([bytes(p) as unknown as BlobPart], basename(p));
const keyOf = (p: string): string | undefined =>
  detectFormatFromContent(basename(p).toLowerCase(), bytes(p).subarray(0, 128))?.key;

describe('the .sng rule', () => {
  it('names each of the three .sng formats by its bytes, not by the extension', () => {
    expect(keyOf(GT)).toBe('goatTracker');
    expect(keyOf(RJ)).toBe('richardJoseph');   // was Zound Monitor
    expect(keyOf(ZM)).toBe('zoundMonitor');
  });

  it('classifySong sends a GoatTracker .sng to its engine and the others to the module path', async () => {
    expect(await classifySong(fileOf(GT))).toBe('goatTracker');
    expect(await classifySong(fileOf(ZM))).toBe('module');
    expect(await classifySong(fileOf(RJ))).toBe('module');
  });

  it('the registry names a GoatTracker .sng as GoatTracker, so no Zound Monitor prompt keys on it', () => {
    const head = (p: string): Uint8Array => bytes(p).subarray(0, 128);
    expect(detectFormatFromContent('x.sng', head(GT))?.key).not.toBe('zoundMonitor');
    expect(detectFormatFromContent('x.sng', head(ZM))?.key).toBe('zoundMonitor');
  });

  it('the committed song index labels every .sng by the same rule', () => {
    const index = JSON.parse(readFileSync(resolve(ROOT, 'public/data/songs/index.json'), 'utf8')) as {
      entries: Array<{ formatKey: string | null; files: string[] }>;
    };
    const wrong: string[] = [];
    for (const e of index.entries) {
      for (const f of e.files.filter((n) => n.toLowerCase().endsWith('.sng'))) {
        const k = detectFormatFromContent(basename(f).toLowerCase(), bytes(`public${decodeURI(f)}`).subarray(0, 128))?.key;
        if (k !== e.formatKey) wrong.push(`${f}: indexed ${e.formatKey}, content ${k}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('a GoatTracker .sng lands in GoatTracker from every entry', { timeout: 120000 }, () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const landed = (): [string, number] => [useFormatStore.getState().editorMode, useTrackerStore.getState().patterns.length];

  for (const origin of ['drop', 'filebrowser'] as const) {
    it(`${origin}: openUserSong`, async () => {
      const { openUserSong } = await import('@/lib/song/openUserSong');
      const errs: string[] = [];
      useFormatStore.getState().applyEditorMode({} as never);
      await openUserSong(fileOf(GT), origin, undefined, (m) => errs.push(m));
      expect(errs).toEqual([]);
      expect(landed()).toEqual(['goattracker', 1]);
    });
  }

  // Owner, 2026-10-08: the Modland HVSC Jammar_akhbar.sid, then the dropped
  // .sng - the status bar still showed the SID's title and subsongs, because
  // the song's header info outlived the song (U4.6).
  it('a song opened after a SID no longer carries the SID header or the SongDB info', async () => {
    const { openUserSong } = await import('@/lib/song/openUserSong');
    useFormatStore.getState().setSidMetadata({
      format: 'PSID', version: 2, title: 'Jammar akhbar', author: 'Shogoon', copyright: '2021',
      chipModel: '8580', clockSpeed: 'PAL', subsongs: 2, defaultSubsong: 0, currentSubsong: 0,
      secondSID: false, thirdSID: false,
    });
    useFormatStore.getState().setSongDBInfo({ authors: ['x'], publishers: [], album: '', year: '', format: 'SID', duration_ms: 1 });
    await openUserSong(fileOf(GT), 'drop', undefined, () => {});
    expect(landed()).toEqual(['goattracker', 1]);
    expect(useFormatStore.getState().sidMetadata).toBeNull();
    expect(useFormatStore.getState().songDBInfo).toBeNull();
  });

  it('jukebox: a url source with the jukebox origin', async () => {
    const buf = bytes(GT);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).endsWith('.sng') ? new Response(buf as unknown as BodyInit) : new Response('', { status: 404 })));
    const { openSong } = await import('@/lib/song/openSong');
    useFormatStore.getState().applyEditorMode({} as never);
    const r = await openSong({ kind: 'url', url: '/data/songs/goat-tracker-ultra/%243jammar-akhbar.sng' }, { origin: 'jukebox' });
    expect(r.ok).toBe(true);
    expect(landed()).toEqual(['goattracker', 1]);
  });

  it('MCP load_file: the bridge handler', async () => {
    const { loadFile } = await import('@/bridge/handlers/writeHandlers');
    let bin = '';
    for (const b of bytes(GT)) bin += String.fromCharCode(b);
    useFormatStore.getState().applyEditorMode({} as never);
    const r = await loadFile({ filename: basename(GT), data: btoa(bin) });
    expect(r.error).toBeUndefined();
    expect(landed()).toEqual(['goattracker', 1]);
  });
});
