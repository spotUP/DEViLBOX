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

/**
 * The same for the plain-JavaScript effect worklets that were only
 * disconnected on removal. VinylNoise, ToneArm and Tumult generate sound
 * with no input, so a removed one kept computing for the rest of the session.
 */
const JS_EFFECTS: [string, string][] = [
  ['public/tapedelay/TapeDelay.worklet.js', 'src/engine/effects/TapeDelayEffect.ts'],
  ['public/tonearm/ToneArm.worklet.js', 'src/engine/effects/ToneArmEffect.ts'],
  ['public/tumult/Tumult.worklet.js', 'src/engine/effects/TumultEffect.ts'],
  ['public/vinylnoise/VinylNoise.worklet.js', 'src/engine/effects/VinylNoiseEffect.ts'],
];

describe.each(JS_EFFECTS)('%s', (worklet, wrapper) => {
  let Proc: new () => { port: { onmessage: ((e: { data: unknown }) => void) | null }; _handleMessage?: (d: unknown) => void; process(i: Float32Array[][], o: Float32Array[][]): boolean };
  beforeAll(() => {
    const src = readFileSync(resolve(ROOT, worklet), 'utf8');
    const scope: Record<string, unknown> = {
      AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
      registerProcessor: (_n: string, cls: typeof Proc) => { Proc = cls; },
      sampleRate: 48000, currentTime: 0, currentFrame: 0,
      console: { log: () => {}, warn: () => {}, error: () => {} },
    };
    new Function(...Object.keys(scope), src)(...Object.values(scope));
  });
  const stereo = () => [[new Float32Array(128).fill(0.1), new Float32Array(128).fill(0.1)]];

  it('stops once disposed', () => {
    const p = new Proc();
    expect(p.process(stereo(), stereo())).toBe(true);
    p.port.onmessage!({ data: { type: 'dispose' } });
    expect(p.process(stereo(), stereo())).toBe(false);
  });

  it('its wrapper sends dispose on removal', () => {
    expect(readFileSync(resolve(ROOT, wrapper), 'utf8')).toContain("this.workletNode?.port.postMessage({ type: 'dispose' });");
  });
});

/**
 * The models add their input back (skip connection).
 *
 * Every bundled model file declares `skip: 1`: the network was trained on the
 * DIFFERENCE between the amp and its input, and the reference forward pass is
 * `lin(h) + input` (SimpleRNN, Automated-GuitarAmpModelling). The worklet
 * ignored the flag and played the difference alone - mostly an inverted copy
 * of the input: every model correlated negatively with its input (to -0.72)
 * and came out -17.5 to +8.9 dB off unity (measured in the app, 2026-09-30),
 * so mixing an amp with its dry signal cancelled.
 */
describe('GuitarML skip connection', () => {
  const model = (skip: number) => {
    const md = JSON.parse(readFileSync(resolve(ROOT, 'public/models/guitarml/PrincetonAmp_Clean.json'), 'utf8'));
    md.model_data.skip = skip;
    return md;
  };
  const run = (skip: number) => {
    const p = new Processor() as Proc & { handleMessage(d: unknown): void };
    p.handleMessage({ type: 'loadModel', modelData: model(skip) });
    p.handleMessage({ type: 'setParameter', param: 'gain', value: 12 }); // unity input gain
    p.handleMessage({ type: 'setParameter', param: 'useSRCFilter', value: false }); // compare the model alone
    const x = new Float32Array(128).map((_, i) => 0.1 * Math.sin(i / 5));
    const y = new Float32Array(128);
    p.process([[x]], [[y]]);
    return { x, y, k: (p as unknown as { dcBlocker_coeff: number }).dcBlocker_coeff };
  };

  it('every bundled model is trained with it', () => {
    const engine = readFileSync(resolve(ROOT, 'src/engine/GuitarMLEngine.ts'), 'utf8');
    const files = [...engine.matchAll(/fileName: '([^']+)'/g)].map((m) => m[1]);
    expect(files.length).toBe(37);
    for (const f of files) {
      expect(JSON.parse(readFileSync(resolve(ROOT, 'public/models/guitarml', f), 'utf8')).model_data.skip, f).toBe(1);
    }
  });

  it('adds the input to the network output', () => {
    const a = run(1), b = run(0);
    // The DC blocker after the model is linear, so the difference is the
    // input through that same blocker.
    const k = a.k;
    let x1 = 0, y1 = 0;
    for (let i = 0; i < 128; i++) {
      const want = a.x[i] - x1 + k * y1; x1 = a.x[i]; y1 = want;
      expect(a.y[i] - b.y[i]).toBeCloseTo(want, 6);
    }
  });
});
