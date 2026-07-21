/**
 * Regression: Firefox boot crash "param must be an AudioParam".
 *
 * Firefox does not implement the nine AudioListener AudioParams
 * (positionX..upZ). ToneEngine hands Tone.js a raw native AudioContext, and
 * Tone's Listener wraps those params at context init — undefined params made
 * Tone's Param constructor throw at boot for every Firefox user
 * (field report 2026-07-21, Firefox 152/Win64).
 */
import { describe, it, expect } from 'vitest';
import {
  shimAudioListenerParams,
  LISTENER_PARAMS,
  type ShimmableAudioContext,
} from '../firefoxAudioListenerShim';

function makeFakeParam(value = 0) {
  return { value };
}

function makeFirefoxLikeContext(): ShimmableAudioContext & { created: number } {
  const ctx = {
    created: 0,
    // Firefox: AudioListener exposes only setPosition()/setOrientation(),
    // none of the AudioParam members.
    listener: {} as object,
    createConstantSource() {
      ctx.created++;
      return { offset: makeFakeParam() };
    },
  };
  return ctx;
}

function makeChromeLikeContext(): ShimmableAudioContext & { created: number } {
  const listener: Record<string, unknown> = {};
  for (const { name, defaultValue } of LISTENER_PARAMS) {
    listener[name] = makeFakeParam(defaultValue);
  }
  const ctx = {
    created: 0,
    listener,
    createConstantSource() {
      ctx.created++;
      return { offset: makeFakeParam() };
    },
  };
  return ctx;
}

describe('shimAudioListenerParams', () => {
  it('donates all nine listener params on a Firefox-like context', () => {
    const ctx = makeFirefoxLikeContext();
    const shimmed = shimAudioListenerParams(ctx);

    expect(shimmed).toBe(9);
    expect(ctx.created).toBe(9);
    const listener = ctx.listener as Record<string, { value: number }>;
    for (const { name, defaultValue } of LISTENER_PARAMS) {
      // The exact failure mode of the bug: these were undefined on Firefox.
      expect(listener[name]).toBeDefined();
      expect(listener[name].value).toBe(defaultValue);
    }
  });

  it('leaves a Chrome-like context untouched', () => {
    const ctx = makeChromeLikeContext();
    const before = { ...(ctx.listener as Record<string, unknown>) };

    const shimmed = shimAudioListenerParams(ctx);

    expect(shimmed).toBe(0);
    expect(ctx.created).toBe(0);
    const listener = ctx.listener as Record<string, unknown>;
    for (const { name } of LISTENER_PARAMS) {
      expect(listener[name]).toBe(before[name]);
    }
  });

  it('fills only the missing params on a partially implemented listener', () => {
    const ctx = makeFirefoxLikeContext();
    (ctx.listener as Record<string, unknown>).positionX = makeFakeParam(42);

    const shimmed = shimAudioListenerParams(ctx);

    expect(shimmed).toBe(8);
    const listener = ctx.listener as Record<string, { value: number }>;
    expect(listener.positionX.value).toBe(42);
    expect(listener.upY.value).toBe(1);
  });
});
