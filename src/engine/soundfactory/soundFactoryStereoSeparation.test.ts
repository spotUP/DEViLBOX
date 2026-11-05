/**
 * Sound Factory renders four hard-panned Paula voices (0,3 left; 1,2 right) in its own worklet and is
 * routed directly, so the app's stereo separation must reach the worklet: 0% collapses to mono, 100% keeps
 * the Amiga L/R split (goldrunner.psf drives the real WASM core).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../..');

async function loadModule(): Promise<any> {
  const src = readFileSync(resolve(ROOT, 'public/soundfactory/SoundFactory2.js'), 'utf8');
  const factory = new Function('self', `${src}\n;return createSoundFactory;`)({ location: { href: 'file:///sf/' } });
  return factory({ wasmBinary: readFileSync(resolve(ROOT, 'public/soundfactory/SoundFactory2.wasm')) });
}

function loadProcessor(): any {
  const src = readFileSync(resolve(ROOT, 'public/soundfactory/SoundFactory2.worklet.js'), 'utf8');
  let Ctor: any;
  const g = globalThis as any;
  g.AudioWorkletProcessor = class { port = { onmessage: null, postMessage() {} }; };
  g.sampleRate = 44100;
  g.registerProcessor = (_n: string, c: any) => { Ctor = c; };
  new Function(src)();
  return new Ctor();
}

function render(sep: number | null, frames: number) {
  return loadModule().then((m) => {
    const file = new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/formats/goldrunner.psf')));
    const data = m._malloc(file.length);
    m.HEAPU8.set(file, data);
    const handle = m._sf_create(data, file.length, 44100);
    m._sf_select_subsong(handle, 0);
    const p = loadProcessor();
    p.module = m; p.handle = handle; p.initialized = true; p.playing = true; p.bufferSize = frames;
    p.chPtrs = [0, 1, 2, 3].map(() => m._malloc(frames * 4));
    p.interleavedPtr = m._malloc(frames * 8);
    if (sep !== null) p.handleMessage({ type: 'setStereoSeparation', value: sep });
    const L = new Float32Array(frames), R = new Float32Array(frames);
    let sideEnergy = 0, midEnergy = 0;
    for (let b = 0; b < 400; b++) {
      p.process([], [[L, R]]);
      for (let i = 0; i < frames; i++) { sideEnergy += (L[i] - R[i]) ** 2; midEnergy += (L[i] + R[i]) ** 2; }
    }
    return { sideEnergy, midEnergy };
  });
}

describe('Sound Factory stereo separation', () => {
  it('collapses to mono at 0% and keeps the Amiga split at 100%', async () => {
    const full = await render(100, 128);
    const mono = await render(0, 128);
    expect(full.sideEnergy).toBeGreaterThan(0);
    expect(mono.sideEnergy).toBeLessThan(full.sideEnergy * 1e-6);
    expect(mono.midEnergy).toBeGreaterThan(0);
  });
});
