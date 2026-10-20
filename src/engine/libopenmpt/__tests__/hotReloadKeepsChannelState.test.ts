// @vitest-environment node
/**
 * Every cell edit hot-reloads the module into the worklet. The reload ran the
 * new-song path, play(), which destroyed the oscilloscope instances, the
 * isolation slots and the dub slots, reset the user mute mask and announced
 * 'playReady'. Editing while the song played therefore unmuted the channels
 * the user had muted, froze the scopes and rebuilt every insert effect and
 * dub send on each keystroke.
 *
 * Real worklet + real libopenmpt wasm, driven through process() as the audio
 * thread does, on chiptracker.cba (four channels).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Sent = { cmd: string };
type Proc = {
  process: (i: unknown[], o: Float32Array[][], p: unknown) => boolean;
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  modulePtr: number;
  userMuteMask: number;
  isolationSlots: ({ channelMask: number } | null)[];
  dubSlots: (unknown | null)[];
  oscEnabled: boolean;
};

const SR = 48000;

describe('hot reload during playback', () => {
  it('keeps the mutes, scopes, isolation slots and dub slots, and does not announce a new song', async () => {
    const g = globalThis as Record<string, unknown>;
    const sent: Sent[] = [];
    let Ctor!: new (o: unknown) => Proc;
    g.AudioWorkletProcessor = class { port = { postMessage: (m: unknown) => { sent.push(m as Sent); }, onmessage: null }; };
    g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
    g.sampleRate = SR;
    g.currentTime = 0;
    const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
    await import(/* @vite-ignore */ workletPath);

    const p = new Ctor({});
    const file = readFileSync(join(process.cwd(), 'public/data/songs/formats/chiptracker.cba'));
    const buf = (): ArrayBuffer => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    for (let i = 0; i < 100; i++) {
      try { p.handleMessage_({ data: { cmd: 'play', val: buf() } }); } catch { /* wasm not up yet */ }
      if (p.modulePtr) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(p.modulePtr).toBeTruthy();

    const MUTED_CH0 = 0xFFFFFFFE;
    p.handleMessage_({ data: { cmd: 'enableOsc' } });
    p.handleMessage_({ data: { cmd: 'setMuteMask', val: MUTED_CH0 } });
    p.handleMessage_({ data: { cmd: 'addIsolation', val: { slotIndex: 0, channelMask: 0b10 } } });
    p.handleMessage_({ data: { cmd: 'dubChannelEnable', val: { channel: 2 } } });

    let q = 0;
    const run = (seconds: number): void => {
      const end = q + Math.floor((SR * seconds) / 128);
      for (; q < end; q++) {
        g.currentTime = (q * 128) / SR;
        const o: Float32Array[][] = Array.from({ length: 24 }, () => [new Float32Array(128), new Float32Array(128)]);
        p.process([], o, {});
      }
    };
    run(1);
    expect(p.isolationSlots[0]?.channelMask).toBe(0b10);
    expect(p.dubSlots[2]).toBeTruthy();

    const before = sent.length;
    p.handleMessage_({ data: { cmd: 'hotReload', val: buf() } });
    run(1);
    const after = sent.slice(before);

    expect(after.some((m) => m.cmd === 'playReady'), 'an edit is not a new song').toBe(false);
    expect(p.userMuteMask >>> 0, 'the user mute survives the edit').toBe(MUTED_CH0);
    expect(p.isolationSlots[0]?.channelMask, 'the insert-effect slot survives').toBe(0b10);
    expect(p.dubSlots[2], 'the dub send survives').toBeTruthy();
    expect(p.oscEnabled, 'the scopes survive').toBe(true);
    expect(after.filter((m) => m.cmd === 'oscData').length, 'the scopes keep drawing').toBeGreaterThan(5);
  }, 60000);
});
