/**
 * The import dialog is an optional step in front of openSong (plan
 * 2026-10-07-one-load-save-export-path, U2.3; owner decisions D1 and D4).
 *
 * ONE reachability test for the interactive family, through the real drop
 * handler (GlobalDragDropHandler -> openUserSong -> openSong) with the one
 * dialog host mounted, and one for the loading panel + Cancel through the real
 * store. Behaviour is tested where it lives (importChoice, the lifecycle).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const inject = vi.hoisted(() => ({ subsongs: 0 }));

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
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({ state: 'running', resume: async () => {} }) }));
// Sentinels: the real functions, counted.
vi.mock('@/lib/song/openSong', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/openSong')>();
  return { ...real, openSong: vi.fn(real.openSong), prepareSong: vi.fn(real.prepareSong) };
});
vi.mock('@/lib/song/applySong', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/applySong')>();
  return { ...real, applySong: vi.fn(real.applySong) };
});
// The scan, counted; a UADE scan is not available in node, so the "several
// subsongs" a real choice needs is injected into the real scan's result.
vi.mock('@/lib/import/prepareModuleImport', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/import/prepareModuleImport')>();
  return {
    ...real,
    prepareModuleImport: vi.fn(async (...args: Parameters<typeof real.prepareModuleImport>) => {
      const prepared = await real.prepareModuleImport(...args);
      return inject.subsongs > 1
        ? { ...prepared, uadeMetadata: { formatName: 'test', subsongCount: inject.subsongs } as never }
        : prepared;
    }),
  };
});

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MOD_PATH = 'public/data/songs/formats/a sleep so deep.mod';
const modBytes = (): ArrayBuffer => {
  const b = readFileSync(resolve(ROOT, MOD_PATH));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const modFile = (): File => new File([modBytes()], 'a sleep so deep.mod');

import { useSettingsStore } from '@/stores/useSettingsStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useSongLoadStore } from '@/stores/useSongLoadStore';
import { useImportRequestStore } from '@/lib/song/importRequest';

async function sentinels() {
  const { openSong, prepareSong } = await import('@/lib/song/openSong');
  const { applySong } = await import('@/lib/song/applySong');
  const { prepareModuleImport } = await import('@/lib/import/prepareModuleImport');
  return { openSong: vi.mocked(openSong), prepareSong: vi.mocked(prepareSong), applySong: vi.mocked(applySong), scan: vi.mocked(prepareModuleImport) };
}

function drop(file: File): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files: [file], items: [{ kind: 'file', webkitGetAsEntry: () => null }] },
  });
  act(() => { document.body.dispatchEvent(event); });
}

async function mountDropTarget() {
  const { GlobalDragDropHandler } = await import('@/components/ui/GlobalDragDropHandler');
  const { ImportDialogHost } = await import('@/components/dialogs/ImportDialogHost');
  const { openUserSong } = await import('@/lib/song/openUserSong');
  const failures: string[] = [];
  render(
    <GlobalDragDropHandler onFileLoaded={(f) => openUserSong(f, 'drop', undefined, (m) => failures.push(m))}>
      <ImportDialogHost open={false} onClose={() => {}} />
    </GlobalDragDropHandler>,
  );
  return failures;
}

describe('interactive open: a drop, the import dialog only for a real choice', { timeout: 180000 }, () => {
  beforeEach(async () => {
    inject.subsongs = 0;
    const { openSong, applySong, scan } = await sentinels();
    openSong.mockClear(); applySong.mockClear(); scan.mockClear();
  });
  afterEach(() => { cleanup(); useImportRequestStore.setState({ request: null }); });

  it('a plain module opens at once: no dialog, one open, one scan, classic editor', async () => {
    const failures = await mountDropTarget();
    drop(modFile());
    const { openSong, applySong, scan } = await sentinels();
    await waitFor(() => expect(applySong).toHaveBeenCalledTimes(1), { timeout: 100000 });

    expect(screen.queryByRole('button', { name: 'Load' })).toBeNull();
    expect(openSong).toHaveBeenCalledTimes(1);
    expect(openSong.mock.calls[0][1]).toMatchObject({ origin: 'drop', interactive: true });
    expect(scan).toHaveBeenCalledTimes(1);          // the D1 scan IS the import's scan
    expect(useFormatStore.getState().editorMode).toBe('classic');
    expect(failures).toEqual([]);
  });

  it('a file with several subsongs asks first; Import opens it through openSong without a second scan and writes no format engine setting', async () => {
    inject.subsongs = 3;
    const engineBefore = JSON.stringify(useSettingsStore.getState().formatEngine);
    const failures = await mountDropTarget();
    drop(modFile());
    const importButton = await screen.findByRole('button', { name: 'Load' }, { timeout: 100000 });
    const { openSong, applySong, scan } = await sentinels();
    await waitFor(() => expect((importButton as HTMLButtonElement).disabled).toBe(false), { timeout: 100000 });
    expect(applySong).not.toHaveBeenCalled();        // nothing opened before the answer

    fireEvent.click(importButton);
    await waitFor(() => expect(applySong).toHaveBeenCalledTimes(1), { timeout: 100000 });

    expect(openSong).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledTimes(1);           // the dialog showed the scan openSong made
    expect(JSON.stringify(useSettingsStore.getState().formatEngine)).toBe(engineBefore); // D4
    expect(failures).toEqual([]);
  });

  it('Cancel on the dialog opens nothing and reports no error', async () => {
    inject.subsongs = 3;
    const failures = await mountDropTarget();
    drop(modFile());
    const cancel = await screen.findByRole('button', { name: 'Cancel' }, { timeout: 100000 });
    const { applySong } = await sentinels();
    fireEvent.click(cancel);
    await waitFor(() => expect(useImportRequestStore.getState().request).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(applySong).not.toHaveBeenCalled();
    expect(failures).toEqual([]);
  });
});

describe('loading panel: shown while a song opens, Cancel aborts the open', { timeout: 180000 }, () => {
  afterEach(() => { cleanup(); useSongLoadStore.setState({ depth: 0, label: '', phase: 'idle', cancel: null, cancelled: false }); });

  it('shows the file name, phase and seconds from the store; Cancel calls the store hook', async () => {
    const { SongLoadPanel } = await import('@/components/tracker/SongLoadPanel');
    const cancel = vi.fn();
    render(<SongLoadPanel />);
    expect(screen.queryByTestId('song-load-panel')).toBeNull();

    act(() => { useSongLoadStore.setState({ depth: 1, label: 'cool tune.mod', phase: 'scan', startedAt: performance.now(), cancel }); });
    expect(screen.getByTestId('song-load-panel').textContent).toContain('cool tune.mod');
    expect(screen.getByTestId('song-load-panel').textContent).toContain('Scanning');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);

    act(() => { useSongLoadStore.setState({ depth: 0, label: '' }); });
    expect(screen.queryByTestId('song-load-panel')).toBeNull();
  });

  it('pressing Cancel while openSong scans aborts it: no song applied, a cancelled result, the panel gone', async () => {
    const { SongLoadPanel } = await import('@/components/tracker/SongLoadPanel');
    const { openSong, applySong } = await sentinels();
    applySong.mockClear();
    render(<SongLoadPanel />);
    let panelSeen = false;
    const result = await openSong(
      { kind: 'bytes', name: 'a sleep so deep.mod', bytes: modBytes() },
      {
        origin: 'drop',
        askForChoices: false,
        onProgress: ({ phase }) => {
          if (phase !== 'scan') return;
          panelSeen = screen.queryByTestId('song-load-panel') !== null;
          fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        },
      },
    );
    expect(panelSeen).toBe(true);
    expect(result).toMatchObject({ ok: false, cancelled: true });
    expect(applySong).not.toHaveBeenCalled();
    expect(useSongLoadStore.getState().depth).toBe(0);
    expect(screen.queryByTestId('song-load-panel')).toBeNull();
  });
});
