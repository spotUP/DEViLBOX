/**
 * The dispatch worklet polls the WASM command log and posts it to the main
 * thread (automation capture, the furnace_cmd_log MCP tool). It never cleared
 * what it had read, so every poll copied and re-posted the whole log from the
 * start of playback — on the audio thread. Measured 2026-09-25: 1.15 million
 * posted entries in 30 s of a song with 2,460 distinct commands; past the log's
 * 500K cap nothing new was recorded at all.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Entry = [number, number, number, number, number, number];
interface Processor {
  module: unknown; wasm: unknown; port: { postMessage(m: unknown): void };
  drainCmdLog(): void;
}

let Processor: new () => Processor;

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../../../../public/furnace-dispatch/FurnaceDispatch.worklet.js'), 'utf8');
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_name: string, cls: new () => Processor) => { Processor = cls; },
    sampleRate: 48000,
    currentTime: 0,
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
});

/** A command log that behaves like FurnaceDispatchWrapper.cpp's. */
function fakeLog() {
  const log: Entry[] = [];
  const memory = new ArrayBuffer(1 << 20);
  let next = 64;
  const wasm = {
    cmdLogCount: () => log.length,
    cmdLogGet: () => {
      const ptr = next; next += log.length * 24 + 8;
      const h = new Int32Array(memory, ptr, log.length * 6);
      log.forEach((e, i) => h.set(e, i * 6));
      return ptr;
    },
    cmdLogClear: () => { log.length = 0; },
  };
  return { log, wasm, module: { HEAPU8: new Uint8Array(memory), _free: () => {} } };
}

describe('draining the command log to the main thread', () => {
  it('posts each command once, not the whole log again on every poll', () => {
    const p = new Processor();
    const { log, wasm, module } = fakeLog();
    const posted: Array<{ tick: number }[]> = [];
    Object.assign(p, { wasm, module, port: { postMessage: (m: { entries: { tick: number }[] }) => posted.push(m.entries) } });

    log.push([0, 0, 0, 48, 120, 0], [0, 4, 1, 1, 0, 0]);
    p.drainCmdLog();
    log.push([3, 0, 1, 51, 120, 0]);
    p.drainCmdLog();
    p.drainCmdLog(); // nothing new: nothing posted

    expect(posted.map((batch) => batch.map((e) => e.tick))).toEqual([[0, 0], [3]]);
  });
});
