/**
 * A removed guitar amp model stops its audio processor.
 *
 * GuitarMLEngine.dispose only disconnected the worklet node and the processor
 * always returned true from process(), so every amp model ever created - each
 * preset change, each pedalboard edit - kept its processor and model for the
 * rest of the session. On 2026-09-30 a calibration run created ~80 and the tab
 * stopped responding; the machine later ran out of memory (the link between
 * the two is not confirmed). The processor now takes a 'dispose' message and
 * returns false, which lets the browser collect the node.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
type Proc = { handleMessage(d: unknown): void; process(i: Float32Array[][], o: Float32Array[][]): boolean };
let Processor: new () => Proc;

beforeAll(() => {
  const src = readFileSync(resolve(ROOT, 'public/GuitarML.worklet.js'), 'utf8');
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 48000,
    currentTime: 0,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
});

const io = () => [[new Float32Array(128).fill(0.1)]];

describe('GuitarML worklet', () => {
  it('keeps running while in use', () => {
    const p = new Processor();
    expect(p.process(io(), io())).toBe(true);
  });

  it('stops once disposed, so the browser can collect it', () => {
    const p = new Processor();
    p.handleMessage({ type: 'dispose' });
    expect(p.process(io(), io())).toBe(false);
  });

  it('GuitarMLEngine.dispose tells the processor to stop', () => {
    const engine = readFileSync(resolve(ROOT, 'src/engine/GuitarMLEngine.ts'), 'utf8');
    expect(engine).toContain("this.workletNode.port.postMessage({ type: 'dispose' });");
  });
});
