/**
 * DJ-IDLE-CPU: each DJ deck's scratch capture ran its per-sample loop and
 * posted a write-position report every 50 ms with the deck stopped - 8 ms of
 * every second of the audio thread for three idle decks (2026-10-12), and
 * reports nothing reads. Stopped (or frozen by a scratch), nothing is written,
 * so the processor only passes its input through.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Port = { postMessage: (m: unknown) => void; onmessage: ((e: { data: unknown }) => void) | null };
type Capture = { port: Port; process(i: Float32Array[][], o: Float32Array[][]): boolean };
const registered = new Map<string, new (o: unknown) => Capture>();
const posted: unknown[] = [];

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.sampleRate = 48000;
  g.AudioWorkletProcessor = class { port: Port = { postMessage: (m: unknown) => { posted.push(m); }, onmessage: null }; };
  g.registerProcessor = (name: string, cls: new (o: unknown) => Capture) => { registered.set(name, cls); };
  new Function(readFileSync(resolve(__dirname, '../../../public/worklets/scratch-buffer.worklet.js'), 'utf8'))();
});

const block = (v: number) => [new Float32Array(128).fill(v), new Float32Array(128).fill(v)];

describe('scratch capture on a stopped deck', () => {
  it('passes its input through and posts nothing', () => {
    const cap = new (registered.get('scratch-capture')!)({ processorOptions: { bufferId: 7 } });
    cap.port.onmessage!({ data: { type: 'sourceRunning', running: false } });
    posted.length = 0;
    for (let q = 0; q < 375; q++) {           // one second
      const out = [new Float32Array(128), new Float32Array(128)];
      cap.process([block(0.25)], [out]);
      expect(out[0][5]).toBe(0.25);
    }
    expect(posted).toEqual([]);
  });

  it('a playing deck is still recorded and reported', () => {
    const cap = new (registered.get('scratch-capture')!)({ processorOptions: { bufferId: 8 } });
    cap.port.onmessage!({ data: { type: 'sourceRunning', running: true } });
    posted.length = 0;
    for (let q = 0; q < 375; q++) cap.process([block(0.25)], [[new Float32Array(128), new Float32Array(128)]]);
    expect(posted.length).toBeGreaterThan(10);
    expect((posted.at(-1) as { pos: number }).pos).toBeGreaterThan(0);
  });
});
