/**
 * openSong is the one door (plan 2026-10-07-one-load-save-export-path, U2.2).
 *
 * One reachability test per migrated entry-point family, each through its REAL
 * top-level entry, each proving openSong RAN (spy count) and the song reached
 * the stores (applySong spy count + the editor mode). Behaviour is tested where
 * it lives (classifySong, the status bar, the lifecycle); this file proves the
 * wiring once per family.
 *
 * Two of the families were broken before this: the embed's LOAD_FILE and the
 * SID info dialog loaded NOTHING for a tracker module (loadFile answered
 * 'pending-import' and neither caller knew the word).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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
// The sentinels: the real functions, counted.
vi.mock('@/lib/song/openSong', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/openSong')>();
  return { ...real, openSong: vi.fn(real.openSong) };
});
vi.mock('@/lib/song/applySong', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/applySong')>();
  return { ...real, applySong: vi.fn(real.applySong) };
});
// The embed mounts the pattern playback hook, which builds a Tone replayer; no audio graph in node.
vi.mock('@/hooks/audio/usePatternPlayback', () => ({ usePatternPlayback: () => {} }));
vi.mock('@/lib/hvscApi', () => ({ downloadHVSCFile: vi.fn() }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MOD_PATH = 'public/data/songs/formats/a sleep so deep.mod';
const modBytes = (): ArrayBuffer => {
  const b = readFileSync(resolve(ROOT, MOD_PATH));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

import { useFormatStore } from '@/stores/useFormatStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';

async function sentinels() {
  const { openSong } = await import('@/lib/song/openSong');
  const { applySong } = await import('@/lib/song/applySong');
  return { openSong: vi.mocked(openSong), applySong: vi.mocked(applySong) };
}

describe('openSong entry points', { timeout: 120000 }, () => {
  let play: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    const { openSong, applySong } = await sentinels();
    openSong.mockClear(); applySong.mockClear();
    play = vi.fn(async () => {});
    useTransportStore.setState({ play } as never);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('MCP load_file: the bridge loadFile handler opens a module through openSong', async () => {
    const { loadFile } = await import('@/bridge/handlers/writeHandlers');
    const bytes = new Uint8Array(modBytes());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const result = await loadFile({ filename: 'a sleep so deep.mod', data: btoa(bin) });
    const { openSong, applySong } = await sentinels();

    expect(result.error).toBeUndefined();
    expect(openSong).toHaveBeenCalledTimes(1);
    expect(openSong.mock.calls[0][1].origin).toBe('mcp');
    expect(applySong).toHaveBeenCalledTimes(1);
    expect(useFormatStore.getState().editorMode).toBe('classic');
    expect(result.editorMode).toBe('classic');
    expect(result.patterns).toBe(useTrackerStore.getState().patterns.length);
    expect(play).not.toHaveBeenCalled(); // D2: MCP load does not start playback
  });

  it('jukebox: Play opens the song through openSong with the jukebox origin, which starts it', async () => {
    const mod = modBytes();
    const INDEX = {
      gaps: [], dirs: [],
      entries: [{ id: 'protracker', label: 'ProTracker', formatKey: 'protracker', files: ['/data/songs/formats/a sleep so deep.mod'], total: 1, dir: 'formats' }],
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/data/songs/index.json')) return new Response(JSON.stringify(INDEX));
      if (String(url).endsWith('.mod')) return new Response(mod);
      if (String(url).includes('/get-data')) return new Response('{}');
      return new Response('', { status: 404 });
    }));
    const { JukeboxPanel } = await import('@/components/jukebox/JukeboxPanel');
    const { findAllByText, findByTitle } = render(<JukeboxPanel onClose={() => {}} />);
    await findAllByText(/ProTracker/);
    fireEvent.click(await findByTitle('Play (Enter)'));
    const { openSong, applySong } = await sentinels();

    await waitFor(() => expect(applySong).toHaveBeenCalledTimes(1), { timeout: 60000 });
    expect(openSong).toHaveBeenCalledTimes(1);
    expect(openSong.mock.calls[0][1].origin).toBe('jukebox');
    expect(openSong.mock.calls[0][0]).toMatchObject({ kind: 'url' });
    expect(play).toHaveBeenCalledTimes(1);   // D2: the jukebox starts the song itself
    expect(useFormatStore.getState().editorMode).toBe('classic');
  });

  it('embed LOAD_FILE: a module sent by the parent page is opened (it loaded nothing before)', async () => {
    const { PatternEditorEmbed } = await import('@/components/embed/PatternEditorEmbed');
    render(<PatternEditorEmbed />);
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'LOAD_FILE', filename: 'a sleep so deep.mod', arrayBuffer: modBytes() },
    }));
    const { openSong, applySong } = await sentinels();

    await waitFor(() => expect(applySong).toHaveBeenCalledTimes(1), { timeout: 60000 });
    expect(openSong).toHaveBeenCalledTimes(1);
    expect(openSong.mock.calls[0][1].origin).toBe('embed');
    expect(useFormatStore.getState().editorMode).toBe('classic');
  });

  it('SID info dialog: a tune picked from the composer list is opened (a module loaded nothing before)', async () => {
    const { downloadHVSCFile } = await import('@/lib/hvscApi');
    vi.mocked(downloadHVSCFile).mockResolvedValue(modBytes());
    const onClose = vi.fn();
    const { useSIDInfoDialog } = await import('@/hooks/dialogs/useSIDInfoDialog');
    const { result } = renderHook(() => useSIDInfoDialog({ onClose }));
    await act(async () => {
      await result.current.handleLoadTune({ id: 1, path: 'MUSICIANS/x/a sleep so deep.mod', filename: 'a sleep so deep.mod' } as never);
    });
    const { openSong, applySong } = await sentinels();

    expect(openSong).toHaveBeenCalledTimes(1);
    expect(openSong.mock.calls[0][1].origin).toBe('dialog');
    expect(applySong).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(useFormatStore.getState().editorMode).toBe('classic');
  });
});
