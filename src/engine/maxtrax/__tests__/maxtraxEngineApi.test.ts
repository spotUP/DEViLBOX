import { it, expect, vi } from 'vitest';

// Mock the audio context before importing MaxTraxEngine
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({
    sampleRate: 44100,
    createGain: () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } }),
    audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
    destination: {},
  }),
  setDevilboxAudioContext: vi.fn(),
}));

// Mock AudioWorkletNode so the WASMSingletonBase constructor doesn't explode
vi.stubGlobal('AudioWorkletNode', class {
  port = { postMessage: vi.fn(), onmessage: null };
  connect = vi.fn();
  disconnect = vi.fn();
});

import { MaxTraxEngine } from '@/engine/maxtrax/MaxTraxEngine';
import { useFormatStore } from '@/stores/useFormatStore';

it('setEvent posts to the worklet and mirrors into the store', () => {
  useFormatStore.getState().setMaxTraxData({ tempo:0, flags:0, headerRaw:new Uint8Array(), scores:[{events:[{command:0x3c,data:0,startTime:0,stopTime:10}]}], tailRaw:new Uint8Array() });
  const eng = MaxTraxEngine.getInstance();
  const post = vi.fn();
  (eng as any).workletNode = { port: { postMessage: post } };
  eng.setEvent(0, 0, { command: 0x40, data: 0x11, startTime: 0, stopTime: 20 });
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'setEvent', score: 0, index: 0 }));
  expect(useFormatStore.getState().maxTraxData!.scores[0].events[0].command).toBe(0x40);
});
