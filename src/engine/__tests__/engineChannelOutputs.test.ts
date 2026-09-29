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

const S = 'public/data/songs';
/** [asset dir, stem, song, voice side: 'pans' reads the worklet's pans, 'lrrl' is Amiga 0,3 left / 1,2 right]. */
const ENGINES: Array<[string, string, string, 'pans' | 'lrrl']> = [
  ['oktalyzer', 'Oktalyzer', `${S}/oktalyzer/les granges brulees.okta`, 'pans'],
  ['davidwhittaker', 'DavidWhittaker', `${S}/formats/apb.dw`, 'lrrl'],
  ['soundmon', 'SoundMon', `${S}/bp-soundmon-2/nicktune1.bp`, 'lrrl'],
  ['sonic-arranger', 'SonicArranger', `${S}/sonic-arranger/mega end.sa`, 'lrrl'],
  ['deltamusic1', 'DeltaMusic1', `${S}/formats/crusaders1.dm`, 'lrrl'],
  ['deltamusic2', 'DeltaMusic2', `${S}/formats/anthrox_intro.dm2`, 'lrrl'],
  ['gmc', 'Gmc', `${S}/formats/knights_of_sky.gmc`, 'lrrl'],
  ['facethemusic', 'FaceTheMusic', `${S}/formats/staticoscillations.ftm`, 'lrrl'],
  ['dss', 'Dss', `${S}/formats/doxtro3.dss`, 'lrrl'],
  ['futurecomposer', 'FutureComposer', `${S}/formats/anthrox.fc`, 'lrrl'],
  ['ronklaren', 'RonKlaren', `${S}/formats/astra_2.rk`, 'lrrl'],
  ['synthesis', 'Synthesis', `${S}/formats/space_sound.syn`, 'lrrl'],
  ['instereo1', 'InStereo1', `${S}/formats/fantasi8.is`, 'lrrl'],
  ['instereo2', 'InStereo2', `${S}/formats/stereo_feeling.is20`, 'lrrl'],
  ['activisionpro', 'ActivisionPro', `${S}/formats/gettysburg.avp`, 'lrrl'],
  ['voodoo', 'Voodoo', `${S}/voodoo/voo8.vss`, 'lrrl'],
  ['actionamics', 'Actionamics', `${S}/actionamics/dynablaster.ast`, 'lrrl'],
  ['fred-replayer', 'FredReplayer', `${S}/formats/rebels.fred`, 'lrrl'],
  ['digmug', 'DigMug', `${S}/formats/flight.dmu`, 'lrrl'],
  ['soundfactory', 'SoundFactory2', `${S}/formats/goldrunner.psf`, 'lrrl'],
  ['soundcontrol', 'SoundControl', `${S}/formats/north_sea_inferno.sc`, 'lrrl'],
  ['quadracomposer', 'QuadraComposer', `${S}/formats/synth_corn.emod`, 'lrrl'],
];

describe('per-channel engine outputs', { timeout: 120000 }, () => {
  it.each(ENGINES)('%s: dub send = the voice, isolation slot takes it out of the mix', async (dir, stem, song, sides) => {
    const { proc, send } = await startWorklet(dir, stem);
    await send({ type: 'loadModule', moduleData: songBuffer(song) });
    await send({ type: 'play' });
    const sideOf = sides === 'pans'
      ? (ch: number) => ((proc.pans as number[])[ch] === 0 ? 0 : 1)
      : (ch: number) => (ch === 1 || ch === 2 ? 1 : 0);
    const nv = () => (sides === 'pans' ? (proc.numChannels as number) : 4);

    // Pre-roll: find the loudest voice to isolate (some songs leave voices silent).
    const energy = new Array(8).fill(0);
    for (let q = 0; q < 200; q++) {
      proc.process([], stereoOutputs(37));
      const v = proc.chBufs as Float32Array[];
      for (let ch = 0; ch < nv(); ch++) for (let i = 0; i < 128; i++) energy[ch] += v[ch][i] * v[ch][i];
    }
    const iso = energy.indexOf(Math.max(...energy));
    expect(energy[iso]).toBeGreaterThan(0);

    // Dub send on every voice (copies); isolate the loudest into slot 0.
    for (let ch = 0; ch < nv(); ch++) {
      await send({ cmd: 'dubChannelEnable', type: 'dubChannelEnable', val: { channel: ch }, channel: ch });
    }
    await send({ type: 'addIsolation', slotIndex: 0, channelMask: 1 << iso });

    let dubMismatch = 0, slotHeard = 0, mainLeak = 0;
    for (let q = 0; q < 500; q++) {
      const out = stereoOutputs(37);
      proc.process([], out);
      const voices = proc.chBufs as Float32Array[];
      for (let i = 0; i < 128; i++) {
        // Output 5+ch = dub send of channel ch: exactly the voice, both sides.
        for (let ch = 0; ch < nv(); ch++) {
          if (Math.abs(out[5 + ch][0][i] - voices[ch][i]) > 1e-7 || out[5 + ch][1][i] !== out[5 + ch][0][i]) dubMismatch++;
        }
        // Output 1 = slot 0: the isolated voice on its side.
        if (voices[iso][i] !== 0 && Math.abs(out[1][sideOf(iso)][i] - voices[iso][i]) < 1e-7) slotHeard++;
        // Main mix on that side: every other voice of the side, not the isolated one.
        let expected = 0;
        for (let ch = 0; ch < nv(); ch++) if (ch !== iso && sideOf(ch) === sideOf(iso)) expected += voices[ch][i];
        if (Math.abs(out[0][sideOf(iso)][i] - expected) > 1e-6) mainLeak++;
      }
    }
    expect(dubMismatch).toBe(0);
    expect(slotHeard).toBeGreaterThan(100);
    expect(mainLeak).toBe(0);
  });
});
