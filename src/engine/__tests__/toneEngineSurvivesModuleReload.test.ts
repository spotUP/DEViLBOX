/**
 * One ToneEngine, one DEViLBOX AudioContext, per page - even when Vite HMR
 * evaluates the engine or audio-context module a second time.
 *
 * Regression (2026-10-19): editing an engine-side file while the rigged song
 * played re-evaluated ToneEngine.ts. The new module copy's `static instance`
 * was null, so getInstance() built a second engine with a second
 * AudioContext and re-pointed getDevilboxAudioContext() to it. Every synth
 * created afterwards (the per-channel TB303 and DX7 instances built at play
 * time) landed on that orphan context, whose clock sat ~15 minutes behind the
 * live engine that scheduled their notes. Pattern playback was silent while
 * direct triggers, on instances created earlier, still sounded.
 *
 * `vi.resetModules()` gives the next import a fresh module copy, which is what
 * an HMR re-evaluation does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forgetAudioGlobals } from './forgetAudioGlobals';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

beforeEach(() => {
  vi.resetModules();
  forgetAudioGlobals();
});

describe('DEViLBOX audio context across module copies', () => {
  it('is read back by a second copy of audio-context.ts', async () => {
    const first = await import('../../utils/audio-context');
    const ctx = { currentTime: 1 } as unknown as AudioContext;
    first.setDevilboxAudioContext(ctx);

    vi.resetModules();
    const second = await import('../../utils/audio-context');
    expect(second).not.toBe(first);
    expect(second.getDevilboxAudioContext()).toBe(ctx);
  });

  it('still throws before any engine registered one', async () => {
    const { getDevilboxAudioContext } = await import('../../utils/audio-context');
    expect(() => getDevilboxAudioContext()).toThrow('not initialized');
  });
});

describe('globalSingleton across module copies', () => {
  it('returns the instance the first copy created instead of building a second', async () => {
    let built = 0;
    const first = await import('../../utils/globalSingleton');
    const a = first.globalSingleton('probe', () => ({ id: ++built }));

    vi.resetModules();
    const second = await import('../../utils/globalSingleton');
    const b = second.globalSingleton('probe', () => ({ id: ++built }));

    expect(b).toBe(a);
    expect(built).toBe(1);
  });

  it('builds a new instance after the old one is cleared', async () => {
    const { globalSingleton, clearGlobalSingleton } = await import('../../utils/globalSingleton');
    const a = globalSingleton('probe', () => ({}));
    clearGlobalSingleton('probe');
    expect(globalSingleton('probe', () => ({}))).not.toBe(a);
  });
});

describe('ToneEngine.getInstance', () => {
  // The engine constructor builds the whole audio graph, so the wiring is
  // checked by reading the source, as retriggerRespectsMute.test.ts does.
  const src = readFileSync(resolve(ROOT, 'engine/ToneEngine.ts'), 'utf8');

  it('creates the engine through globalSingleton', () => {
    const m = src.match(/public static getInstance\(\): ToneEngine \{([\s\S]*?)\n {2}\}/);
    expect(m, 'getInstance should exist').not.toBeNull();
    expect(m![1]).toContain('globalSingleton(TONE_ENGINE_SINGLETON');
    expect(m![1]).toContain('new ToneEngine()');
  });

  it('clears the page-level instance on dispose', () => {
    expect(src).toContain('ToneEngine.instance = null;\n    clearGlobalSingleton(TONE_ENGINE_SINGLETON);');
  });
});
