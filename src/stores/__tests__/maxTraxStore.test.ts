import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import type { MaxTraxData } from '@/lib/import/formats/maxtrax/maxtraxFormat';

function sampleData(): MaxTraxData {
  return {
    tempo: 100, flags: 0,
    headerRaw: new Uint8Array([0x4d,0x58,0x54,0x58]),
    scores: [{ events: [{ command: 0x3c, data: 0x21, startTime: 0, stopTime: 48 }] }],
    tailRaw: new Uint8Array([0, 0]),
  };
}

describe('useFormatStore MaxTrax model', () => {
  beforeEach(() => { useFormatStore.getState().setMaxTraxData(null); });

  it('persists parsed MaxTraxData as the edit authority', () => {
    useFormatStore.getState().setMaxTraxData(sampleData());
    expect(useFormatStore.getState().maxTraxData?.scores[0].events[0].command).toBe(0x3c);
  });

  it('mutateMaxTraxScore edits events and bumps the revision', () => {
    useFormatStore.getState().setMaxTraxData(sampleData());
    const rev0 = useFormatStore.getState().maxTraxRev;
    useFormatStore.getState().mutateMaxTraxScore(0, (s) => { s.events[0].stopTime = 96; });
    expect(useFormatStore.getState().maxTraxData?.scores[0].events[0].stopTime).toBe(96);
    expect(useFormatStore.getState().maxTraxRev).toBe(rev0 + 1);
  });

  it('clears the model on reset', () => {
    useFormatStore.getState().setMaxTraxData(sampleData());
    useFormatStore.getState().setMaxTraxData(null);
    expect(useFormatStore.getState().maxTraxData).toBeNull();
  });
});
