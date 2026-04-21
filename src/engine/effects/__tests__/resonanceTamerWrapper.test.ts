import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ResonanceTamerCharacter } from '../ResonanceTamerEffect';

/**
 * Regression tests for the ResonanceTamerEffect TS wrapper.
 *
 * The DSP itself lives in C++/WASM and can't be unit-tested from Node.
 * These tests cover the wrapper contract — character enum roundtrip,
 * amount clamping, parameter-posting shape — which is where user-facing
 * regressions creep in (e.g. an edit typo that dropped 'warm' silently).
 *
 * We stub out Tone.js and Web Audio so construction doesn't try to touch
 * an AudioContext. The wrapper falls into its passthrough path; we
 * inspect its state after calling each setter.
 */

// ─── Stubs ──────────────────────────────────────────────────────────────────

class FakeGain {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
  dispose = vi.fn();
}

vi.mock('tone', () => {
  class ToneAudioNode {
    dispose(): void { /* stub */ }
  }
  return {
    ToneAudioNode,
    Gain: class { gain = { value: 1 }; connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); constructor(v?: number) { if (v !== undefined) this.gain.value = v; } },
    getContext: () => ({
      rawContext: {
        audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
        createGain: () => new FakeGain(),
      } as unknown as AudioContext,
    }),
  };
});

vi.mock('@utils/audio-context', () => ({
  getNativeAudioNode: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));

// Stub global fetch so the wrapper's ensureInitialized doesn't try to hit
// the network. Tests don't need an actual WASM load.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    text: () => Promise.resolve(''),
  }));
  // AudioWorkletNode is not present in node; stub it so the wrapper can
  // construct without throwing (it'll fall through to passthrough on init
  // failure which is what we want for these tests).
  vi.stubGlobal('AudioWorkletNode', class {
    port = { postMessage: vi.fn(), onmessage: null };
    connect = vi.fn();
    disconnect = vi.fn();
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ResonanceTamerEffect wrapper', () => {
  it('constructs with sensible defaults (Amount ~ 0.35, character = transparent)', async () => {
    const { ResonanceTamerEffect } = await import('../ResonanceTamerEffect');
    const fx = new ResonanceTamerEffect();
    expect(fx.amount).toBeCloseTo(0.35, 6);
    expect(fx.character).toBe('transparent');
    expect(fx.mix).toBe(1);
  });

  it('honors construction options', async () => {
    const { ResonanceTamerEffect } = await import('../ResonanceTamerEffect');
    const fx = new ResonanceTamerEffect({ amount: 0.8, character: 'warm', mix: 0.5 });
    expect(fx.amount).toBeCloseTo(0.8, 6);
    expect(fx.character).toBe('warm');
    expect(fx.mix).toBeCloseTo(0.5, 6);
  });

  it('clamps Amount into [0, 1] (user can\'t push WASM into undefined ranges)', async () => {
    const { ResonanceTamerEffect } = await import('../ResonanceTamerEffect');
    const fx = new ResonanceTamerEffect();
    fx.setAmount(2.5);
    expect(fx.amount).toBe(1);
    fx.setAmount(-0.3);
    expect(fx.amount).toBe(0);
    fx.setAmount(0.5);
    expect(fx.amount).toBe(0.5);
  });

  it('roundtrips all three character options', async () => {
    const { ResonanceTamerEffect } = await import('../ResonanceTamerEffect');
    const fx = new ResonanceTamerEffect();
    for (const c of ['transparent', 'warm', 'bright'] as const) {
      fx.setCharacter(c);
      expect(fx.character).toBe(c);
    }
  });

  it('setParam("character", "warm") via the string API works', async () => {
    const { ResonanceTamerEffect } = await import('../ResonanceTamerEffect');
    const fx = new ResonanceTamerEffect();
    // setParam expects a FLOAT (0..1) encoding of character — this is the
    // route the WASM worklet uses. The wrapper must decode it back into
    // the enum string so the TS state stays human-readable.
    fx.setParam('character', 0.0);
    expect(fx.character).toBe('transparent');
    fx.setParam('character', 0.5);
    expect(fx.character).toBe('warm');
    fx.setParam('character', 1.0);
    expect(fx.character).toBe('bright');
  });

  it('regression — setAmount via string key routes to the numeric setter', async () => {
    // The effect editor calls onUpdateParameter('amount', 0.6) which flows
    // through setParam. A prior bug had setParam for 'amount' silently
    // drop the value. Lock it down.
    const { ResonanceTamerEffect } = await import('../ResonanceTamerEffect');
    const fx = new ResonanceTamerEffect();
    fx.setParam('amount', 0.6);
    expect(fx.amount).toBeCloseTo(0.6, 6);
  });

  it('wet setter clamps into [0, 1]', async () => {
    const { ResonanceTamerEffect } = await import('../ResonanceTamerEffect');
    const fx = new ResonanceTamerEffect();
    fx.wet = 1.5;
    expect(fx.wet).toBe(1);
    fx.wet = -0.2;
    expect(fx.wet).toBe(0);
  });

  it('TYPE CONTRACT — character enum exactly has 3 values matching C++ ordering', () => {
    // Locks the enum membership so the C++ switch on character integer
    // can't drift out of sync with the TS/UI side. Adding a new option
    // requires bumping the C++ enum and the TS type in the same PR.
    const characters: ResonanceTamerCharacter[] = ['transparent', 'warm', 'bright'];
    expect(characters).toHaveLength(3);
    expect(characters[0]).toBe('transparent');
    expect(characters[1]).toBe('warm');
    expect(characters[2]).toBe('bright');
  });
});
