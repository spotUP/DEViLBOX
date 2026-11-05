/**
 * Start-at-position on the direct-routed worklets (PLAY-FROM-POS-ALL phase B): a `seekFrames` message followed by `play`
 * makes the worklet render and discard frames up to the target (public/worklets/channel-outputs.js discardSeek), so the
 * first audible block after the seek is the block the song reaches there when played from the top.
 *
 * The real worklet source and the real WASM of two engines run under stubbed AudioWorklet globals (the same
 * handleMessage / process the browser calls). Sentinel: the seeked processor's first block equals the unseeked
 * processor's block at the target, and differs from the song's first block.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../..');
const BLOCK = 128;
const SCAN_BLOCKS = 1500;

interface Proc { handleMessage(d: unknown): Promise<void>; process(i: unknown, o: unknown): boolean; }

function loadWorklet(dir: string, file: string): new () => Proc {
  let captured: (new () => Proc) | null = null;
  const g = globalThis as Record<string, unknown>;
  g.AudioWorkletProcessor = class { port = { postMessage: (m: { type?: string; message?: string }) => { if (m?.type === 'error') throw new Error(String(m.message)); }, onmessage: null as unknown }; };
  g.sampleRate = 48000;
  g.currentTime = 0;
  g.registerProcessor = (_n: string, c: new () => Proc) => { captured = c; };
  (0, eval)(readFileSync(resolve(ROOT, 'public/worklets/channel-outputs.js'), 'utf8'));
  (0, eval)(readFileSync(resolve(ROOT, `public/${dir}/${file}.worklet.js`), 'utf8'));
  return captured!;
}

async function makeProc(dir: string, file: string, js: string, song: Uint8Array): Promise<Proc> {
  const P = loadWorklet(dir, file);
  const p = new P();
  const wasm = readFileSync(resolve(ROOT, `public/${dir}/${js}.wasm`));
  await p.handleMessage({
    type: 'init', sampleRate: 48000, wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    jsCode: readFileSync(resolve(ROOT, `public/${dir}/${js}.js`), 'utf8'),
  });
  await p.handleMessage({ type: 'loadModule', moduleData: song.buffer.slice(song.byteOffset, song.byteOffset + song.byteLength) });
  return p;
}

function block(p: Proc): Float32Array {
  const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
  p.process([[]], [[L, R]]);
  const out = new Float32Array(BLOCK * 2);
  out.set(L); out.set(R, BLOCK);
  return out;
}

const equal = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, i) => v === b[i]);

const CASES = [
  { name: 'DeltaMusic2', dir: 'deltamusic2', file: 'DeltaMusic2', js: 'DeltaMusic2', song: 'anthrox_intro.dm2' },
  { name: 'SoundFx', dir: 'soundfx', file: 'SoundFx', js: 'SoundFx', song: 'operation_stealth.sfx' },
];

describe('seekFrames then play on a real worklet', () => {
  for (const c of CASES) {
    it(`${c.name}: the first block after the seek is the song's block at the target`, async () => {
      const data = new Uint8Array(readFileSync(resolve(ROOT, `public/data/songs/formats/${c.song}`)));
      const ref = await makeProc(c.dir, c.file, c.js, data);
      await ref.handleMessage({ type: 'play' });
      const blocks: Float32Array[] = [];
      for (let i = 0; i < SCAN_BLOCKS; i++) blocks.push(block(ref));
      // The target: an audible block a good way in (a block 0 equal to it would prove nothing).
      const target = blocks.findIndex((b, i) => i >= 200 && b.some((v) => v !== 0) && !equal(b, blocks[0]));
      expect(target).toBeGreaterThan(0);

      const seeked = await makeProc(c.dir, c.file, c.js, data);
      await seeked.handleMessage({ type: 'seekFrames', frame: target * BLOCK });
      await seeked.handleMessage({ type: 'play' });
      const first = block(seeked);

      expect(equal(first, blocks[target])).toBe(true);
      expect(equal(first, blocks[0])).toBe(false);

      // The target is consumed: a second play starts from the top again.
      await seeked.handleMessage({ type: 'stop' });
      await seeked.handleMessage({ type: 'play' });
      expect(equal(block(seeked), blocks[0])).toBe(true);
    }, 60000);
  }
});
