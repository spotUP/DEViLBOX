/**
 * Engine worklet nodes declare only the dub outputs their voices can fill
 * (plan 2026-09-29-per-channel-dub-outputs, P6).
 *
 * Measured in Chrome (OfflineAudioContext, 20 nodes x 30 s): each declared
 * AudioWorkletNode output costs ~0.73 µs of audio-thread time per quantum,
 * connected or not — 1 output 1.8 µs, 9 outputs 7.2 µs, 37 outputs 28.2 µs.
 * Stopped engines are not disposed, so every format opened in a session kept
 * a 37-output node alive: ten formats took ~11 % of the 2.67 ms budget.
 *
 * Fails on revert: a fixed 37-output channelOutputNodeOptions() gives a
 * 4-voice engine 37 outputs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { channelOutputNodeOptions, CHANNEL_OUTPUT_COUNT } from '../wasm/WASMSingletonBase';

function engineSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : engineSources(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('engine worklet nodes declare only the outputs their voices fill', () => {
  it('a 4-voice engine gets main + 4 isolation slots + 4 dub sends', () => {
    expect(channelOutputNodeOptions(4).numberOfOutputs).toBe(9);
    expect(channelOutputNodeOptions(4).outputChannelCount).toEqual(new Array(9).fill(2));
    expect(channelOutputNodeOptions(8).numberOfOutputs).toBe(13);
    expect(channelOutputNodeOptions(64).numberOfOutputs).toBe(CHANNEL_OUTPUT_COUNT);
  });

  it('every engine passes its voice count, and none asks for the 32-send maximum', () => {
    const calls = engineSources(join(__dirname, '..'))
      .filter((f) => !f.endsWith('WASMSingletonBase.ts'))
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/channelOutputNodeOptions\(([^)]*)\)/g)].map((m) => ({ f, arg: m[1] })));
    expect(calls.length).toBeGreaterThanOrEqual(27);
    for (const { f, arg } of calls) {
      expect(arg, f).toMatch(/^\d+$/);
      expect(Number(arg), f).toBeLessThanOrEqual(8);
    }
  });
});
