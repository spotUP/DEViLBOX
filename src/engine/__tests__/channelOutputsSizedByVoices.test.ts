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

/**
 * Engines whose node is sized by the song they loaded, not by a literal: the source file -> the test that proves, with the
 * real engine and worklet, that the node has exactly the loaded song's voice count (outputs 1 + 4 + voices).
 */
const SIZED_BY_THE_LOADED_SONG: Readonly<Record<string, string>> = {
  'nuade/NuadeEngine.ts': 'nuade/__tests__/nuadeNodeVoices.test.ts',
};
const PROOF_TITLE = "describe('NuadeEngine node is sized by the loaded song'";

/**
 * Engines whose replayer carries more than 8 voices: the source file -> the voice count of the replayer's channel table.
 * JayTrax: jxs-wasm/src/jxs_wasm.cpp, "Voices in the song (1..16)", channel arrays indexed c < 16.
 */
const MORE_THAN_EIGHT_VOICES: Readonly<Record<string, number>> = {
  'jxs/JxsEngine.ts': 16,
};

/** The argument as a number: a literal, or a constant the same file defines as a literal. */
function voiceCount(source: string, arg: string): string {
  const name = arg.trim();
  if (/^\d+$/.test(name)) return name;
  return source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)\\s*;`))?.[1] ?? name;
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
      const proof = Object.entries(SIZED_BY_THE_LOADED_SONG).find(([file]) => f.endsWith(file))?.[1];
      if (proof) {
        // Not a literal: the engine must prove the node is the loaded song's size, and never above the 8-voice cap.
        expect(readFileSync(join(__dirname, '..', proof), 'utf8'), `${f} is sized per song: ${proof} must prove it`).toContain(PROOF_TITLE);
        continue;
      }
      const count = voiceCount(readFileSync(f, 'utf8'), arg);
      expect(count, f).toMatch(/^\d+$/);
      const cap = Object.entries(MORE_THAN_EIGHT_VOICES).find(([file]) => f.endsWith(file))?.[1] ?? 8;
      expect(Number(count), f).toBeLessThanOrEqual(cap);
    }
  });
});
