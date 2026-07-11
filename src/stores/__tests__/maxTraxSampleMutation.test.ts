// src/stores/__tests__/maxTraxSampleMutation.test.ts
//
// Unit test for mutateMaxTraxSample — exercises every mutation kind on a
// hand-built minimal tailRaw with exactly one DiskSample (numSamples=1).
//
// DiskSample layout (big-endian, base p=2 after the 2-byte numSamples word):
//   +0  u16 Number      +2  i16 Tune       +4  u16 Volume    +6  u16 Octaves
//   +8  u32 AttackLength  +12 u32 SustainLength
//   +16 u16 AttackCount   +18 u16 ReleaseCount
//   then (AttackCount+ReleaseCount) × {u16 Duration, u16 Volume}  then PCM
//
// Fixture: Octaves=0, AttackLength=0, SustainLength=0 → pcmSize=0 (no PCM).
// AttackCount=1, ReleaseCount=0 → 1 envelope point (4 bytes).
//
// Byte positions (absolute):
//   0-1   numSamples=1
//   2-3   Number=5       (headerBase=2, +0)
//   4-5   Tune=0         (+2)
//   6-7   Volume=64      (+4)
//   8-9   Octaves=0      (+6)
//   10-13 AttackLength=0 (+8)
//   14-17 SustainLength=0 (+12)
//   18-19 AttackCount=1  (+16)
//   20-21 ReleaseCount=0 (+18)
//   22-25 env point 0: Duration=100, Volume=40  (envBase=22)

import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';

function makeTailRaw(): Uint8Array {
  return new Uint8Array([
    0, 1,          // numSamples = 1
    0, 5,          // Number = 5
    0, 0,          // Tune = 0
    0, 64,         // Volume = 64
    0, 0,          // Octaves = 0
    0, 0, 0, 0,    // AttackLength = 0
    0, 0, 0, 0,    // SustainLength = 0
    0, 1,          // AttackCount = 1
    0, 0,          // ReleaseCount = 0
    0, 100, 0, 40, // env point 0: Duration=100, Volume=40
  ]);
}

function setup(tailRaw: Uint8Array): void {
  useFormatStore.getState().setMaxTraxData({
    tempo: 0,
    flags: 0,
    headerRaw: new Uint8Array(),
    scores: [{ events: [] }],
    tailRaw,
  });
}

describe('mutateMaxTraxSample', () => {
  beforeEach(() => {
    setup(makeTailRaw());
  });

  it('field: writes volume to the correct tailRaw byte (offset 2+4=6) and increments maxTraxRev', () => {
    const revBefore = useFormatStore.getState().maxTraxRev;
    useFormatStore.getState().mutateMaxTraxSample(0, { kind: 'field', field: 'volume', value: 32 });

    const state = useFormatStore.getState();
    const tail = state.maxTraxData!.tailRaw;
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    // Volume is at headerBase(2) + 4 = absolute offset 6
    expect(dv.getUint16(6)).toBe(32);
    expect(state.maxTraxRev).toBe(revBefore + 1);
  });

  it('envField: writes envelope point volume at the correct tailRaw byte (envBase 22 + 0*4 + 2 = 24)', () => {
    useFormatStore.getState().mutateMaxTraxSample(0, {
      kind: 'envField',
      side: 'attack',
      pointIndex: 0,
      field: 'volume',
      value: 50,
    });

    const tail = useFormatStore.getState().maxTraxData!.tailRaw;
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    // envBase = headerBase(2) + 20 = 22; volume field of point 0 is at 22 + 0*4 + 2 = 24
    expect(dv.getUint16(24)).toBe(50);
  });

  it('addEnvPoint: increments AttackCount header word (offset 2+16=18) to 2 and grows tailRaw by 4 bytes', () => {
    const lenBefore = useFormatStore.getState().maxTraxData!.tailRaw.length;

    useFormatStore.getState().mutateMaxTraxSample(0, {
      kind: 'addEnvPoint',
      side: 'attack',
      duration: 100,
      volume: 64,
    });

    const state = useFormatStore.getState();
    const tail = state.maxTraxData!.tailRaw;
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    // AttackCount is at headerBase(2) + 16 = absolute offset 18
    expect(dv.getUint16(18)).toBe(2);
    expect(tail.length).toBe(lenBefore + 4);
  });

  it('removeEnvPoint: decrements AttackCount to 0 and shrinks tailRaw by 4 bytes', () => {
    const lenBefore = useFormatStore.getState().maxTraxData!.tailRaw.length;

    useFormatStore.getState().mutateMaxTraxSample(0, {
      kind: 'removeEnvPoint',
      side: 'attack',
      pointIndex: 0,
    });

    const state = useFormatStore.getState();
    const tail = state.maxTraxData!.tailRaw;
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    // AttackCount is at absolute offset 18
    expect(dv.getUint16(18)).toBe(0);
    expect(tail.length).toBe(lenBefore - 4);
  });
});
