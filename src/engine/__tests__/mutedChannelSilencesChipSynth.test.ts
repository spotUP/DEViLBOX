/**
 * "A muted channel plays no note on a chip synth instrument" (2026-11-11).
 *
 * Muting channels while a Neo Geo (FurnaceOPNB) song played left it sounding (rms 0.20 -> 0.15 with all
 * 8 channels muted). The mixer's mute reached the channel strips and the replayer skipped new note-ons,
 * but a Furnace chip instrument sounds on the synth bus, past the strips, so a note already held kept
 * ringing. Every mute path (mute button, solo, MCP) ends in TrackerReplayer.setChannelMuteMask.
 *
 * 1. Wiring: the real setChannelMuteMask -> ToneEngine -> FurnaceDispatchSynth sends the chip's own
 *    per-channel mute, with the chip's platform, for exactly the song channels the mask silences.
 * 2. Effect: on the real dispatch worklet and WASM, that mute silences a note already sounding, and
 *    the channel plays again once unmuted.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { chipChannelMutes } from '../furnace-dispatch/chipChannel';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';

const OPNB = 57;
const GB = 6;

interface MuteCall { chan: number; muted: boolean; platformType?: number }

const engineState: { instruments: Map<number, unknown> } = { instruments: new Map() };

vi.mock('../ToneEngine', async (orig) => {
  const real = await orig<typeof import('../ToneEngine')>();
  return { ...real, getToneEngine: () => Object.assign(Object.create(real.ToneEngine.prototype), engineState) };
});

async function chipSynth(chipChannels: number, platformType: number, calls: MuteCall[]) {
  const { FurnaceDispatchSynth } = await import('../furnace-dispatch/FurnaceDispatchSynth');
  return Object.assign(Object.create(FurnaceDispatchSynth.prototype), {
    platformType,
    engine: {
      getChannelCount: () => chipChannels,
      mute: (chan: number, muted: boolean, pt?: number) => calls.push({ chan, muted, platformType: pt }),
    },
  });
}

async function trackerReplayer(numChannels: number) {
  const { TrackerReplayer } = await import('../TrackerReplayer');
  return Object.assign(Object.create(TrackerReplayer.prototype), {
    isDJDeck: false,
    channelMuteMask: 0xffffffff,
    _activeWasmEngine: null,
    song: { numChannels },
  }) as InstanceType<typeof TrackerReplayer>;
}

function lastMutes(calls: MuteCall[], chipChannels: number): boolean[] {
  return calls.slice(-chipChannels).map((c) => c.muted);
}

describe('a muted channel plays no note on a chip synth instrument', () => {
  // The engine modules are large: import them once, outside the per-test timeout.
  beforeAll(async () => {
    await import('../TrackerReplayer');
    await import('../furnace-dispatch/FurnaceDispatchSynth');
  }, 180_000);

  beforeEach(async () => {
    engineState.instruments = new Map();
    const { useFormatStore } = await import('@/stores/useFormatStore');
    useFormatStore.setState({ editorMode: 'classic' } as never);
  });

  it('muting every channel of an 8-channel Neo Geo song mutes the chip channels it plays on', async () => {
    const calls: MuteCall[] = [];
    engineState.instruments.set(1, await chipSynth(14, OPNB, calls));
    const replayer = await trackerReplayer(8);

    replayer.setChannelMuteMask(0);   // all audible bits clear

    expect(calls.every((c) => c.platformType === OPNB)).toBe(true);
    // Song channels 0-7 play on chip channels 0-7; chip channels 8-13 carry no song channel.
    expect(lastMutes(calls, 14)).toEqual([...Array(8).fill(true), ...Array(6).fill(false)]);

    replayer.setChannelMuteMask(1 << 3);   // only channel 3 audible
    expect(lastMutes(calls, 14).map((m, c) => (m ? -1 : c)).filter((c) => c >= 0 && c < 8)).toEqual([3]);

    replayer.setChannelMuteMask(0xff);     // all audible again
    expect(lastMutes(calls, 14).some(Boolean)).toBe(false);
  });

  it('keeps a shared chip channel open while one of its song channels is audible', () => {
    // 8 song channels on a 4-channel Game Boy: chip channel 0 carries song channels 0 and 4.
    const songMutes = [true, true, true, true, false, true, true, true];
    expect(chipChannelMutes(songMutes, 4)).toEqual([false, true, true, true]);
    expect(chipChannelMutes(Array(8).fill(true), 4)).toEqual([true, true, true, true]);
  });

  it('leaves chip mutes to the mixer in the Furnace editor', async () => {
    const { useFormatStore } = await import('@/stores/useFormatStore');
    useFormatStore.setState({ editorMode: 'furnace' } as never);
    const calls: MuteCall[] = [];
    engineState.instruments.set(1, await chipSynth(4, GB, calls));
    (await trackerReplayer(4)).setChannelMuteMask(0);
    expect(calls).toEqual([]);
  });

  it('the chip mute silences a note already sounding, and the channel plays again once unmuted', async () => {
    loadSharedWorkletScripts();
    const { proc, send } = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
    await send({ type: 'createChip', platformType: GB, sampleRate: 48000 });
    // As the mixer does after every play: open the chip's channels first.
    for (let ch = 0; ch < 4; ch++) await send({ type: 'mute', chan: ch, mute: false, platformType: GB });
    const rms = (blocks: number) => {
      let sq = 0, n = 0;
      const outs = stereoOutputs(37);
      for (let b = 0; b < blocks; b++) {
        proc.process([], outs);
        for (const ch of outs[0]) for (const v of ch) { sq += v * v; n++; }
      }
      return Math.sqrt(sq / n);
    };
    await send({ type: 'dispatch', platformType: GB, cmd: 0, chan: 0, val1: 60, val2: 0 });   // note on C-4
    await send({ type: 'dispatch', platformType: GB, cmd: 3, chan: 0, val1: 15, val2: 0 });   // full volume
    expect(rms(200)).toBeGreaterThan(0.001);

    await send({ type: 'mute', chan: 0, mute: true, platformType: GB });
    rms(20);   // let the chip settle
    expect(rms(200)).toBeLessThan(0.0005);

    // Unmuted, the channel plays again (the Game Boy core, as in Furnace, resumes at the next note).
    await send({ type: 'mute', chan: 0, mute: false, platformType: GB });
    await send({ type: 'dispatch', platformType: GB, cmd: 0, chan: 0, val1: 60, val2: 0 });
    await send({ type: 'dispatch', platformType: GB, cmd: 3, chan: 0, val1: 15, val2: 0 });
    expect(rms(200)).toBeGreaterThan(0.001);
  });
});
