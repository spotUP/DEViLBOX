// useFormatStore.sunTronic.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import type { SunTronicNativeData } from '@/lib/import/formats/sunNativeData';

const nd: SunTronicNativeData = {
  blocks: [[{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]],
  positions: [{ blockIndex: [0, 0, 0, 0], transpose: [0, 0, 0, 0] }],
};

describe('setSunTronicPositionCell', () => {
  beforeEach(() => { useFormatStore.setState({ sunTronicNative: JSON.parse(JSON.stringify(nd)) }); });
  it('sets transpose and clamps to signed byte range', () => {
    useFormatStore.getState().setSunTronicPositionCell(0, 1, 'transpose', 200);
    expect(useFormatStore.getState().sunTronicNative!.positions[0].transpose[1]).toBe(127);
  });
  it('clamps blockIndex to the pool size', () => {
    useFormatStore.getState().setSunTronicPositionCell(0, 0, 'blockIndex', 99);
    expect(useFormatStore.getState().sunTronicNative!.positions[0].blockIndex[0]).toBe(0);
  });
});
