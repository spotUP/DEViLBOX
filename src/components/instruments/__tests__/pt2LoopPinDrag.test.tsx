// Symptom: dragging a loop pin in the PT2 hardware sample editor moved the
// pin on screen but never changed the instrument's loopStart / loopEnd, so
// the playing sampler kept the old loop. Runs the real PT2SampEd.wasm.
// UI4c: the editor decoded the sample at a fixed 44100 Hz while the instrument stores a loop in frames at the
// sample's own rate (8363 for a MOD), so a dragged pin was stored 5.3 times too far, past the sample's end, and
// the looped note went silent. The decode stub below resamples to the rate it is asked for, like a browser.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useInstrumentStore } from '@/stores';
import { PT2Hardware } from '@/components/instruments/hardware/PT2Hardware';
import type { InstrumentConfig } from '@typedefs/instrument';

const invalidateInstrument = vi.hoisted(() => vi.fn());
vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({ invalidateInstrument, getInstrument: vi.fn(), updateToneJsSynthInPlace: vi.fn() }),
}));

let FRAMES = 8000; // one second of the sample at its own rate
const pub = (f: string) => resolve(__dirname, '../../../../public/pt2', f);

function Harness() {
  const inst = useInstrumentStore((s) => s.instruments.find((i) => i.id === 1)) as InstrumentConfig;
  const update = useInstrumentStore((s) => s.updateInstrument);
  return <PT2Hardware instrument={inst} onChange={(u) => update(1, u)} />;
}
const sampleOf = () => useInstrumentStore.getState().instruments.find((i) => i.id === 1)!.sample!;

describe.each([8000, 8363])('PT2 hardware sample editor loop pins (sample at %i Hz)', (rate) => {
  beforeEach(() => {
    FRAMES = rate;
    const wasmBinary = readFileSync(pub('PT2SampEd.wasm'));
    // The module is a classic script (var createPT2SampEd = ...): run it in the window.
    (0, eval)(readFileSync(pub('PT2SampEd.js'), 'utf8') + '\n;globalThis.__pt2 = createPT2SampEd;');
    const real = (globalThis as unknown as { __pt2: (o: object) => Promise<unknown> }).__pt2;
    (window as unknown as Record<string, unknown>).createPT2SampEd = (o: object) => real({ ...o, wasmBinary });
    vi.stubGlobal('OfflineAudioContext', class {
      rate: number;
      constructor(_channels: number, _length: number, rate: number) { this.rate = rate; }
      // a browser resamples a decoded buffer to the context's rate: one second is `rate` frames
      async decodeAudioData() {
        const n = Math.round(this.rate);
        const ch = new Float32Array(n).map((_, i) => Math.sin(i / 20) * 0.5);
        return { sampleRate: this.rate, getChannelData: () => ch };
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    } as unknown as ReturnType<HTMLCanvasElement["getContext"]> as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, right: 320, bottom: 134, width: 320, height: 134, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    invalidateInstrument.mockClear();
    useInstrumentStore.setState({
      instruments: [{
        id: 1, name: 'S', type: 'sample', synthType: 'Sampler', volume: -6, pan: 0, effects: [], parameters: {},
        sample: { url: 'data:audio/wav;base64,AAAA', baseNote: 'C4', detune: 0, loop: true, loopType: 'forward',
          loopStart: Math.round(FRAMES * 0.25), loopEnd: Math.round(FRAMES * 0.75), sampleRate: FRAMES },
      } as unknown as InstrumentConfig],
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('dragging a loop pin changes the instrument loop and rebuilds the playing sampler', async () => {
    const { container } = render(<Harness />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });

    // waveform spans 314 px over 8000 frames; the loop start pin sits at x 79, the end pin at x 236
    // (end pin hit zone is pin+3..pin+6); the pins are grabbed in the top strip (screen y < 142)
    const y = 139 - 121;
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: y, pointerId: 1 });
    await act(async () => { fireEvent.pointerMove(document, { clientX: 40, clientY: y, pointerId: 1 }); });
    await act(async () => { fireEvent.pointerUp(document, { clientX: 40, clientY: y, pointerId: 1 }); });
    expect(sampleOf().loopStart).toBeGreaterThan(FRAMES * 0.1125);
    expect(sampleOf().loopStart).toBeLessThan(FRAMES * 0.1375);
    expect(sampleOf().loopEnd).toBe(Math.round(FRAMES * 0.75));
    expect(invalidateInstrument).toHaveBeenCalledWith(1);

    invalidateInstrument.mockClear();
    fireEvent.pointerDown(canvas, { clientX: 240, clientY: y, pointerId: 1 });
    await act(async () => { fireEvent.pointerMove(document, { clientX: 280, clientY: y, pointerId: 1 }); });
    await act(async () => { fireEvent.pointerUp(document, { clientX: 280, clientY: y, pointerId: 1 }); });
    expect(sampleOf().loopEnd).toBeGreaterThan(FRAMES * 0.8625);
    expect(sampleOf().loopEnd).toBeLessThan(FRAMES * 0.9);
    expect(invalidateInstrument).toHaveBeenCalledWith(1);
    // a loop stored in the sample's own frames lies inside the sample
    expect(sampleOf().loopEnd!).toBeLessThanOrEqual(FRAMES);
  });
});
