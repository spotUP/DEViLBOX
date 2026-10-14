/**
 * PITCH-SLIDER-ALL-FORMATS: how the slider's tempo/pitch pair lands on an engine's native controls, and how the
 * Hively engine composes the slider's varispeed with the dub tape stop's.
 */
import { describe, it, expect } from 'vitest';
import { engineRateAndTempo } from '../nativeEnginePitch';
import { HivelyEngine } from '@/engine/hively/HivelyEngine';
import type { EngineTempoPitchControl } from '../wasmEngineRegistry';

const varispeedAndTempo: EngineTempoPitchControl = { setRate: () => {}, setTempoScale: () => {} };
const varispeedOnly: EngineTempoPitchControl = { setRate: () => {} };

describe('engineRateAndTempo', () => {
  it('Key Lock off (tempo = pitch): pure varispeed, tempo scale 1', () => {
    expect(engineRateAndTempo(varispeedAndTempo, 1.5, 1.5)).toEqual({ rate: 1.5, tempoScale: 1 });
  });

  it('Key Lock on (pitch 1): rate 1, the tempo scale carries the tempo', () => {
    expect(engineRateAndTempo(varispeedAndTempo, 1.5, 1)).toEqual({ rate: 1, tempoScale: 1.5 });
  });

  it('an engine without a tempo-only control follows the tempo as a varispeed', () => {
    expect(engineRateAndTempo(varispeedOnly, 1.5, 1)).toEqual({ rate: 1.5, tempoScale: null });
  });
});

describe('HivelyEngine: the slider varispeed and the tape stop compose', () => {
  it('a tape stop slows from the slider speed and lands back on it, not on 1.0', () => {
    const posted: Array<{ type: string; value: number }> = [];
    const engine = Object.create(HivelyEngine.prototype) as HivelyEngine;
    Object.assign(engine, {
      _transportRate: 1,
      _sliderRate: 1,
      workletNode: { port: { postMessage: (m: { type: string; value: number }) => posted.push(m) } },
    });

    engine.setSliderRate(1.5);
    engine.setRateFactor(0.5);           // tape stop in progress
    engine.setRateFactor(1);             // tape stop released
    engine.setTempoScale(1.25);

    expect(posted).toEqual([
      { type: 'setRateFactor', value: 1.5 },
      { type: 'setRateFactor', value: 0.75 },
      { type: 'setRateFactor', value: 1.5 },
      { type: 'setTempoScale', value: 1.25 },
    ]);
  });
});
