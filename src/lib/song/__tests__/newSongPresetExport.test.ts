/**
 * N13d/N13e: a New Song started from the wizard's system preset path (kind
 * 'preset') carries the route of its format, so exportNativeSong(null) from the
 * stores reaches that format's serializer (before: nothing exported).
 *
 * Drives startNewSong (what the wizard calls), then exportNativeSong; each
 * serializer is proven to have run by a spy, and its output by the format magic.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => {
  const r = {
    song: null as unknown,
    stop: () => undefined,
    loadSong(song: unknown) { r.song = song; },
    releaseSong() { r.song = null; },
    getSong: () => r.song,
    hasReplacedInstruments: false,
    replacedInstrumentIds: [] as number[],
  };
  const proxy = new Proxy(r, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined) });
  return { getTrackerReplayer: () => proxy, peekTrackerReplayer: () => proxy };
});
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const ran = vi.hoisted(() => ({} as Record<string, number>));
function spied<T extends Record<string, unknown>>(mod: T, name: keyof T & string, key: string): T {
  const fn = mod[name] as (...a: unknown[]) => unknown;
  return { ...mod, [name]: (...a: unknown[]) => { ran[key] = (ran[key] ?? 0) + 1; return fn(...a); } };
}
vi.mock('@lib/export/HippelCoSoExporter', async (orig) => spied(await orig<Record<string, unknown>>(), 'exportAsHippelCoSo', 'coso'));
vi.mock('@lib/export/TFMXExporter', async (orig) => spied(await orig<Record<string, unknown>>(), 'exportTFMX', 'tfmx'));
vi.mock('@lib/export/SoundMonExporter', async (orig) => spied(await orig<Record<string, unknown>>(), 'exportAsSoundMon', 'soundmon'));
vi.mock('@lib/export/FCExporter', async (orig) => spied(await orig<Record<string, unknown>>(), 'exportFC', 'fc'));
vi.mock('@lib/export/PumaTrackerExporter', async (orig) => spied(await orig<Record<string, unknown>>(), 'exportPumaTrackerFile', 'puma'));
vi.mock('@lib/export/MEDExporter', async (orig) => spied(await orig<Record<string, unknown>>(), 'exportMED', 'med'));
vi.mock('@lib/export/JamCrackerExporter', async (orig) => spied(await orig<Record<string, unknown>>(), 'exportAsJamCracker', 'jam'));

import '@stores/useCursorStore';
import { startNewSong } from '@/lib/song/startNewSong';
import { isPumaTrackerFormat } from '@lib/import/formats/PumaTrackerParser';
import { exportNativeSong } from '@lib/export/nativeExportRouter';

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** presetId, the serializer's spy key, and the check on the exported bytes. */
const ROWS: ReadonlyArray<readonly [presetId: string, key: string, magic: (b: Uint8Array) => string]> = [
  ['uade_hippelcoso', 'coso', (b) => ascii(b, 0, 4)],
  ['uade_tfmx', 'tfmx', (b) => ascii(b, 0, 10)],
  ['uade_soundmon', 'soundmon', (b) => ascii(b, 26, 3)],
  ['uade_futurecomposer', 'fc', (b) => ascii(b, 0, 4)],
  ['uade_jamcracker', 'jam', (b) => ascii(b, 0, 4)],
  ['uade_tfmx7', 'tfmx', (b) => ascii(b, 0, 10)],
  ['uade_octamed', 'med', (b) => ascii(b, 0, 4)],
  // PumaTracker has no magic string: the format's own detector is the check.
  ['uade_pumatracker', 'puma', (b) => (isPumaTrackerFormat(b.slice().buffer) ? 'PUMA' : 'not a PumaTracker file')],
];
const MAGIC: Record<string, string> = { uade_hippelcoso: 'COSO', uade_tfmx: 'TFMX-SONG ', uade_soundmon: 'V.2', uade_futurecomposer: 'FC14', uade_jamcracker: 'BeEp', uade_tfmx7: 'TFMX-SONG ', uade_octamed: 'MMD0', uade_pumatracker: 'PUMA' };

describe('wizard preset path: a fixed-format New Song exports as its format', () => {
  it.each(ROWS)('%s: startNewSong preset with instruments, then exportNativeSong, runs the %s serializer', async (presetId, key, magic) => {
    await startNewSong({ kind: 'preset', presetId, loadInstruments: true });
    const out = await exportNativeSong(null);
    expect(out, `router returned nothing: preset ${presetId} names no format to the export router`).not.toBeNull();
    expect(ran[key], `${key} serializer did not run`).toBeGreaterThan(0);
    const bytes = new Uint8Array(await new Blob([out!.data as BlobPart]).arrayBuffer());
    expect(magic(bytes)).toBe(MAGIC[presetId]);
  }, 60_000);
});
