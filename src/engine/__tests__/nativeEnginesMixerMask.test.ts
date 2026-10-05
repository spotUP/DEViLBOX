/**
 * Mute and solo reach ten native engines. Their worklets stored the mixer's
 * `setMuteMask` and never applied it, so muting or soloing a channel did
 * nothing: ArtOfNoise, Bd, Ma, JamCracker, FuturePlayer, PumaTracker, Sd2,
 * SteveTurner, SidMon1Replayer and StartrekkerAM.
 *
 * The mixer's mask is bit N SET = channel N AUDIBLE. Each worklet now turns
 * the bit into the core's 1/0 channel gain (Bd, Ma and Sd2 map that gain onto
 * their C channel mask) and re-applies it after every module load, because a
 * fresh module starts with every channel on.
 *
 * Real worklet + real WASM + a corpus song wherever the repo has one;
 * SteveTurner, with no song in the repo, gets a recording stand-in core.
 * One wiring test per engine, driven through the worklet's own messages and
 * process(): a mask set BEFORE the load must survive it, all-audible must
 * play, and mask 0 must be silent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, startWorklet, songBuffer, stereoOutputs, type WorkletProc } from './workletHarness';

const ALL_AUDIBLE = 0xffffffff;
const BLOCKS = Number(process.env.MASK_BLOCKS ?? 300); // under a second at 128 frames per block

interface Corpus {
  name: string;
  dir: string;
  stem: string;
  song: string;
  /** Messages that load the song, then the ones that start playback. */
  load(buf: ArrayBuffer, companion: ArrayBuffer): object[];
  /** A companion file the format needs besides the main song. */
  companion?: string;
  /** Stem of the .js/.wasm pair when it differs from the worklet's. */
  wasmStem?: string;
  start?: object[];
}

const moduleData = (type: string) => (b: ArrayBuffer) => [{ type, moduleData: b }];

const corpus: Corpus[] = [
  { name: 'ArtOfNoise', dir: 'artofnoise', stem: 'ArtOfNoise', song: 'art-of-noise/inside.blipp.aon', load: moduleData('loadModule') },
  { name: 'Bd', dir: 'bd', stem: 'Bd', song: 'ben-daglish/motorhead-titleandingame.bd', load: moduleData('loadModule') },
  { name: 'Ma', dir: 'ma', stem: 'Ma', song: 'music-assembler/thanatos.ma', load: moduleData('loadModule') },
  { name: 'PumaTracker', dir: 'pumatracker', stem: 'PumaTracker', wasmStem: 'Pumatracker',
    song: 'pumatracker/liquid kids - lv1a.puma', load: moduleData('loadModule') },
  { name: 'Sd2', dir: 'sidmon2', stem: 'Sd2', song: 'sidmon-2/ice7-intro.sid2', load: moduleData('loadModule') },
  { name: 'SidMon1Replayer', dir: 'sidmon1', stem: 'SidMon1Replayer', song: 'sidmon-1/myfunnymazea.sid', load: moduleData('loadModule') },
  { name: 'JamCracker', dir: 'jamcracker', stem: 'JamCracker', song: 'jamcracker/freehand-spreadtro.jam',
    load: (b) => [{ type: 'loadTune', buffer: b }], start: [{ type: 'play' }] },
  { name: 'FuturePlayer', dir: 'futureplayer', stem: 'FuturePlayer', song: 'future-player/imploder drums.fp',
    load: (b) => [{ type: 'loadTune', buffer: b }], start: [{ type: 'play' }] },
  { name: 'StartrekkerAM', dir: 'startrekker-am', stem: 'StartrekkerAM', song: 'startrekker-am/amsyntdemo.mod',
    companion: 'startrekker-am/amsyntdemo.mod.nt',
    load: (b, nt) => [{ type: 'loadMod', data: b }, { type: 'loadNt', data: nt }] },
];

/** Blocks thrown away after a mask change: the ring-buffered engines drain
 *  about a thousand frames decoded before it, and Ma's output filter rings out. */
const SETTLE_BLOCKS = 80;
/** Summed |output| that counts as silence: Ma's filter leaves a ~6e-5 tail. */
const SILENT = 1e-3;

/** Total absolute output over BLOCKS process() calls, after the settle blocks. */
function energy(proc: WorkletProc): number {
  for (let i = 0; i < SETTLE_BLOCKS; i++) proc.process([], stereoOutputs(1));
  let sum = 0;
  for (let i = 0; i < BLOCKS; i++) {
    const out = stereoOutputs(1);
    proc.process([], out);
    for (const ch of out[0]) for (const v of ch) sum += Math.abs(v);
  }
  return sum;
}

describe('mixer mask reaches the native engines (bit set = audible)', () => {
  for (const c of corpus) {
    it(`${c.name}: mask set before the load survives it; all-audible plays; 0 is silent`, async () => {
      const { proc, send } = await startWorklet(c.dir, c.stem, undefined, c.wasmStem);
      await send({ type: 'setMuteMask', mask: 0 });                 // before any module exists
      const companion = c.companion ? songBuffer(`public/data/songs/${c.companion}`) : new ArrayBuffer(0);
      for (const m of c.load(songBuffer(`public/data/songs/${c.song}`), companion)) await send(m);
      for (const m of c.start ?? []) await send(m);
      expect(energy(proc), 'muted before load, still muted after').toBeLessThan(SILENT);

      await send({ type: 'setMuteMask', mask: ALL_AUDIBLE });
      expect(energy(proc), 'all-audible mask plays the song').toBeGreaterThan(1);

      await send({ type: 'setMuteMask', mask: 0 });
      expect(energy(proc), 'mask 0 silences every channel').toBeLessThan(SILENT);
    }, 60_000);
  }

  // SteveTurner has no song in the repo: a recording stand-in core proves the
  // worklet drives the gain export, including after a load.
  for (const [name, dir] of [['SteveTurner', 'steveturner']]) {
    it(`${name}: gain export follows the mask, and again after a load`, async () => {
      let Processor!: new () => WorkletProc;
      const scope: Record<string, unknown> = {
        AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
        registerProcessor: (_n: string, cls: new () => WorkletProc) => { Processor = cls; },
        sampleRate: 48000, currentTime: 0,
      };
      new Function(...Object.keys(scope), readFileSync(resolve(ROOT, `public/${dir}/${name}.worklet.js`), 'utf8'))(...Object.values(scope));
      const p = new Processor();
      const gain = new Map<number, number>();
      p.module = {
        _player_set_channel_gain: (ch: number, g: number) => gain.set(ch, g),
        // a fresh load puts every channel back on, as the real core does
        _player_load: () => { for (let ch = 0; ch < 4; ch++) gain.set(ch, 1); return 1; },
        _malloc: () => 8, _free: () => {}, HEAPU8: new Uint8Array(64),
      };
      p.initialized = true;
      const send = (m: object) => (p.handleMessage as (d: unknown) => Promise<void>).call(p, m);
      const audible = () => [0, 1, 2, 3].map((ch) => gain.get(ch));

      await send({ type: 'setMuteMask', mask: ALL_AUDIBLE });
      expect(audible()).toEqual([1, 1, 1, 1]);
      await send({ type: 'setMuteMask', mask: 0 });
      expect(audible()).toEqual([0, 0, 0, 0]);
      await send({ type: 'setMuteMask', mask: 0b0101 });            // channels 0 and 2 audible
      expect(audible()).toEqual([1, 0, 1, 0]);
      await send({ type: 'loadModule', moduleData: new ArrayBuffer(16) });
      expect(audible()).toEqual([1, 0, 1, 0]);                       // survived the load
    });
  }
});
