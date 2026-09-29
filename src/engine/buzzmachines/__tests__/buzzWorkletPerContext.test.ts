/**
 * The Buzz worklet is registered on every AudioContext a machine is built on.
 *
 * BuzzmachineEngine kept one "loaded" flag for the whole app, so a machine
 * built on a second context failed with "buzzmachine-processor is not
 * defined in AudioWorkletGlobalScope" - seen at page load when a saved master
 * chain held a Buzz effect (2026-09-29).
 */
import { describe, it, expect, vi } from 'vitest';
import { BuzzmachineEngine } from '../BuzzmachineEngine';

function fakeContext() {
  return { state: 'running', resume: vi.fn(async () => {}), audioWorklet: { addModule: vi.fn(async () => {}) } };
}

describe('BuzzmachineEngine', () => {
  it('registers the worklet once per context, on each context', async () => {
    const engine = BuzzmachineEngine.getInstance();
    const a = fakeContext(), b = fakeContext();
    await engine.init(a as never);
    await engine.init(a as never);
    await engine.init(b as never);
    expect(a.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(b.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(engine.isInitialized(b as never)).toBe(true);
  });
});
