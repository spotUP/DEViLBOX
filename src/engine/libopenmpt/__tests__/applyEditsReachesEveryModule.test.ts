// @vitest-environment node
/**
 * A cell edit made while a song plays is written into the running modules
 * (main, insert-effect isolation slots, dub slots, scope instances) instead of
 * rebuilding them. Rebuilding stalled the audio thread on every keystroke.
 *
 * Real worklet + real libopenmpt wasm, driven through process() as the audio
 * thread does, on chiptracker.cba. Cells are read back from each module with
 * the real libopenmpt reader. Fails on revert: without the applyEdits message
 * the worklet ignores it and every module keeps the original cell.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Sent = { cmd: string };
type Proc = {
  process: (i: unknown[], o: Float32Array[][], p: unknown) => boolean;
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  modulePtr: number;
  moduleBuffer: ArrayBuffer;
  isolationSlots: ({ modulePtr: number } | null)[];
  dubSlots: ({ modulePtr: number } | null)[];
  oscModules: { modulePtr: number }[] | null;
};
type Lib = { _openmpt_module_get_pattern_row_channel_command: (m: number, p: number, r: number, c: number, k: number) => number };

const SR = 48000;
const OP_CELL = 1;

describe('applyEdits message', () => {
  it('writes the cell into the main, isolation, dub and scope modules without a new song', async () => {
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

    p.handleMessage_({ data: { cmd: 'enableOsc' } });
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

    const mods: Record<string, number | undefined> = {
      main: p.modulePtr,
      isolation: p.isolationSlots[0]?.modulePtr,
      dub: p.dubSlots[2]?.modulePtr,
      scope: p.oscModules?.[0]?.modulePtr,
    };
    // The 2026-10-23 libopenmpt build leaves Module.wasmTable undefined, so
    // isolation and dub slots are refused ('no mute support'); they are
    // checked whenever the slot exists, the main module always (scopes need the same table).
    for (const name of ['main']) expect(mods[name], `${name} module exists`).toBeTruthy();
    for (const name of Object.keys(mods)) if (!mods[name]) delete mods[name];

    const lib = g.__libopenmpt as Lib;
    const note = (m: number): number => lib._openmpt_module_get_pattern_row_channel_command(m, 0, 5, 1, 0);
    const NOTE = 61;
    for (const ptr of Object.values(mods)) expect(note(ptr!)).not.toBe(NOTE);

    const before = sent.length;
    p.handleMessage_({ data: { cmd: 'applyEdits', val: Int32Array.from([OP_CELL, 0, 5, 1, NOTE, 3, 0, 0, 0, 0]) } });
    run(1);

    for (const [name, ptr] of Object.entries(mods)) expect(note(ptr!), `${name} holds the edit`).toBe(NOTE);
    expect(sent.slice(before).some((m) => m.cmd === 'playReady'), 'an edit is not a new song').toBe(false);

    const next = new Uint8Array([1, 2, 3, 4]).buffer;
    p.handleMessage_({ data: { cmd: 'updateBuffer', val: next } });
    expect(p.moduleBuffer.byteLength, 'updateBuffer replaces the cached song bytes').toBe(4);
    expect(p.modulePtr, 'updateBuffer keeps the running module').toBe(mods.main);
  }, 60000);
});
