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
import { loadSharedWorkletScripts, startWorklet, songBuffer } from '../../src/engine/__tests__/workletHarness';
import { levelOf, sha1, ROOT } from './nuadeCompare';

interface OwnEngine { dir: string; stem: string; wasmStem?: string; load?: 'tune' }

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
  futurecomposer: { dir: 'futurecomposer', stem: 'FutureComposer' },
  gmc: { dir: 'gmc', stem: 'Gmc' },
  instereo1: { dir: 'instereo1', stem: 'InStereo1' },
  instereo2: { dir: 'instereo2', stem: 'InStereo2' },
  jamcracker: { dir: 'jamcracker', stem: 'JamCracker', load: 'tune' },
  musicassembler: { dir: 'ma', stem: 'Ma' },
  oktalyzer: { dir: 'oktalyzer', stem: 'Oktalyzer' },
  pumatracker: { dir: 'pumatracker', stem: 'PumaTracker', wasmStem: 'Pumatracker' },
  quadracomposer: { dir: 'quadracomposer', stem: 'QuadraComposer' },
  ronklaren: { dir: 'ronklaren', stem: 'RonKlaren' },
  sidmon2: { dir: 'sidmon2', stem: 'Sd2' },
  soundcontrol: { dir: 'soundcontrol', stem: 'SoundControl' },
  soundfactory: { dir: 'soundfactory', stem: 'SoundFactory2' },
  soundmon: { dir: 'soundmon', stem: 'SoundMon' },
  sonicarranger: { dir: 'sonic-arranger', stem: 'SonicArranger' },
  synthesis: { dir: 'synthesis', stem: 'Synthesis' },
};

export interface OwnRender { samples: Float32Array; peak: number; rms: number; error?: string }

/** Render `seconds` of the module with the row's own engine; an error is returned, never thrown. */
export async function renderOwn(rowId: string, songPath: string, seconds: number): Promise<OwnRender | null> {
  const e = OWN_ENGINES[rowId];
  if (!e) return null;
  const empty = { samples: new Float32Array(0), peak: 0, rms: 0 };
  try {
    loadSharedWorkletScripts();
    const { proc, send, posted } = await startWorklet(e.dir, e.stem, undefined, e.wasmStem ?? e.stem);
    const module = songBuffer(songPath);
    await send(e.load === 'tune' ? { type: 'loadTune', buffer: module } : { type: 'loadModule', moduleData: module });
    await send({ type: 'play' });
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
  return sha1(read(`${e.wasmStem ?? e.stem}.wasm`)) + sha1(read(`${e.stem}.worklet.js`));
}
