/**
 * Engines with per-voice buffers expose each channel as its own output.
 *
 * The dub bus takes a channel's send from AudioWorklet output 5+ch (a copy of
 * the channel) and an effect/sidechain slot from outputs 1..4 (the channel
 * taken OUT of the main mix). Engines that mix inside their worklet had
 * neither, so "throw channel 2" could only throw the whole mix (2026-09-29).
 * worklets/channel-outputs.js adds both from the buffers the worklet already
 * renders. Drives the real worklet and WASM with a real song.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { startWorklet, loadSharedWorkletScripts, songBuffer, stereoOutputs } from './workletHarness';

beforeAll(loadSharedWorkletScripts);

const ENGINES: Array<[string, string, string]> = [
  ['oktalyzer', 'Oktalyzer', 'public/data/songs/oktalyzer/les granges brulees.okta'],
];

describe('per-channel engine outputs', { timeout: 120000 }, () => {
  it.each(ENGINES)('%s: dub send = the voice, isolation slot takes it out of the mix', async (dir, stem, song) => {
    const { proc, send } = await startWorklet(dir, stem);
    await send({ type: 'loadModule', moduleData: songBuffer(song) });
    await send({ type: 'play' });
    // Dub channel 1 (a copy); isolate channel 0 into slot 0.
    await send({ cmd: 'dubChannelEnable', type: 'dubChannelEnable', val: { channel: 1 }, channel: 1 });
    await send({ type: 'addIsolation', slotIndex: 0, channelMask: 0b1 });

    let dubMatched = 0, dubHeard = 0, slotHeard = 0, mainLeak = 0;
    for (let q = 0; q < 750; q++) {
      const out = stereoOutputs(37);
      proc.process([], out);
      const voices = proc.chBufs as Float32Array[];
      const sideOf = (ch: number) => ((proc.pans as number[])[ch] === 0 ? 0 : 1);
      for (let i = 0; i < 128; i++) {
        // Output 6 = dub send of channel 1: exactly voice 1, both sides.
        if (Math.abs(out[6][0][i] - voices[1][i]) < 1e-7 && out[6][1][i] === out[6][0][i]) dubMatched++;
        if (voices[1][i] !== 0) dubHeard++;
        // Output 1 = slot 0: voice 0 on its side.
        const slot = out[1][sideOf(0)][i];
        if (voices[0][i] !== 0 && Math.abs(slot - voices[0][i]) < 1e-7) slotHeard++;
        // Main mix on voice 0's side must not contain voice 0.
        let expect = 0;
        for (let ch = 1; ch < voices.length && ch < (proc.numChannels as number); ch++) {
          if (sideOf(ch) === sideOf(0)) expect += voices[ch][i];
        }
        if (Math.abs(out[0][sideOf(0)][i] - expect) > 1e-6) mainLeak++;
      }
    }
    expect(dubHeard).toBeGreaterThan(1000);
    expect(dubMatched).toBe(750 * 128);
    expect(slotHeard).toBeGreaterThan(1000);
    expect(mainLeak).toBe(0);
  });
});
