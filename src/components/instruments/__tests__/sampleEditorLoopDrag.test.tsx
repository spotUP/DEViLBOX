// Symptom: in the sample instrument editor the loop points cannot be dragged.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { useInstrumentStore } from '@/stores';
import { SampleEditor } from '@/components/instruments/SampleEditor';
import type { InstrumentConfig } from '@typedefs/instrument';

const invalidateInstrument = vi.hoisted(() => vi.fn());
vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({ invalidateInstrument, getInstrument: vi.fn(), updateToneJsSynthInPlace: vi.fn() }),
}));

const FRAMES = 8000;
const RATE = 8000;

function wavBytes(): ArrayBuffer {
  const buf = new ArrayBuffer(44 + FRAMES * 2);
  const v = new DataView(buf);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + FRAMES * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, FRAMES * 2, true);
  for (let i = 0; i < FRAMES; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 20) * 12000), true);
  return buf;
}

function Harness({ id }: { id: number }) {
  const inst = useInstrumentStore((s) => s.instruments.find((i) => i.id === id)) as InstrumentConfig;
  return <SampleEditor instrument={inst} />;
}

const sampleOf = () => useInstrumentStore.getState().instruments.find((i) => i.id === 1)!.sample!;

describe('sample editor loop handles', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioBuffer', class {
      readonly length: number; readonly sampleRate: number; readonly numberOfChannels: number; readonly duration: number;
      private ch: Float32Array[];
      constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
        this.length = o.length; this.sampleRate = o.sampleRate; this.numberOfChannels = o.numberOfChannels;
        this.duration = o.length / o.sampleRate;
        this.ch = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
      }
      getChannelData(c: number) { return this.ch[c]; }
      copyToChannel(d: Float32Array, c: number) { this.ch[c].set(d); }
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(wavBytes(), { headers: { 'content-type': 'audio/wav' } })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, right: 1000, bottom: 150, width: 1000, height: 150, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    useInstrumentStore.setState({
      instruments: [{
        id: 1, name: 'S', type: 'sample', synthType: 'Sampler', volume: -6, pan: 0, effects: [],
        parameters: {},
        sample: { url: 'data:audio/wav;base64,AAAA', baseNote: 'C4', detune: 0, loop: true, loopType: 'forward',
          loopStart: 2000, loopEnd: 6000, sampleRate: RATE, reverse: false, playbackRate: 1 },
      } as unknown as InstrumentConfig],
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('dragging a loop handle on the waveform moves loopStart / loopEnd and rebuilds the playing sampler', async () => {
    const invalidate = invalidateInstrument;
    invalidate.mockClear();
    const { container } = render(<Harness id={1} />);
    const canvas = container.querySelector('canvas[width]') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    // wait for the buffer to decode: the loop handle only exists then
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // loopStart handle sits at 2000/8000 = 0.25 -> x 250 of 1000
    fireEvent.pointerDown(canvas, { clientX: 250, clientY: 75, pointerId: 1 });
    await act(async () => { fireEvent.pointerMove(window, { clientX: 100, clientY: 75, pointerId: 1 }); });
    await act(async () => { fireEvent.pointerUp(window, { pointerId: 1 }); });
    expect(sampleOf().loopStart).toBe(800);
    expect(sampleOf().loopEnd).toBe(6000);
    expect(invalidate).toHaveBeenCalledWith(1);

    // loopEnd handle at 6000/8000 = 0.75
    invalidate.mockClear();
    fireEvent.pointerDown(canvas, { clientX: 750, clientY: 10, pointerId: 1 });
    await act(async () => { fireEvent.pointerMove(window, { clientX: 900, clientY: 10, pointerId: 1 }); });
    await act(async () => { fireEvent.pointerUp(window, { pointerId: 1 }); });
    expect(sampleOf().loopEnd).toBe(7200);
    expect(sampleOf().loopStart).toBe(800);
    expect(invalidate).toHaveBeenCalledWith(1);
  });
});
