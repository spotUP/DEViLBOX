/**
 * EDIT-GAP-steveTurner-encoder: a Steve Turner (offroad.jpo) grid note edit reaches the module the next play loads.
 *
 * The edit is made through the pattern editor's store action (useTrackerStore.setCell). editedModuleForPlay builds the play
 * bytes through the format's one exporter (SteveTurnerExporter, wired by the EditableFormatRegistry), which writes the edited
 * note into the note byte that played it (the parser's noteBytes). The play bytes differ from the file in that one byte only,
 * and a reload of them shows the edit. On revert (exporter returning the loaded bytes) editedModuleForPlay is null again.
 */
import { describe, it, expect, vi } from 'vitest';
import '@/stores/useTrackerStore';
import { readFileSync } from 'node:fs';
import { useTrackerStore } from '@/stores/useTrackerStore';

const live: { song: unknown } = { song: null };
vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => live.song : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});

const PATH = 'public/data/songs/formats/offroad.jpo';

describe('Steve Turner grid edit reaches the bytes the engine plays', () => {
  it('a store note edit changes only its note byte in the next-play module, and a reload shows it', async () => {
    const raw = readFileSync(PATH);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'offroad.jpo'));
    expect(song.format).toBe('SteveTurner');

    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    setGridBaseline(baselineOf(song.patterns));
    const { editedModuleForPlay } = await import('@engine/replayer/editedModuleForPlay');
    const { WASM_ENGINES } = await import('@engine/replayer/wasmEngineRegistry');
    const desc = WASM_ENGINES.find((d) => d.key === 'SteveTurner')!;
    (await import('@/stores/useFormatStore')).useFormatStore.getState().applyEditorMode(song);
    useTrackerStore.setState({ patterns: song.patterns, currentPatternIndex: 0 });
    live.song = new Proxy(song, { get: (t, k, r) => (k === 'patterns' ? useTrackerStore.getState().patterns : Reflect.get(t, k, r)) });

    // Unedited: nothing is substituted for the loaded module.
    expect(await editedModuleForPlay(live.song as typeof song, desc)).toBeNull();

    // A played note cell that a note byte ($00-$7F) carries.
    const nb = song.uadeVariableLayout!.noteBytes!.find((n) => n.note > 13 && n.note < 90 && song.songPositions.includes(n.pattern))!;
    expect(nb, 'the parser names the note byte of a played cell').toBeTruthy();
    const old = song.patterns[nb.pattern].channels[nb.channel].rows[nb.row];
    expect(old.note).toBe(nb.note);
    expect(raw[nb.offset]).toBe(nb.note - 13);
    useTrackerStore.getState().setCell(nb.channel, nb.row, { note: old.note + 1 }, nb.pattern);

    const played = Buffer.from(new Uint8Array((await editedModuleForPlay(live.song as typeof song, desc))!));
    expect(played.length).toBe(raw.length);
    const diff = [...played.keys()].filter((i) => played[i] !== raw[i]);
    expect(diff).toEqual([nb.offset]);
    expect(played[nb.offset]).toBe(nb.note - 13 + 1);

    const again = await parseModuleToSong(new File([new Uint8Array(played)], 'offroad.jpo'));
    expect(again.patterns[nb.pattern].channels[nb.channel].rows[nb.row].note).toBe(old.note + 1);
    expect(again.patterns[nb.pattern].channels[nb.channel].rows[nb.row].instrument).toBe(old.instrument);
  }, 300_000);
});
