/**
 * A Jochen Hippel CoSo song (.hipc) plays sound.
 *
 * The CoSo parser hands the module to the native engine route keyed on
 * hippelFileData. That route resolved to the Hippel WASM, which was a
 * transpile of UADE's player shell: its InitPlayer jumped through UADE
 * callbacks that do not exist outside UADE, so it rendered RMS 0 for every
 * Hippel song (prehistoric_tale.hipc, 2026-09-28). The decoder that does play
 * Hippel's formats, libtfmxaudiodecoder, was already built into the TFMX WASM.
 *
 * This drives the route the song takes: parse the real file, pick the engine
 * the router starts for it, and render that engine's worklet with the bytes
 * the router loads, after the mixer's channel mask.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
type Proc = {
  handleMessage(d: unknown): Promise<void>;
  process(i: Float32Array[][], o: Float32Array[][]): boolean;
};
let Processor: new () => Proc;
const posted: Array<{ type?: string }> = [];

beforeAll(() => {
  const src = readFileSync(resolve(ROOT, 'public/tfmx/TFMX.worklet.js'), 'utf8');
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: { type?: string }) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 44100,
    currentTime: 0,
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
});

describe('a Hippel CoSo song', { timeout: 60000 }, () => {
  it('routes to the TFMX decoder and renders sound', async () => {
    const file = readFileSync(resolve(ROOT, 'public/data/songs/formats/prehistoric_tale.hipc'));
    const { parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
    const song = await parseHippelCoSoFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'prehistoric_tale.hipc');

    const { WASM_ENGINES, shouldActivate } = await import('../replayer/NativeEngineRouting');
    const route = WASM_ENGINES.find((d) => shouldActivate(d, song))!;
    expect(route.key).toBe('Hippel');
    const { TFMXEngine } = await import('../tfmx/TFMXEngine');
    expect(await route.dynamicResolver!()).toBe(TFMXEngine);
    expect(route.getLoadArgs!(song)).toEqual([]);

    const p = new Processor();
    const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
    Object.defineProperty(process, 'versions', { value: {}, configurable: true });
    try {
      await p.handleMessage({
        type: 'init', sampleRate: 44100,
        wasmBinary: readFileSync(resolve(ROOT, 'public/tfmx/TFMX.wasm')),
        jsCode: readFileSync(resolve(ROOT, 'public/tfmx/TFMX.js'), 'utf8'),
      });
    } finally { Object.defineProperty(process, 'versions', versions); }
    await p.handleMessage({ type: 'loadModule', mdatBuffer: (song.hippelFileData as ArrayBuffer).slice(0), smplBuffer: null });
    expect(posted.find((m) => m.type === 'error'), JSON.stringify(posted)).toBeUndefined();
    // On load the mixer forwards its mask, bit N = 1 for an audible channel.
    // The engine translates it for the worklet; it once read the bits
    // inverted and muted all four voices of a song with none muted.
    const sent: Record<string, unknown>[] = [];
    TFMXEngine.prototype.setMuteMask.call({ sendMessage: (m: Record<string, unknown>) => sent.push(m) } as never, 0b1111);
    for (const m of sent) await p.handleMessage(m);
    await p.handleMessage({ type: 'modulePlay' });

    let acc = 0, cnt = 0;
    for (let b = 0; b < (44100 * 5) / 128; b++) {
      const l = new Float32Array(128), r = new Float32Array(128);
      p.process([], [[l, r]]);
      for (const v of l) acc += v * v;
      cnt += 128;
    }
    // Measured 0.017-0.024 per second for this song; the dead engine gave 0.
    expect(Math.sqrt(acc / cnt)).toBeGreaterThan(0.005);
  });
});
