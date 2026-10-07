// Symptom: dragging a loop pin in the PT2 hardware sample editor moved the
// pin on screen but never changed the instrument's loopStart / loopEnd, so
// the playing sampler kept the old loop. Runs the real PT2SampEd.wasm.
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

const FRAMES = 8000;
const pub = (f: string) => resolve(__dirname, '../../../../public/pt2', f);

function Harness() {
  const inst = useInstrumentStore((s) => s.instruments.find((i) => i.id === 1)) as InstrumentConfig;
  const update = useInstrumentStore((s) => s.updateInstrument);
  return <PT2Hardware instrument={inst} onChange={(u) => update(1, u)} />;
}
const sampleOf = () => useInstrumentStore.getState().instruments.find((i) => i.id === 1)!.sample!;

describe('PT2 hardware sample editor loop pins', () => {
  beforeEach(() => {
    const wasmBinary = readFileSync(pub('PT2SampEd.wasm'));
    // The module is a classic script (var createPT2SampEd = ...): run it in the window.
    (0, eval)(readFileSync(pub('PT2SampEd.js'), 'utf8') + '\n;globalThis.__pt2 = createPT2SampEd;');
    const real = (globalThis as unknown as { __pt2: (o: object) => Promise<unknown> }).__pt2;
    (window as unknown as Record<string, unknown>).createPT2SampEd = (o: object) => real({ ...o, wasmBinary });
    vi.stubGlobal('OfflineAudioContext', class {
      async decodeAudioData() {
        const ch = new Float32Array(FRAMES).map((_, i) => Math.sin(i / 20) * 0.5);
        return { sampleRate: 8000, getChannelData: () => ch };
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
          loopStart: 2000, loopEnd: 6000, sampleRate: 8000 },
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
    expect(sampleOf().loopStart).toBeGreaterThan(900);
    expect(sampleOf().loopStart).toBeLessThan(1100);
    expect(sampleOf().loopEnd).toBe(6000);
    expect(invalidateInstrument).toHaveBeenCalledWith(1);

    invalidateInstrument.mockClear();
    fireEvent.pointerDown(canvas, { clientX: 240, clientY: y, pointerId: 1 });
    await act(async () => { fireEvent.pointerMove(document, { clientX: 280, clientY: y, pointerId: 1 }); });
    await act(async () => { fireEvent.pointerUp(document, { clientX: 280, clientY: y, pointerId: 1 }); });
    expect(sampleOf().loopEnd).toBeGreaterThan(6900);
    expect(sampleOf().loopEnd).toBeLessThan(7200);
    expect(invalidateInstrument).toHaveBeenCalledWith(1);
  });
});
