/**
 * One parse per format: the tracker's import and the DJ decks open a file
 * into the same song.
 *
 * Owner, 2026-09-29: "why are all loading paths still not using the same
 * code?" importTrackerModule (drag and drop, file browser, MCP load_file,
 * the tour) kept five parse branches of its own while the DJ views called
 * parseModuleToSong, so a .mod dropped on the tracker (ProTracker note
 * names, each cell's period, sample slots) and the same .mod on a deck
 * (OpenMPT's: every slot, no periods, finetune lost) were different songs,
 * and .xrns had no route at all. importTrackerModule is now parseModuleToSong
 * + applySong.
 *
 * Runs the real importTrackerModule with the dialog's ModuleInfo, only the
 * Tone engine, toasts and network lookups mocked (as modAfterAhxIsClassic).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const ROOT = resolve(__dirname, '../../../..');
const SONGS: Array<[string, string]> = [
  ['MOD', 'src/__tests__/fixtures/micro15-goto80.mod'],
  ['XM', 'public/data/songs/xm/flo boarding - level 1.xm'],
  ['S3M', 'public/data/songs/s3m/andante.s3m'],
  ['IT', 'public/data/songs/it/absm chain mod.it'],
];

const cellsOf = (patterns: Array<{ channels: Array<{ rows: Array<{ note: number; instrument: number; effTyp: number; eff: number; period?: number }> }> }>) =>
  patterns.map((p) => p.channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.effTyp, r.eff, r.period ?? 0].join(','))));

describe('one parse path', () => {
  for (const [type, path] of SONGS) {
    it(`${type}: the tracker's import and the DJ decks get the same song`, async () => {
      const { importTrackerModule } = await import('../UnifiedFileLoader');
      const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
      const { useTrackerStore } = await import('@/stores/useTrackerStore');
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const bytes = readFileSync(resolve(ROOT, path));
      const name = path.split('/').pop()!;

      const dj = await parseModuleToSong(new File([bytes], name));
      await importTrackerModule({
        metadata: { title: name, type, channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
        arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        file: new File([bytes], name),
      } as never, { useLibopenmpt: true } as never);
      await new Promise<void>((r) => queueMicrotask(r));

      expect(cellsOf(useTrackerStore.getState().patterns)).toEqual(cellsOf(dj.patterns));
      expect(useTrackerStore.getState().patternOrder).toEqual(dj.songPositions);
      expect(useInstrumentStore.getState().instruments.map((i) => i.id)).toEqual(dj.instruments.map((i) => i.id));
    }, 120000);
  }

  it('MOD cells carry ProTracker note names and their periods on both paths', async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const bytes = readFileSync(resolve(ROOT, 'src/__tests__/fixtures/micro15-goto80.mod'));
    const song = await parseModuleToSong(new File([bytes], 'micro15.mod'));
    const cell = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).find((r) => r.period === 214)!;
    expect(cell.note).toBe(37); // C-3
  });

  it('XRNS opens as a song, not a UADE fallback', async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const bytes = readFileSync(resolve(ROOT, 'public/examples/demoscene/wavesabre-punqtured.xrns'));
    const song = await parseModuleToSong(new File([bytes], 'wavesabre-punqtured.xrns'));
    // The route and the Renoise synths. The pattern pool needs a browser's XML
    // DOM (happy-dom's selector engine finds no 'PatternPool > Patterns >
    // Pattern'); in Chrome this file opens with 22 patterns and 872 notes
    // (checked 2026-09-29 through the DEViLBOX MCP).
    expect(song.format).toBe('XRNS');
    expect(song.instruments.some((i) => i.synthType === 'WaveSabreSynth')).toBe(true);
  }, 120000);

  it('importTrackerModule parses nothing itself', () => {
    const src = readFileSync(resolve(__dirname, '../UnifiedFileLoader.ts'), 'utf8');
    const start = src.indexOf('export async function importTrackerModule(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toContain('parseModuleToSong(');
    for (const own of ['parseWithOpenMPT', 'convertMODModule', 'convertXMModule', 'convertModule(', 'nativeData', 'dmfSong', 'loadModuleFile']) {
      expect(body, own).not.toContain(own);
    }
  });
});
