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

  // Reachability, not a regression: the old MIDI path's up-front tracker reset
  // already reset the format store. Proves loadFile's MIDI branch reaches applySong.
  it('a MIDI file after an AHX is classic too (loadFile -> applySong)', async () => {
    const { importTrackerModule, loadFile } = await import('../UnifiedFileLoader');
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const ahx = fileOf('public/data/songs/ahx/amanda.ahx', 'amanda.ahx');
    await importTrackerModule({
      metadata: { title: 'amanda', type: 'AHX', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await ahx.arrayBuffer(), file: ahx,
    } as never, { useLibopenmpt: true } as never);
    expect(useFormatStore.getState().editorMode).toBe('hively');

    const mid = fileOf('public/data/songs/midi/warning.mid', 'warning.mid');
    const result = await loadFile(mid);
    expect(result.success).toBe(true);
    expect(useFormatStore.getState().editorMode).toBe('classic');
    expect(useFormatStore.getState().hivelyNative).toBeNull();
  }, 60000);

  it('a V2M replaces the song: its instruments only, not stacked on the previous song', async () => {
    // loadV2MFile added the V2M's instruments on top of whatever was loaded
    // and reset nothing (2026-09-29 audit); it goes through applySong now.
    const { importTrackerModule, loadFile } = await import('../UnifiedFileLoader');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const mod = fileOf('src/__tests__/fixtures/micro15-goto80.mod', 'micro15.mod');
    await importTrackerModule({
      metadata: { title: 'micro15', type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await mod.arrayBuffer(), file: mod,
    } as never, { useLibopenmpt: true } as never);
    const modInstruments = useInstrumentStore.getState().instruments.length;
    expect(modInstruments).toBeGreaterThan(0);

    const v2m = fileOf('public/data/songs/v2/gamma projection.v2m', 'gamma projection.v2m');
    const result = await loadFile(v2m);
    expect(result.success).toBe(true);
    const { importV2M } = await import('@/lib/import/V2MToPattern');
    const expected = importV2M(await v2m.arrayBuffer(), { rowsPerPattern: 64, bpm: 120, speed: 6, createInstruments: true }).instruments.length;
    expect(useInstrumentStore.getState().instruments.length).toBe(expected);
  }, 60000);
});
