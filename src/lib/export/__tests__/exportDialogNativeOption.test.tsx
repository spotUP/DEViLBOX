/**
 * The Export dialog offers Native for every format the native export router exports (plan G20).
 *
 * Owner, 2026-10-07: no Native option for SunTronic mule.src although exportNativeSong exports it.
 * The dialog kept its own list of editor modes; it now asks the router (useExportDialog.runNativeExport).
 * For one corpus song of every format of the round-trip walk (nativeExportReloadSoundsTheSame),
 * opened through the app's own file path: the real dialog component shows Native, and choosing it
 * and pressing Export hands the download exactly the bytes exportNativeSong gives.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const saved: Array<{ name: string; bytes: Uint8Array }> = [];
vi.mock('file-saver', () => ({
  saveAs: async (blob: Blob, name: string) => { saved.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) }); },
}));
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => null : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer };
});
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const ROOT = process.cwd();
const SONGS = join(ROOT, 'public/data/songs');

/** First file under public/data/songs with one of the extensions. */
function firstFile(exts: string[]): string {
  const walk = (d: string): string | null => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) { const r = walk(p); if (r) return r; }
      else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) return p;
    }
    return null;
  };
  const found = walk(SONGS);
  if (!found) throw new Error(`no corpus song with ${exts.join('/')}`);
  return found;
}

// The formats of the round-trip walk: every one has a native exporter in the router.
const SONG_FILES: Array<[string, () => string]> = [
  ['SunTronic mule.src', () => join(SONGS, 'SUNTronicTunes/mule.src')],
  ['Rob Hubbard', () => firstFile(['.rh'])],
  ['David Whittaker', () => firstFile(['.dw'])],
  ['Ben Daglish', () => firstFile(['.bd'])],
  ['Jochen Hippel ST', () => firstFile(['.hst'])],
  ['Activision Pro', () => firstFile(['.avp'])],
  ['Fred Editor', () => firstFile(['.fred'])],
  ['Actionamics', () => firstFile(['.ast'])],
  ['Sound Master', () => firstFile(['.sm'])],
  ['Digital Sonix and Chrome', () => firstFile(['.dsc'])],
  ['SidMon 1', () => firstFile(['.sid1'])],
];

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.self ??= globalThis;
  (g.self as Record<string, unknown>).location ??= { href: 'file:///bd/Bd.js' };
  g.WorkerGlobalScope ??= class {};
  const WASM_BUNDLES: Array<[string, string]> = [['davidwhittaker', 'DavidWhittaker'], ['bd', 'Bd'], ['tfmx', 'TFMX']];
  vi.stubGlobal('fetch', async (url: string) => {
    for (const [dir, name] of WASM_BUNDLES) {
      const m = new RegExp(`${dir}/(${name}\\.(?:js|wasm))$`).exec(String(url));
      if (m) return new Response(readFileSync(join(ROOT, 'public', dir, m[1])), { status: 200 });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  });
});
afterEach(cleanup);

async function loadThroughApp(path: string): Promise<void> {
  const bytes = new Uint8Array(readFileSync(path));
  const file = new File([bytes.slice().buffer as ArrayBuffer], basename(path));
  const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
  await importTrackerModule({
    metadata: { title: basename(path), type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
}

describe('Export dialog Native option comes from the native export router', { timeout: 120_000 }, () => {
  for (const [name, path] of SONG_FILES) {
    it(`${name}: the dialog shows Native and exports the router's bytes`, async () => {
      await loadThroughApp(path());
      const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
      const routed = await exportNativeSong(null, {});
      expect(routed, 'the router exports this format').not.toBeNull();

      const { ExportDialog } = await import('@/lib/export/ExportDialog');
      saved.length = 0;
      render(<ExportDialog isOpen onClose={() => {}} />);
      const native = await screen.findByText('Native');
      fireEvent.click(native);
      fireEvent.click(screen.getAllByRole('button', { name: 'Export' }).at(-1)!);
      await waitFor(() => expect(saved.length).toBeGreaterThan(0));
      expect(saved[0].name).toBe(routed!.filename);
      expect(Buffer.from(saved[0].bytes).equals(Buffer.from(routed!.data))).toBe(true);
    });
  }
});
