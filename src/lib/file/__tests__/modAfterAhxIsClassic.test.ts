/**
 * A MOD dropped in after an AHX opens in the classic editor.
 *
 * Owner report 2026-09-29: dragging micro15.mod in after playing an AHX
 * opened the AHX (hively) pattern layout. Each importTrackerModule branch
 * applied the song by hand, and the libopenmpt-metadata fallback never set
 * the editor mode - so the AHX's stayed; the classic branch of
 * applyEditorMode also left the AHX native data in the store. Every branch
 * now goes through applySong.
 *
 * Runs the real importTrackerModule - the drag-and-drop path
 * (ImportModuleDialog -> App onImport -> importTrackerModule) - with the
 * dialog's ModuleInfo for a header-read file (bytes + file; libopenmpt's
 * metadata worklet cannot run headless) and only the Tone engine, toasts and
 * network lookups mocked.
 */
import { describe, it, expect, vi } from 'vitest';
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
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
// The CED instrument classifier runs in a web worker; no worker server in node.
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const fileOf = (path: string, name: string) => {
  const b = readFileSync(resolve(ROOT, path));
  return new File([b], name);
};

describe('MOD after AHX', () => {
  it('lands in the classic editor with no AHX data left', async () => {
    const { importTrackerModule } = await import('../UnifiedFileLoader');
    const infoOf = async (file: File, type: string) => ({
      metadata: { title: file.name, type, channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(),
      file,
    });
    const { useFormatStore } = await import('@/stores/useFormatStore');

    const ahx = fileOf('public/data/songs/ahx/amanda.ahx', 'amanda.ahx');
    await importTrackerModule(await infoOf(ahx, 'AHX') as never, { useLibopenmpt: true } as never);
    expect(useFormatStore.getState().editorMode).toBe('hively');

    const mod = fileOf('src/__tests__/fixtures/micro15-goto80.mod', 'micro15.mod');
    await importTrackerModule(await infoOf(mod, 'MOD') as never, { useLibopenmpt: true } as never);
    const s = useFormatStore.getState();
    expect(s.editorMode).toBe('classic');
    expect(s.hivelyNative).toBeNull();
    expect(s.hivelyFileData).toBeNull();
  }, 60000);
});
