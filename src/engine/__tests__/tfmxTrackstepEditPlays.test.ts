/**
 * Owner 2026-11-03: "my matrix edits look like they change the pattern but pressing play plays the unchanged song"
 * (TFMX trackstep matrix).
 *
 * Cause: the trackstep matrix wrote only tfmxNative.tracksteps. The module bytes play loads (tfmxFileData) kept the
 * old trackstep table, the grid was not decoded again, and the running tune was not told.
 *
 * Real song through the real open path (openSong, with its smpl companion); the edit is the matrix's own write
 * (setTFMXTrackstepVoice); the next play's module is what engineLoadArgs loads, read back with the TFMX parser.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: () => () => undefined });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});

const swapModule = vi.fn();
const settle = () => new Promise((r) => setTimeout(r, 100));
const bytesOf = (rel: string): ArrayBuffer => {
  const b = readFileSync(rel);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('TFMX: a trackstep matrix edit is what the next play plays', { timeout: 300000 }, () => {
  beforeAll(async () => {
    await import('@stores');
    const { setDevilboxAudioContext } = await import('@/utils/audio-context');
    setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);
    const { TFMXEngine } = await import('@/engine/tfmx/TFMXEngine');
    vi.spyOn(TFMXEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(TFMXEngine, 'getInstance').mockReturnValue({ swapModule } as never);
  }, 300000);

  it('pattern and transpose edits (mdat.hbtitle)', async () => {
    const { openSong } = await import('@/lib/song/openSong');
    const r = await openSong({
      kind: 'bytes', name: 'mdat.hbtitle', bytes: bytesOf('public/data/songs/tfmx/mdat.hbtitle'),
      companions: new Map([['smpl.hbtitle', bytesOf('public/data/songs/tfmx/smpl.hbtitle')]]),
    }, { origin: 'mcp' });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const { useFormatStore } = await import('@stores/useFormatStore');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const native = useFormatStore.getState().tfmxNative!;
    const steps = native.tracksteps.filter((s) => !s.isEFFE && s.stepIndex >= native.firstStep && s.stepIndex <= native.lastStep);
    const editable = (s: typeof steps[number], v: number) => !s.voices[v].isStop && !s.voices[v].isHold;
    const a = steps.find((s) => editable(s, 0))!;
    const b = steps.find((s) => s !== a && editable(s, 1)) ?? a;
    const used = new Set(native.tracksteps.flatMap((s) => s.voices.map((v) => v.patternNum)));
    const to = [...used].find((p) => p >= 0 && p !== a.voices[0].patternNum)!;
    expect(to, 'the song has another pattern to choose').toBeGreaterThanOrEqual(0);
    const tr = ((b.voices[1].transpose + 5 + 128) % 256) - 128;
    const gridIdx = steps.indexOf(a);
    const before = JSON.stringify(useTrackerStore.getState().patterns[gridIdx].channels[0].rows.map((c) => c.note));

    swapModule.mockClear();
    useFormatStore.getState().setTFMXTrackstepVoice(a.stepIndex, 0, to, a.voices[0].transpose);
    useFormatStore.getState().setTFMXTrackstepVoice(b.stepIndex, 1, b.voices[1].patternNum, tr);
    await settle();

    // the grid the pattern editor shows holds the new pattern on that step, voice 1
    const after = JSON.stringify(useTrackerStore.getState().patterns[gridIdx].channels[0].rows.map((c) => c.note));
    expect(after, 'the grid shows the new pattern').not.toBe(before);

    // the next play's module carries both edits
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const { playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
    const { engineLoadArgs } = await import('@/engine/replayer/NativeEngineRouting');
    const { parseTFMXFile } = await import('@/lib/import/formats/TFMXParser');
    const song = liveTrackerSong();
    const desc = playingDescriptor(song);
    expect(desc?.key, 'the song plays on the TFMX engine').toBe('TFMXModule');
    const { data } = await engineLoadArgs(song, desc!, false);
    const played = parseTFMXFile(data, 'mdat.hbtitle').tfmxNative!;
    const step = (i: number) => played.tracksteps.find((s) => s.stepIndex === i)!;
    expect(step(a.stepIndex).voices[0].patternNum).toBe(to);
    expect(step(b.stepIndex).voices[1].transpose).toBe(tr);

    // the running tune got the patched module (sentinel: the live write path ran)
    expect(swapModule).toHaveBeenCalled();
    const live = parseTFMXFile(swapModule.mock.calls.at(-1)![0] as ArrayBuffer, 'mdat.hbtitle').tfmxNative!;
    expect(live.tracksteps.find((s) => s.stepIndex === a.stepIndex)!.voices[0].patternNum).toBe(to);
  });
});
