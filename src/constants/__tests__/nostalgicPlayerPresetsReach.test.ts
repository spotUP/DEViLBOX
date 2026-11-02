/**
 * N15(a) reachability: a New Song opened through startNewSong (what the wizard
 * calls) locks the format store to its format, and the preset browser's
 * category list (visibleFactoryCategories, what LoadPresetModal renders) then
 * carries that format's NostalgicPlayer bank with every preset, and no other
 * format's bank.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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


import '@stores/useCursorStore';
import { startNewSong } from '@/lib/song/startNewSong';
import { useFormatStore } from '@stores/useFormatStore';
import { allowedSynthTypes } from '@/lib/formats/EditableFormatRegistry';
import { PRESET_CATEGORIES } from '@constants/factoryPresets';
import { visibleFactoryCategories } from '@constants/factoryPresets/visibleCategories';
import { SOUND_MON_PRESETS } from '@constants/presets/nostalgicplayer/soundMonPresets';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public');
beforeAll(() => {
  // The template is a static file under public/; serve it the way Vite does.
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).replace(/^.*?\/templates\//, 'templates/');
    try { return new Response(new Uint8Array(readFileSync(resolve(PUBLIC, path)))); } catch { return new Response(null, { status: 404 }); }
  }));
});

describe('N15(a): New Song preset browser shows the format bank', () => {
  it('SoundMon New Song lists the SoundMon bank (all presets, synth type SoundMonWasmSynth) and no other format bank', async () => {
    await startNewSong({ kind: 'format', formatId: 'soundMon' });
    const formatId = useFormatStore.getState().activeFormatId;
    expect(formatId).toBe('soundMon');
    const visible = visibleFactoryCategories(allowedSynthTypes(formatId));
    expect(visible).toContain('SoundMon');
    expect(visible).not.toContain('Actionamics');
    expect(visible).not.toContain('Fred Editor');
    const bank = (PRESET_CATEGORIES as Record<string, Array<{ synthType?: string }>>)['SoundMon'];
    expect(bank).toHaveLength(SOUND_MON_PRESETS.length);
    expect(bank.every((p) => p.synthType === 'SoundMonWasmSynth')).toBe(true);
  }, 60_000);
});
