/**
 * SunTronic per-voice dub sends (plan 2026-09-29-per-channel-dub-outputs, P4).
 *
 * SunTronic renders on the main thread and posts finished chunks to a
 * resampler worklet, so a dub send on one channel had only the whole mix to
 * take ("throw channel 2" threw everything). The engine now posts each Paula
 * voice with the chunk and the worklet resamples it into dub output 5 + ch.
 *
 * This drives the real resampler worklet with chunks from the real renderer
 * (analgestic2) and checks each send is its voice at its level in the mix:
 * left = send0 + send3, right = send1 + send2.
 *
 * Fails on revert: without the voices in the chunk (or without the worklet
 * writing them), every send stays silent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer } from '../SunTronicNativeRender';
import { ROOT, loadSharedWorkletScripts, stereoOutputs } from '@engine/__tests__/workletHarness';

const CORPUS = join(ROOT, 'public/data/songs/formats/SUNTronicTunes');
const CHUNK = 2048;

type Proc = { port: { onmessage: ((e: { data: unknown }) => void) | null }; process(i: Float32Array[][], o: Float32Array[][]): boolean };

function startResampler(): Proc {
  loadSharedWorkletScripts();
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 48000,
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/suntronic/SunTronicResampler.worklet.js'), 'utf8'))(...Object.values(scope));
  return new Processor();
}

describe('SunTronic per-voice dub sends', () => {
  it('each dub output is its Paula voice: left = send0 + send3, right = send1 + send2', () => {
    const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, 'analgestic2.src'))));
    const slotPcm = score.instrumentNames.map((n) => {
      try { return new Int8Array(readFileSync(join(CORPUS, 'instr', n))); } catch { return null; }
    });
    const renderer = new SunTronicNativeRenderer(score, slotPcm);
    const proc = startResampler();
    const send = (data: unknown) => proc.port.onmessage!({ data });

    send({ type: 'init' });
    for (let ch = 0; ch < 4; ch++) send({ type: 'dubChannelEnable', cmd: 'dubChannelEnable', val: { channel: ch }, channel: ch });
    // 30 chunks (61440 samples) stay inside the worklet's 65536-sample voice
    // ring; the engine itself queues only ~350 ms ahead.
    for (let c = 0; c < 30; c++) {
      const left = new Float32Array(CHUNK), right = new Float32Array(CHUNK);
      const voices = [0, 1, 2, 3].map(() => new Float32Array(CHUNK));
      renderer.renderInto(left, right, { ch: voices as [Float32Array, Float32Array, Float32Array, Float32Array] });
      send({ type: 'chunk', left, right, voices });
    }
    send({ type: 'play' });

    // 30 chunks at 44100 cover ~1.39 s; read 1.2 s of it at 48000.
    let heard = 0, worst = 0;
    const heardPerVoice = [0, 0, 0, 0];
    for (let q = 0; q < 450; q++) {
      const out = stereoOutputs(37);
      proc.process([], out);
      for (let i = 0; i < 128; i++) {
        const s = [0, 1, 2, 3].map((ch) => out[5 + ch][0][i]);
        s.forEach((v, ch) => { if (v !== 0) heardPerVoice[ch]++; });
        worst = Math.max(worst, Math.abs(out[0][0][i] - (s[0] + s[3])), Math.abs(out[0][1][i] - (s[1] + s[2])));
        if (s.some((v) => v !== 0)) heard++;
      }
    }
    expect(heard).toBeGreaterThan(10000);
    expect(heardPerVoice.filter((n) => n > 0).length).toBeGreaterThanOrEqual(2);
    expect(worst).toBeLessThan(1e-5);
  });
});
