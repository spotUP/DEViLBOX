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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const SONGS = 'public/data/songs';

/** [asset dir, file stem, song] — engines that load through WASMSingletonBase's shared protocol. */
const ENGINES: Array<[string, string, string]> = [
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
];

type Msg = { type?: string; channels?: Int16Array[]; frame?: number; sampleRate?: number; message?: string };
type Proc = { handleMessage(d: unknown): Promise<void>; process(i: Float32Array[][], o: Float32Array[][]): boolean };

beforeAll(() => {
  new Function(readFileSync(resolve(ROOT, 'public/worklets/channel-stream.js'), 'utf8'))();
});

async function run(dir: string, stem: string, song: string): Promise<Msg[]> {
  let Processor!: new () => Proc;
  const posted: Msg[] = [];
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: Msg) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 48000, currentTime: 0,
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, `public/${dir}/${stem}.worklet.js`), 'utf8'))(...Object.values(scope));
  const p = new Processor();
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try {
    await p.handleMessage({
      type: 'init', sampleRate: 48000,
      wasmBinary: readFileSync(resolve(ROOT, `public/${dir}/${stem}.wasm`)),
      jsCode: readFileSync(resolve(ROOT, `public/${dir}/${stem}.js`), 'utf8'),
    });
  } finally { Object.defineProperty(process, 'versions', versions); }
  const b = readFileSync(resolve(ROOT, song));
  await p.handleMessage({ type: 'loadModule', moduleData: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
  await p.handleMessage({ type: 'play' });
  for (let i = 0; i < 750; i++) p.process([], [[new Float32Array(128), new Float32Array(128)]]); // 2 s
  return posted;
}

describe('song engine voice streams', { timeout: 120000 }, () => {
  it.each(ENGINES)('%s streams every sample of its voices, unbroken', async (dir, stem, song) => {
    const posted = await run(dir, stem, song);
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
