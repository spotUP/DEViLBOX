/**
 * ownRender.ts - render a song through OUR engine for a dual row, headless: the engine's real worklet and WASM in-process
 * (src/engine/__tests__/workletHarness.ts), the same way the engine tests drive them (engineChannelStreams.test.ts).
 * The output is the engine's main stereo output, which the batch compares with UADE's render by the same metric as nuade.
 *
 * Only engines whose worklet takes the shared load protocol (or one of the two small variants below) are listed. A dual
 * row without an entry has no headless render of its own engine (the TypeScript scheduler, a companion-file loader, an
 * engine driven through another worklet); the batch records that as the reason and the DN-1 rule keeps ours as default.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs } from '../../src/engine/__tests__/workletHarness';
import { levelOf, sha1, ROOT, companionsOf } from './nuadeCompare';
import { NUADE_FORMATS } from '../../src/engine/nuade/nuadeFormats';
import { EAGLE_PLAYER_FORMATS, eaglePlayerModuleName, type EaglePlayerFormat } from '../../src/engine/eagleplayer/eaglePlayerFormats';

interface OwnEngine { dir: string; stem: string; wasmStem?: string; load?: 'tune' | 'tfmx' | 'musicmaker' | 'suntronic' | 'eagle' }

const EAGLE: OwnEngine = { dir: 'eagleplayer', stem: 'EaglePlayer', load: 'eagle' };

/** Dual row id -> the worklet that plays it. */
export const OWN_ENGINES: Readonly<Record<string, OwnEngine>> = {
  actionamics: { dir: 'actionamics', stem: 'Actionamics' },
  activisionpro: { dir: 'activisionpro', stem: 'ActivisionPro' },
  bendaglish: { dir: 'bd', stem: 'Bd' },
  davidwhittaker: { dir: 'davidwhittaker', stem: 'DavidWhittaker' },
  deltamusic1: { dir: 'deltamusic1', stem: 'DeltaMusic1' },
  deltamusic2: { dir: 'deltamusic2', stem: 'DeltaMusic2' },
  digmug: { dir: 'digmug', stem: 'DigMug' },
  dss: { dir: 'dss', stem: 'Dss' },
  facethemusic: { dir: 'facethemusic', stem: 'FaceTheMusic' },
  fred_np: { dir: 'fred-replayer', stem: 'FredReplayer' },
  musicmaker: { dir: 'musicmaker', stem: 'MusicMaker', load: 'musicmaker' },
  // SUN-Tronic: the byte-exact player + Paula render core the browser engine pumps (no worklet, no WASM), 44.1 kHz.
  suntronic: { dir: 'suntronic', stem: 'SunTronicResampler', load: 'suntronic' },
  // The seven EaglePlayer rows: UADE's own eagleplayer on the Musashi host (EaglePlayerEngine), the player picked by the song's name.
  andersoland: EAGLE, beathoven: EAGLE, bendaglishsid: EAGLE, coredesign: EAGLE, davelowe: EAGLE, scottjohnston: EAGLE, wallybeben: EAGLE,
  futurecomposer: { dir: 'futurecomposer', stem: 'FutureComposer' },
  gmc: { dir: 'gmc', stem: 'Gmc' },
  instereo1: { dir: 'instereo1', stem: 'InStereo1' },
  instereo2: { dir: 'instereo2', stem: 'InStereo2' },
  // Jochen Hippel's formats are decoded by libtfmxaudiodecoder inside the TFMX worklet (wasmEngineRegistry 'Hippel').
  hippel: { dir: 'tfmx', stem: 'TFMX', load: 'tfmx' },
  hippel7v: { dir: 'tfmx', stem: 'TFMX', load: 'tfmx' },
  hippelhip: { dir: 'tfmx', stem: 'TFMX', load: 'tfmx' },
  jamcracker: { dir: 'jamcracker', stem: 'JamCracker', load: 'tune' },
  musicassembler: { dir: 'ma', stem: 'Ma' },
  oktalyzer: { dir: 'oktalyzer', stem: 'Oktalyzer' },
  pumatracker: { dir: 'pumatracker', stem: 'PumaTracker', wasmStem: 'Pumatracker' },
  quadracomposer: { dir: 'quadracomposer', stem: 'QuadraComposer' },
  ronklaren: { dir: 'ronklaren', stem: 'RonKlaren' },
  sidmon2: { dir: 'sidmon2', stem: 'Sd2' },
  soundcontrol: { dir: 'soundcontrol', stem: 'SoundControl' },
  soundfx: { dir: 'soundfx', stem: 'SoundFx' },
  soundfactory: { dir: 'soundfactory', stem: 'SoundFactory2' },
  soundmon: { dir: 'soundmon', stem: 'SoundMon' },
  sonicarranger: { dir: 'sonic-arranger', stem: 'SonicArranger' },
  synthesis: { dir: 'synthesis', stem: 'Synthesis' },
};

export interface OwnRender { samples: Float32Array; peak: number; rms: number; error?: string }

/** Linear resample of interleaved stereo to 48 kHz (the comparison's rate); the 20 ms envelopes do not care about the kernel. */
function to48k(x: Float32Array, rate: number, seconds: number): Float32Array {
  if (rate === 48000) return x;
  const frames = 48000 * seconds, out = new Float32Array(frames * 2), n = x.length / 2;
  for (let f = 0; f < frames; f++) {
    const pos = (f * rate) / 48000, i = Math.floor(pos), t = pos - i;
    const a = Math.min(i, n - 1), b = Math.min(i + 1, n - 1);
    for (let c = 0; c < 2; c++) out[2 * f + c] = x[2 * a + c]! * (1 - t) + x[2 * b + c]! * t;
  }
  return out;
}

/** MusicMaker: the song as the app imports it (companions beside the file), the module its engine builds, the worklet (no WASM). */
async function renderMusicMaker(songPath: string, seconds: number): Promise<OwnRender> {
  const { musicMakerWorkletModule, parseMusicMakerSongFile } = await import('../../src/lib/import/formats/MusicMakerParser');
  const { readdirSync } = await import('node:fs');
  const dir = join(ROOT, songPath.slice(0, songPath.lastIndexOf('/'))), name = songPath.slice(songPath.lastIndexOf('/') + 1);
  const bytes = new Uint8Array(readFileSync(join(ROOT, songPath)));
  let data: ArrayBuffer | undefined;
  if (String.fromCharCode(...bytes.subarray(0, 4)) === 'FORM') {
    data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; // an .mm4 / .mm8 is the IFF the engine takes
  } else {
    // <tune>.sdata + <tune>.ip: the instruments ride beside the song, as the import route hands them over.
    const companions = new Map<string, ArrayBuffer>();
    for (const f of readdirSync(dir)) {
      if (f.toLowerCase().startsWith(name.replace(/\.sdata$/i, '').toLowerCase() + '.')) {
        const b = readFileSync(join(dir, f));
        companions.set(f, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      }
    }
    data = (parseMusicMakerSongFile(bytes, name, companions) as unknown as { musicMakerFileData?: ArrayBuffer }).musicMakerFileData;
  }
  if (!data) return { samples: new Float32Array(0), peak: 0, rms: 0, error: 'no MusicMaker module for this song' };
  let Processor!: new () => { handleMessage(d: unknown): Promise<void>; process(i: Float32Array[][], o: Float32Array[][]): boolean };
  const posted: { type?: string; message?: string }[] = [];
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: { type?: string }) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: typeof Processor) => { Processor = cls; },
    sampleRate: 48000, currentTime: 0,
  };
  new Function(...Object.keys(scope), readFileSync(join(ROOT, 'public/musicmaker/MusicMaker.worklet.js'), 'utf8'))(...Object.values(scope));
  const proc = new Processor();
  await proc.handleMessage({ type: 'init', sampleRate: 48000 });
  await proc.handleMessage({ type: 'loadModule', module: musicMakerWorkletModule(data) });
  await proc.handleMessage({ type: 'play' });
  const frames = 48000 * seconds, out = new Float32Array(frames * 2), L = new Float32Array(128), R = new Float32Array(128);
  for (let f = 0; f < frames; f += 128) {
    proc.process([], [[L, R]]);
    for (let i = 0; i < Math.min(128, frames - f); i++) { out[2 * (f + i)] = L[i]!; out[2 * (f + i) + 1] = R[i]!; }
  }
  const err = posted.find((m) => m.type === 'error');
  return { samples: out, ...levelOf(out), ...(err ? { error: String(err.message) } : {}) };
}

/** SUN-Tronic: the module's score through the same Paula render core the browser engine pumps. Companion PCM sits beside the file. */
async function renderSunTronic(songPath: string, seconds: number): Promise<OwnRender> {
  const { parseSunTronicV13Score } = await import('../../src/lib/import/formats/SunTronicV13');
  const { renderSunTronicMix, NATIVE_SAMPLE_RATE } = await import('../../src/engine/suntronic/SunTronicNativeRender');
  const { readdirSync } = await import('node:fs');
  const dir = join(ROOT, songPath.slice(0, songPath.lastIndexOf('/')));
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(ROOT, songPath))));
  const have = readdirSync(dir);
  const slotPcm = score.instrumentNames.map((n) => {
    const hit = have.find((f) => f.toLowerCase() === n.toLowerCase());
    return hit ? new Int8Array(readFileSync(join(dir, hit))) : null;
  });
  const mix = renderSunTronicMix(score, slotPcm, { seconds });
  const inter = new Float32Array(mix.left.length * 2);
  for (let i = 0; i < mix.left.length; i++) { inter[2 * i] = mix.left[i]!; inter[2 * i + 1] = mix.right[i]!; }
  const samples = to48k(inter, NATIVE_SAMPLE_RATE, seconds);
  return { samples, ...levelOf(samples) };
}

/** The EaglePlayer entry that plays this file: the one whose prefix is the name's prefix or extension. */
function eagleFormatFor(songPath: string): EaglePlayerFormat | null {
  const name = songPath.slice(songPath.lastIndexOf('/') + 1).toLowerCase();
  const tags = [name.slice(0, name.indexOf('.')), name.slice(name.lastIndexOf('.') + 1)];
  return Object.values(EAGLE_PLAYER_FORMATS).find((f) => f.prefixes.some((p) => tags.includes(p))) ?? null;
}

/** EaglePlayer: the module, its eagleplayer binary and the companions, as the engine loads them (EaglePlayerEngine.loadTune). */
async function renderEagle(rowId: string, songPath: string, seconds: number): Promise<OwnRender> {
  const fmt = eagleFormatFor(songPath);
  if (!fmt) return { samples: new Float32Array(0), peak: 0, rms: 0, error: `no EaglePlayer entry plays ${songPath}` };
  loadSharedWorkletScripts();
  const { proc, send, posted } = await startWorklet('eagleplayer', 'EaglePlayer');
  const bytes = songBuffer;
  const row = NUADE_FORMATS[rowId]!;
  await send({
    type: 'loadModule', moduleData: bytes(songPath), playerData: bytes(`public/eagleplayer/players/${fmt.player}`), moduleName: eaglePlayerModuleName(fmt, songPath.slice(songPath.lastIndexOf('/') + 1)),
    files: companionsOf(row, songPath).map((c) => ({ name: c.name, data: c.data.buffer.slice(c.data.byteOffset, c.data.byteOffset + c.data.byteLength) })),
  });
  await send({ type: 'play' });
  const frames = 48000 * seconds, out = new Float32Array(frames * 2);
  for (let f = 0; f < frames; f += 128) {
    const outputs = stereoOutputs(5); // the worklet writes the main mix to output 0 and the voices to the others
    proc.process([], outputs);
    const [L, R] = outputs[0]!;
    const n = Math.min(128, frames - f);
    for (let i = 0; i < n; i++) { out[2 * (f + i)] = L![i]!; out[2 * (f + i) + 1] = R![i]!; }
  }
  const err = posted.find((m) => m.type === 'error');
  return { samples: out, ...levelOf(out), ...(err ? { error: String(err.message) } : {}) };
}

/** Render `seconds` of the module with the row's own engine; an error is returned, never thrown. */
export async function renderOwn(rowId: string, songPath: string, seconds: number): Promise<OwnRender | null> {
  const e = OWN_ENGINES[rowId];
  if (!e) return null;
  const empty = { samples: new Float32Array(0), peak: 0, rms: 0 };
  try {
    if (e.load === 'musicmaker') return await renderMusicMaker(songPath, seconds);
    if (e.load === 'suntronic') return await renderSunTronic(songPath, seconds);
    if (e.load === 'eagle') return await renderEagle(rowId, songPath, seconds);
    loadSharedWorkletScripts();
    const transform = e.load === 'tfmx' ? (await import('../../src/engine/tfmx/TFMXEngine')).tfmxTransform : rowId === 'soundfx' ? (await import('../../src/engine/soundfx/soundfxTransform')).soundfxTransform : undefined;
    const { proc, send, posted } = await startWorklet(e.dir, e.stem, transform, e.wasmStem ?? e.stem);
    const module = songBuffer(songPath);
    if (e.load === 'tfmx') { await send({ type: 'loadModule', mdatBuffer: module, smplBuffer: null, subsong: 0 }); await send({ type: 'modulePlay' }); }
    else { await send(e.load === 'tune' ? { type: 'loadTune', buffer: module } : { type: 'loadModule', moduleData: module }); await send({ type: 'play' }); }
    const frames = 48000 * seconds, out = new Float32Array(frames * 2);
    const L = new Float32Array(128), R = new Float32Array(128);
    for (let f = 0; f < frames; f += 128) {
      proc.process([], [[L, R]]);
      const n = Math.min(128, frames - f);
      for (let i = 0; i < n; i++) { out[2 * (f + i)] = L[i]!; out[2 * (f + i) + 1] = R[i]!; }
    }
    const err = posted.find((m) => m.type === 'error');
    return { samples: out, ...levelOf(out), ...(err ? { error: String(err.message) } : {}) };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Identity of the own-engine side of a measurement: its WASM and worklet bytes, or 'noown' (a row's sha changes when either does). */
export function ownSha(rowId: string): string {
  const e = OWN_ENGINES[rowId];
  if (!e) return 'noown';
  const read = (f: string) => new Uint8Array(readFileSync(join(ROOT, 'public', e.dir, f)));
  // No WASM: the engine is its worklet / render core (the core's source is part of the identity through the app build).
  if (e.load === 'musicmaker') return sha1(read('MusicMaker.worklet.js'));
  if (e.load === 'suntronic') return sha1(new Uint8Array(readFileSync(join(ROOT, 'src/engine/suntronic/SunTronicNativeRender.ts'))));
  return sha1(read(`${e.wasmStem ?? e.stem}.wasm`)) + sha1(read(`${e.stem}.worklet.js`));
}
