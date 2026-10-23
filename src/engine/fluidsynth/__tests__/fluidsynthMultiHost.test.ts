// @vitest-environment node
/**
 * SF3-3 / SF3-4: the multi-output FluidSynth bridge + worklet, real WASM.
 * Drives FluidSynth.worklet.js directly through its message port.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const PUBLIC = resolve(__dirname, '../../../../public/fluidsynth');
const G = 4; // groups used in the test (the app uses 64; same code path)

interface Processor {
  port: { postMessage(m: unknown): void; onmessage?: (e: { data: unknown }) => void };
  process(i: unknown[], o: Float32Array[][]): boolean;
}

let ProcessorClass!: new (o: object) => Processor;
const sent: Array<Record<string, unknown>> = [];

async function makeProcessor(multi: boolean): Promise<Processor> {
  const p = new ProcessorClass({});
  p.port.postMessage = (m) => sent.push(m as Record<string, unknown>);
  const wasm = readFileSync(resolve(PUBLIC, 'FluidSynth.wasm'));
  const js = readFileSync(resolve(PUBLIC, 'FluidSynth.js'), 'utf8');
  const sf2 = readFileSync(resolve(PUBLIC, 'default.sf2'));
  sent.length = 0;
  p.port.onmessage?.({ data: {
    type: 'init', sampleRate: 48000, jsCode: js,
    wasmBinary: new Uint8Array(wasm), multi, midiChannels: 16, audioGroups: G,
  } });
  for (let i = 0; i < 400 && !sent.some((m) => m.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 10));
  expect(sent.some((m) => m.type === 'ready')).toBe(true);
  p.port.onmessage?.({ data: { type: 'loadSF2', data: new Uint8Array(sf2), filename: 'default.sf2' } });
  for (let i = 0; i < 400 && !sent.some((m) => m.type === 'sf2Loaded'); i++) await new Promise((r) => setTimeout(r, 10));
  expect(sent.some((m) => m.type === 'sf2Loaded')).toBe(true);
  return p;
}

const post = (p: Processor, data: Record<string, unknown>) => p.port.onmessage?.({ data });

async function channelBank(p: Processor, channel: number): Promise<number> {
  sent.length = 0;
  post(p, { type: 'getChannelBank', channel });
  const m = sent.find((x) => x.type === 'channelBank');
  return m ? (m.bank as number) : -999;
}

function renderMulti(p: Processor, blocks: number): number[] {
  const energy = new Array(G + 1).fill(0);
  for (let b = 0; b < blocks; b++) {
    const outs = Array.from({ length: G + 1 }, () => [new Float32Array(128), new Float32Array(128)]);
    p.process([], outs);
    outs.forEach((o, i) => { for (const ch of o) for (const x of ch) energy[i] += x * x; });
  }
  return energy;
}

describe('FluidSynth multi-slot bridge + worklet (real WASM)', () => {
  beforeAll(async () => {
    const g = globalThis as Record<string, unknown>;
    g.sampleRate = 48000;
    g.currentTime = 0; // AudioWorkletGlobalScope global; the note queue stamps arrivals with it
    g.AudioWorkletProcessor = class { port: Processor['port'] = { postMessage(_m: unknown) {} }; };
    g.registerProcessor = (_n: string, c: new (o: object) => Processor) => { ProcessorClass = c; };
    // The worklet is an ES module (it imports the shared timed-event queue), as Chrome loads it.
    const path: string = '../../../../public/fluidsynth/FluidSynth.worklet.js';
    await import(/* @vite-ignore */ path);
  });

  it('program then bank 128 via setParam resolves a bank-128 preset', async () => {
    const p = await makeProcessor(true);
    post(p, { type: 'setChannelType', channel: 0, channelType: 1 });
    post(p, { type: 'setParam', id: 11, value: 0 });
    post(p, { type: 'setParam', id: 12, value: 128 });
    expect(await channelBank(p, 0)).toBe(128);
  }, 30000);

  it('a note on channel 3 sounds only in group 3 dry; others silent', async () => {
    const p = await makeProcessor(true);
    post(p, { type: 'programChange', channel: 3, program: 0 });
    post(p, { type: 'noteOn', channel: 3, key: 60, velocity: 100 });
    const e = renderMulti(p, 200);
    expect(e[3]).toBeGreaterThan(0.01);
    for (const g of [0, 1, 2]) expect(e[g]).toBe(0);
    expect(e[G]).toBeGreaterThan(0); // shared reverb/chorus return carries the wet signal
  }, 30000);

  it('setChannelType drum on channel 3 plays the drum bank (melodic channel falls elsewhere)', async () => {
    // GS bank-select (CC 0): a drum channel maps bank MSB 0 to the drum bank
    // (128), a melodic channel stays on bank 0.
    const melodic = await makeProcessor(true);
    post(melodic, { type: 'cc', channel: 3, ctrl: 0, val: 0 });
    post(melodic, { type: 'programChange', channel: 3, program: 0 });
    expect(await channelBank(melodic, 3)).toBe(0);

    const p = await makeProcessor(true);
    post(p, { type: 'setChannelType', channel: 3, channelType: 1 });
    post(p, { type: 'cc', channel: 3, ctrl: 0, val: 0 });
    post(p, { type: 'programChange', channel: 3, program: 0 });
    expect(await channelBank(p, 3)).toBe(128);
    post(p, { type: 'noteOn', channel: 3, key: 36, velocity: 110 });
    expect(renderMulti(p, 200)[3]).toBeGreaterThan(0.01);
  }, 30000);

  it('allNotesOff with a channel only silences that channel', async () => {
    const p = await makeProcessor(true);
    for (const ch of [1, 2]) {
      post(p, { type: 'programChange', channel: ch, program: 0 });
      post(p, { type: 'noteOn', channel: ch, key: 60, velocity: 100 });
    }
    post(p, { type: 'allSoundsOff', channel: 1 });
    renderMulti(p, 20);
    const e = renderMulti(p, 40);
    expect(e[1]).toBe(0);
    expect(e[2]).toBeGreaterThan(0.01);
  }, 30000);
});
