// @vitest-environment node
/**
 * Per-channel oscilloscope capture drove one module instance and toggled its
 * channel mutes every render quantum. libopenmpt applies a mute at the next
 * tick, so each "solo" capture still carried the neighbouring channels
 * (silent channels peaked at 0.09 on ~35% of captures).
 *
 * Real worklet + real libopenmpt wasm, driven through process() exactly as the
 * audio thread does, on the Chuck Biscuits jukebox file chiptracker.cba.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Proc = {
  port: { postMessage: (m: { cmd: string; channels?: Int16Array[] }) => void };
  process: (i: unknown[], o: Float32Array[][], p: unknown) => boolean;
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  oscModule: unknown;
};

const SR = 48000;

async function capture(): Promise<{ peaks: number[]; mainPeak: number; frames: number }> {
  const g = globalThis as Record<string, unknown>;
  const sent: { cmd: string; channels?: Int16Array[] }[] = [];
  let Ctor!: new (o: unknown) => Proc;
  g.AudioWorkletProcessor = class { port = { postMessage: (m: unknown) => { sent.push(m as never); }, onmessage: null }; };
  g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
  g.sampleRate = SR;
  g.currentTime = 0;
  const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
  await import(/* @vite-ignore */ workletPath);

  const p = new Ctor({});
  const file = readFileSync(join(process.cwd(), 'public/data/songs/formats/chiptracker.cba'));
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  // libopenmpt wasm instantiates asynchronously
  for (let i = 0; i < 100; i++) {
    try { p.handleMessage_({ data: { cmd: 'play', val: buf } }); } catch { /* wasm not up yet */ }
    if ((p as unknown as { modulePtr: number }).modulePtr) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  p.handleMessage_({ data: { cmd: 'enableOsc' } });

  const outs = (): Float32Array[][] => [[new Float32Array(128), new Float32Array(128)]];
  let mainPeak = 0;
  const QUANTA = Math.floor(SR * 6 / 128);
  for (let q = 0; q < QUANTA; q++) {
    g.currentTime = (q * 128) / SR;
    const o = outs();
    p.process([], o, {});
    for (const v of o[0][0]) mainPeak = Math.max(mainPeak, Math.abs(v));
  }
  const last = [...sent].reverse().find((m) => m.cmd === 'oscData');
  const all = sent.filter((m) => m.cmd === 'oscData');
  const n = last?.channels?.length ?? 0;
  const peaks = new Array<number>(n).fill(0);
  for (const m of all) {
    m.channels!.forEach((c, i) => { for (const s of c) peaks[i] = Math.max(peaks[i], Math.abs(s) / 32768); });
  }
  return { peaks, mainPeak, frames: all.length };
}

describe('per-channel oscilloscope capture', () => {
  it('a silent channel captures exactly zero while the playing channels do not (chiptracker.cba)', async () => {
    const { peaks, mainPeak, frames } = await capture();
    expect(frames).toBeGreaterThan(10);
    expect(mainPeak, 'audible output must still play').toBeGreaterThan(0.05);
    expect(peaks.length).toBeGreaterThanOrEqual(4);
    expect(peaks[0]).toBeGreaterThan(0.01);
    expect(peaks[1]).toBeGreaterThan(0.01);
    expect(peaks[2]).toBe(0);
    expect(peaks[3]).toBe(0);
  }, 60000);
});
