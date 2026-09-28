/**
 * Effect worklets stop computing silence, and wake for sound or a message.
 *
 * With the dub bus off and no song playing, its effect processors ran every
 * quantum anyway: the RE-201 alone took 35-43 ms of each second of the audio
 * thread (2026-09-28). public/worklets/idle-gate.js wraps their registration.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Proc = { port: { onmessage: ((e: { data: unknown }) => void) | null }; process(i: Float32Array[][], o: Float32Array[][]): boolean; dsp: number; tail: number };
const registered = new Map<string, new () => Proc>();

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.registerProcessor = (name: string, cls: new () => Proc) => { registered.set(name, cls); };
  new Function(readFileSync(resolve(__dirname, '../../../public/worklets/idle-gate.js'), 'utf8'))();
  // An echo-like effect: copies input to output, plus a decaying tail.
  class Echo {
    port = { onmessage: null as ((e: { data: unknown }) => void) | null };
    dsp = 0; tail = 0;
    constructor() { this.port.onmessage = () => { this.tail = 0.5; }; }
    process(i: Float32Array[][], o: Float32Array[][]) {
      this.dsp++;
      for (let k = 0; k < 128; k++) {
        const x = i[0]?.[0]?.[k] ?? 0;
        if (Math.abs(x) > this.tail) this.tail = Math.abs(x);
        o[0][0][k] = x + this.tail;
        this.tail *= 0.9;
      }
      return true;
    }
  }
  (g.registerProcessor as (n: string, c: unknown) => void)('re201-processor', Echo);
  (g.registerProcessor as (n: string, c: unknown) => void)('tfmx-processor', Echo);
});

const run = (p: Proc, n: number, level = 0) => {
  for (let q = 0; q < n; q++) {
    const inp = new Float32Array(128).fill(level);
    const out = new Float32Array(128);
    p.process([[inp]], [[out]]);
  }
};

describe('the effect idle gate', () => {
  it('skips an idle effect, and wakes it for sound and for a message', () => {
    const p = new (registered.get('re201-processor')!)();
    run(p, 20, 0.3);            // playing
    run(p, 500);                // tail decays, then ~1 s of silence
    const idleAt = p.dsp;
    run(p, 1000);               // silence: no DSP
    expect(p.dsp).toBe(idleAt);

    run(p, 1, 0.3);             // sound wakes it
    expect(p.dsp).toBe(idleAt + 1);

    run(p, 800);                // idle again
    const idle2 = p.dsp;
    p.port.onmessage!({ data: { type: 'param' } });
    run(p, 1);                  // a message wakes it: its tail can sound without input
    expect(p.dsp).toBe(idle2 + 1);
  });

  it('keeps running while its own output still sounds', () => {
    const p = new (registered.get('re201-processor')!)();
    // A tail that never decays (self-oscillation) must never idle.
    const self = p as unknown as { tail: number };
    for (let q = 0; q < 1000; q++) { self.tail = 1; run(p, 1); }
    expect(p.dsp).toBe(1000);
  });

  it('leaves processors outside the list alone', () => {
    const p = new (registered.get('tfmx-processor')!)();
    run(p, 1000);
    expect(p.dsp).toBe(1000);
  });
});
