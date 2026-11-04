import { describe, it, expect } from 'vitest';
import { JxsEngine } from '../JxsEngine';

/** Regression: popcorn.jxs played but the grid never followed; the engine sent {bar, step}, routing reads {songPos, row}. */
describe('JxsEngine position contract', () => {
  const make = (firstBar: number, lastBar: number) => {
    const engine = Object.create(JxsEngine.prototype) as JxsEngine;
    const state = engine as unknown as { _range: { firstBar: number; lastBar: number }; _positionCallbacks: Set<(u: unknown) => void> };
    const got: unknown[] = [];
    state._range = { firstBar, lastBar };
    state._positionCallbacks = new Set([(u: unknown) => got.push(u)]);
    return { engine, got };
  };
  it('maps the worklet {bar, step} to {songPos: bar - firstBar, row: step}', () => {
    const { engine, got } = make(4, 6);
    engine.handleWorkletMessage({ type: 'position', bar: 5, step: 12 });
    expect(got).toEqual([{ songPos: 1, row: 12 }]);
  });
  it('drops the pre-roll and end-parking positions outside the played bars', () => {
    const { engine, got } = make(4, 6);
    engine.handleWorkletMessage({ type: 'position', bar: 3, step: 63 });
    engine.handleWorkletMessage({ type: 'position', bar: 0, step: 0 });
    engine.handleWorkletMessage({ type: 'position', bar: 7, step: 0 });
    expect(got).toEqual([]);
  });
});
