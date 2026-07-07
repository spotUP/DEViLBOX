/**
 * WasmSynthParamBridge — generic reflected-synth param bridge.
 *
 * Covers the three reusable layers the Sonix bridge used to hand-code:
 *  1. schema-driven (de)serialization round-trips (serialize → deserialize === input),
 *     with clamping for out-of-range values;
 *  2. the engine-side mirror (handleReport caches + fires onParams; setParams posts back);
 *  3. the store merge (matches a reported param set to an instrument by `parameters[matchKey]`).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  serializeSynthParams,
  deserializeSynthParams,
  normalizeSynthParams,
  mergeSynthParamsIntoStore,
  WasmSynthParamBridge,
  type WasmSynthParamBridgeSpec,
  type InstrumentStoreLike,
} from '../WasmSynthParamBridge';

interface DemoParams extends Record<string, unknown> {
  index: number;
  vol: number;      // u8
  detune: number;   // i16 (signed)
  wave: number[];   // i8[4]
  eg: number[];     // u16[2]
}

const SPEC: WasmSynthParamBridgeSpec<DemoParams> = {
  engineKey: 'Demo',
  synthType: 'DemoSynth',
  matchKey: 'demoIndex',
  blobKey: 'demo',
  indexField: 'index',
  reportMessage: 'demoParams',
  setMessage: 'setDemoParams',
  paramSchema: [
    { name: 'index', kind: 'u8' },
    { name: 'vol', kind: 'u8' },
    { name: 'detune', kind: 'i16' },
    { name: 'wave', kind: 'i8[]', length: 4 },
    { name: 'eg', kind: 'u16[]', length: 2 },
  ],
};

const inRange = (): DemoParams => ({
  index: 3,
  vol: 200,
  detune: -1234,
  wave: [-128, 0, 64, 127],
  eg: [40000, 12],
});

describe('WasmSynthParamBridge (de)serialization', () => {
  it('round-trips an in-range param set byte-for-byte', () => {
    const p = inRange();
    const wire = serializeSynthParams(SPEC, p);
    const back = deserializeSynthParams(SPEC, wire);
    expect(back).toEqual(p);
    // Symmetric: serialize and deserialize share one normalization core.
    expect(wire).toEqual(p);
  });

  it('clamps out-of-range scalars and normalizes array length/elements', () => {
    const norm = normalizeSynthParams(SPEC, {
      index: 999,           // u8 → 255
      vol: -5,              // u8 → 0
      detune: 99999,        // i16 → 32767
      wave: [-999, 500],    // i8 clamp + pad to length 4
      eg: [70000, 1, 2, 3], // u16 clamp + truncate to length 2
    });
    expect(norm.index).toBe(255);
    expect(norm.vol).toBe(0);
    expect(norm.detune).toBe(32767);
    expect(norm.wave).toEqual([-128, 127, 0, 0]);
    expect(norm.eg).toEqual([65535, 1]);
  });

  it('drops properties not in the schema', () => {
    const norm = normalizeSynthParams(SPEC, { ...inRange(), junk: 'x' } as Record<string, unknown>);
    expect(norm).not.toHaveProperty('junk');
  });
});

describe('WasmSynthParamBridge engine mirror', () => {
  it('handleReport normalizes, caches, and fires onParams', () => {
    const post = vi.fn();
    const bridge = new WasmSynthParamBridge<DemoParams>(SPEC, post);
    const onParams = vi.fn();
    bridge.onParams = onParams;

    bridge.handleReport({ instruments: [inRange()] });

    expect(onParams).toHaveBeenCalledTimes(1);
    expect(bridge.params).toEqual([inRange()]);
    expect(onParams).toHaveBeenCalledWith([inRange()]);
  });

  it('setParams posts a normalized payload under the spec setMessage type', () => {
    const post = vi.fn();
    const bridge = new WasmSynthParamBridge<DemoParams>(SPEC, post);
    bridge.setParams(inRange());
    expect(post).toHaveBeenCalledWith({ type: 'setDemoParams', params: inRange() });
  });
});

describe('WasmSynthParamBridge store merge', () => {
  function fakeStore(matchValue: unknown): InstrumentStoreLike {
    return {
      instruments: [
        { id: 1, parameters: { demoIndex: 99 } },
        { id: 2, parameters: { demoIndex: matchValue } },
      ],
      updateInstrument: vi.fn(),
    };
  }

  it('merges each reported param set into the instrument matched by matchKey', () => {
    const store = fakeStore(3);
    const p = inRange(); // index === 3
    mergeSynthParamsIntoStore(SPEC, [p], store);

    expect(store.updateInstrument).toHaveBeenCalledTimes(1);
    expect(store.updateInstrument).toHaveBeenCalledWith(2, {
      type: 'synth',
      synthType: 'DemoSynth',
      parameters: { demoIndex: 3, demo: p },
    });
  });

  it('does not touch instruments whose matchKey does not match any reported index', () => {
    const store = fakeStore(7); // no instrument has demoIndex === 3
    mergeSynthParamsIntoStore(SPEC, [inRange()], store);
    expect(store.updateInstrument).not.toHaveBeenCalled();
  });

  it('ignores an empty report', () => {
    const store = fakeStore(3);
    mergeSynthParamsIntoStore(SPEC, [], store);
    expect(store.updateInstrument).not.toHaveBeenCalled();
  });
});
