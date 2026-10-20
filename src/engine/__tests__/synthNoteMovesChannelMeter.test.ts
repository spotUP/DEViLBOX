/**
 * Owner 2026-10-20: in a fresh song the channel VU meters of a synth channel did not move. Each note scheduled two
 * meter flashes that shared one per-channel level slot: triggerNote wrote the note's velocity, then the row's meter
 * loop overwrote it with the volume column read as a plain level, and an empty XM volume column (byte 0) read as 0.
 * Both flashes then showed 0.
 *
 * Drives TrackerReplayer.processRowForSynths (the row entry point of the TS scheduler) on a loaded fresh-song pattern
 * with a stub ToneEngine, runs the Tone.Draw callbacks after the row as the frame loop would, and checks the meter
 * level each flash shows.
 */
import { describe, it, expect, vi } from 'vitest';
import { TrackerReplayer, type TrackerSong } from '../TrackerReplayer';
import { useTrackerStore } from '@/stores/useTrackerStore';

const h = vi.hoisted(() => ({
  meters: [] as Array<[number, number]>,
  draws: [] as Array<() => void>,
}));

vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {}, setValueAtTime() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => 0, getTransport: () => transport, Draw: { schedule: (cb: () => void) => { h.draws.push(cb); }, cancel() {} } };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
vi.mock('../ToneEngine', () => {
  const engine = new Proxy({ triggerChannelMeter: (ch: number, level: number) => { h.meters.push([ch, level]); } } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => undefined) });
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useMixerStore', async (orig) => ({ ...(await orig<object>()), scheduleWasmEffectRebuild: vi.fn() }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const emptyRow = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

function freshSong(): TrackerSong {
  const rows = Array.from({ length: 4 }, () => ({ ...emptyRow }));
  rows[0] = { ...emptyRow, note: 49, instrument: 1 };
  const pattern = { id: 'p0', name: 'p0', length: 4, channels: [{ id: 'c0', name: 'c0', rows }] };
  return {
    name: 'fresh', format: 'XM', patterns: [pattern], songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 1, initialSpeed: 6, initialBPM: 125,
    instruments: [{ id: 1, name: 'Wobble Bass', type: 'synth', synthType: 'WobbleBass', volume: 0, pan: 0 }],
  } as unknown as TrackerSong;
}

describe('a synth note in a fresh song', () => {
  it('moves its channel meter to the note velocity', () => {
    const song = freshSong();
    const replayer = new TrackerReplayer();
    replayer.loadSong(song);
    useTrackerStore.setState({ patterns: song.patterns } as never);
    h.meters.length = 0; h.draws.length = 0;

    (replayer as unknown as { processRowForSynths(time: number): void }).processRowForSynths(1);
    for (const draw of h.draws) draw();

    expect(h.meters.length, 'the note flashed the meter').toBeGreaterThan(0);
    for (const [ch, level] of h.meters) {
      expect(ch).toBe(0);
      expect(level).toBe(1);
    }
  });
});
