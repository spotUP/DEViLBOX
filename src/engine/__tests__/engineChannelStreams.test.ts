/**
 * The song engines stream every sample of every voice, unbroken.
 *
 * The runtime channel classifiers (ChannelAudioClassifier, CED) read each
 * channel's recent audio from ChannelAudioTap, which only joins chunks whose
 * frame stamps follow on. Engines used to post 256-sample display snapshots
 * every 8 renders; glued together those read as clicks, and every channel of
 * a song classified as percussion. Each engine here now writes through the
 * shared worklets/channel-stream.js.
 *
 * Drives each engine's real worklet and WASM with a real song, headless.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { startWorklet, loadSharedWorkletScripts, songBuffer, type JsTransform, type WorkletMsg } from './workletHarness';

const SONGS = 'public/data/songs';

/**
 * [asset dir, file stem, song, messages that load and start it]. Most engines
 * share WASMSingletonBase's loadModule + play; the rest say how.
 */
type Load = (song: ArrayBuffer) => Array<Record<string, unknown>>;
const SHARED: Load = (song) => [{ type: 'loadModule', moduleData: song }, { type: 'play' }];
const ENGINES: Array<[string, string, string, Load?, JsTransform?]> = [
  ['davidwhittaker', 'DavidWhittaker', `${SONGS}/formats/apb.dw`],
  ['soundmon', 'SoundMon', `${SONGS}/bp-soundmon-2/nicktune1.bp`],
  ['sonic-arranger', 'SonicArranger', `${SONGS}/sonic-arranger/mega end.sa`],
  ['deltamusic1', 'DeltaMusic1', `${SONGS}/formats/crusaders1.dm`],
  ['deltamusic2', 'DeltaMusic2', `${SONGS}/formats/anthrox_intro.dm2`],
  ['gmc', 'Gmc', `${SONGS}/formats/knights_of_sky.gmc`],
  ['facethemusic', 'FaceTheMusic', `${SONGS}/formats/staticoscillations.ftm`],
  ['dss', 'Dss', `${SONGS}/formats/doxtro3.dss`],
  ['futurecomposer', 'FutureComposer', `${SONGS}/formats/anthrox.fc`],
  ['ronklaren', 'RonKlaren', `${SONGS}/formats/astra_2.rk`],
  ['synthesis', 'Synthesis', `${SONGS}/formats/space_sound.syn`],
  ['instereo1', 'InStereo1', `${SONGS}/formats/fantasi8.is`],
  ['instereo2', 'InStereo2', `${SONGS}/formats/stereo_feeling.is20`],
  ['activisionpro', 'ActivisionPro', `${SONGS}/formats/gettysburg.avp`],
  // Rendered nothing before 2026-09-28: the worklet called okt_render_multi
  // with 4 channel pointers, the C takes 8, so `frames` arrived as 0.
  ['oktalyzer', 'Oktalyzer', `${SONGS}/oktalyzer/les granges brulees.okta`],
  ['voodoo', 'Voodoo', `${SONGS}/voodoo/voo8.vss`],
  ['actionamics', 'Actionamics', `${SONGS}/actionamics/dynablaster.ast`],
  ['fred-replayer', 'FredReplayer', `${SONGS}/formats/rebels.fred`],
  // Refused before 2026-09-28: the loader turned away a module that ends exactly
  // with its arpeggio tables (its EOF test was pos >= size).
  ['digmug', 'DigMug', `${SONGS}/formats/flight.dmu`],
  ['digmug', 'DigMug', `${SONGS}/formats/cockwise.mug`],
  ['soundfactory', 'SoundFactory2', `${SONGS}/formats/goldrunner.psf`],
  ['soundcontrol', 'SoundControl', `${SONGS}/formats/north_sea_inferno.sc`],
  ['quadracomposer', 'QuadraComposer', `${SONGS}/formats/synth_corn.emod`],
  ['hively', 'Hively', `${SONGS}/ahx/amanda.ahx`,
    (song) => [{ type: 'loadTune', buffer: song, defStereo: 2 }, { type: 'play' }, { type: 'enableOsc' }],
    async (code) => (await import('../hively/HivelyEngine')).hivelyTransform(code)],
  ['uade', 'UADE', `${SONGS}/formats/prehistoric_tale.hipc`,
    (song) => [{ type: 'load', buffer: song, filenameHint: 'prehistoric_tale.hipc', skipScan: true }, { type: 'play' }, { type: 'enableOsc' }],
    async (code) => (await import('../uade/UADEEngine')).uadeTransform(code)],
];

beforeAll(loadSharedWorkletScripts);

async function run(dir: string, stem: string, song: string, load: Load = SHARED, transform?: JsTransform): Promise<WorkletMsg[]> {
  const { proc, send, posted } = await startWorklet(dir, stem, transform);
  for (const m of load(songBuffer(song))) await send(m);
  for (let i = 0; i < 750; i++) proc.process([], [[new Float32Array(128), new Float32Array(128)]]); // 2 s
  return posted;
}

describe('song engine voice streams', { timeout: 120000 }, () => {
  it.each(ENGINES)('%s streams every sample of its voices, unbroken', async (dir, stem, song, load, transform) => {
    const posted = await run(dir, stem, song, load, transform);
    expect(posted.filter((m) => m.type === 'error').map((m) => m.message)).toEqual([]);
    const osc = posted.filter((m) => m.type === 'oscData');
    // 2 s at 48 kHz in 1024-sample chunks.
    expect(osc.length).toBeGreaterThanOrEqual(90);
    expect(osc.every((m) => typeof m.frame === 'number' && m.sampleRate === 48000)).toBe(true);
    for (let i = 1; i < osc.length; i++) expect(osc[i].frame).toBe(osc[i - 1].frame! + osc[i - 1].channels![0].length);
    const heard = osc[0].channels!.map((_, ch) => osc.some((m) => m.channels![ch].some((x) => x !== 0)));
    expect(heard.some(Boolean), JSON.stringify(heard)).toBe(true);
  });
});
