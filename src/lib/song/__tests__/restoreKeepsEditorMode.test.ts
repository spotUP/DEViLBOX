/**
 * An autosave restore brings a song back in the editor it was saved in, with
 * its engine data (U4.3, 2026-10-08).
 *
 * Seen live: a GoatTracker song opened in the GoatTracker editor, and the
 * crash-recovery restore of it came back "classic" with the visualizer. One
 * table over every format whose data lives in its own store: open the real
 * file through openSong, save it the way the autosave does (snapshotSong,
 * stored by structured clone like IndexedDB), restore it through
 * applySavedProject, and compare the editor mode and every native-data field
 * of the format store before and after.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import { openSong } from '@/lib/song/openSong';
import { setDevilboxAudioContext } from '@/utils/audio-context';

setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SONGS = 'public/data/songs/';
const bytesOf = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** The editor mode and which native fields the format store holds (sizes for buffers). */
async function fingerprint(): Promise<Record<string, unknown>> {
  const { useFormatStore } = await import('@/stores/useFormatStore');
  const s = useFormatStore.getState() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { editorMode: s.editorMode };
  for (const [k, v] of Object.entries(s)) {
    if (v == null || typeof v === 'function' || k === 'editorMode') continue;
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) out[k] = (v as ArrayBuffer).byteLength;
    else if (/Native$|StoreData$|^maxTraxData$/.test(k)) out[k] = 'present';
  }
  return out;
}

const FORMATS: ReadonlyArray<readonly [string, string, string]> = [
  ['GoatTracker', 'goat-tracker-ultra/$3jammar-akhbar.sng', 'goattracker'],
  ['SunVox', 'sunvox/last blow.sunvox', 'classic'],
  ['Hively', 'hivelytracker/waiting for a message.hvl', 'hively'],
  ['Klystrack', 'klystrack/Ocean Loader III.kt', 'klystrack'],
  ['MusicLine', 'musicline-editor/drax.ml', 'musicline'],
  ['SID Factory 2', 'sid-factory-2/Driver 11 Test - Filter.sf2', 'sidfactory2'],
  ['CheeseCutter', 'cheesecutter/abaddon-trouble.ct', 'cheesecutter'],
  ['JamCracker', 'jamcracker/freehand-spreadtro.jam', 'jamcracker'],
  ['MaxTrax', 'maxtrax/antmusic.mxtx', 'maxtrax'],
  ['Furnace', 'furnace/amiga/bruno_time.fur', 'furnace'],
  ['SID', 'sid/abaddon-starfish-test.sid', 'classic'],
  ['AHX', 'ahx/amanda.ahx', 'hively'],
  ['TFMX', 'tfmx/mdat.hbtitle', 'tfmx'],
];

// Not in the table: SunTronic opens only with a real audio context (its Paula nodes are built while it opens; its model is covered below),
// and Hippel ST restores a different image than it saved - its stored "module bytes" are the converted playback image, which the
// restore parses again as if it were the file (open item, reported separately).

describe('restoring an autosave keeps the editor and the engine data of the song', { timeout: 120000 }, () => {
  it.each(FORMATS)('%s', async (_label, rel, mode) => {
    const { snapshotSong } = await import('@/lib/song/snapshotSong');
    const { applySavedProject } = await import('@hooks/useProjectPersistence');
    const { CURRENT_SCHEMA } = await import('@/lib/persistence/migrations');
    const companions = rel.startsWith('tfmx/') ? new Map([['smpl.hbtitle', bytesOf(SONGS + 'tfmx/smpl.hbtitle')]]) : undefined;
    const r = await openSong({ kind: 'bytes', name: basename(rel), bytes: bytesOf(SONGS + rel), companions }, { origin: 'mcp' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const before = await fingerprint();
    expect(before.editorMode).toBe(mode);

    const saved = structuredClone({ version: '1.0.0', schemaVersion: CURRENT_SCHEMA, savedAt: '', ...snapshotSong() });
    expect(await applySavedProject(saved as never, { fromRecovery: true })).toBe(true);

    expect(await fingerprint()).toEqual(before);
  });
});

describe('a SunTronic save carries its native model', () => {
  it('a restored SunTronic song opens the SunTronic editor again', async () => {
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { getNativeEngineMetaForExport, decodeNativeEngineFields } = await import('@/lib/export/exporters');
    const native = { blocks: [[]], positions: [], widths: { arpShift: 0, volSlideRateFromStream: false }, numSampled: 0 };
    useFormatStore.getState().applyEditorMode({ sunTronicNative: native } as never);
    expect(useFormatStore.getState().editorMode).toBe('suntronic');

    const meta = structuredClone(getNativeEngineMetaForExport()!);
    useFormatStore.getState().applyEditorMode({} as never);
    expect(useFormatStore.getState().editorMode).toBe('classic');
    useFormatStore.getState().applyEditorMode(decodeNativeEngineFields(undefined, meta) as never);

    expect(useFormatStore.getState().editorMode).toBe('suntronic');
    expect(useFormatStore.getState().sunTronicNative).toEqual(native);
  });
});

describe('a freshly opened GoatTracker song is worth a recovery snapshot', () => {
  it('counts as content although it is one placeholder pattern and no instruments', async () => {
    const { liveProjectHasContent } = await import('@hooks/useProjectPersistence');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const r = await openSong({ kind: 'bytes', name: '$3jammar-akhbar.sng', bytes: bytesOf(SONGS + 'goat-tracker-ultra/$3jammar-akhbar.sng') }, { origin: 'mcp' });
    expect(r.ok).toBe(true);
    expect(useTrackerStore.getState().patterns.length).toBe(1);
    expect(useInstrumentStore.getState().instruments.length).toBe(0);
    expect(liveProjectHasContent()).toBe(true);
  });
});
