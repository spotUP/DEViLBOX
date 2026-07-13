/**
 * Contract test: every native-audition synth must be a SHARED singleton in
 * ToneEngine.getInstrument.
 *
 * Background (the SunTronic audition-churn bug, 2026-07-13):
 * `getInstrument` keys instruments per-channel UNLESS their synthType is in the
 * `isWASMSynth` shared-instance list, in which case it keys them as one
 * singleton per instrument id (`getInstrumentKey(id, -1)`).
 *
 * A native-audition synth (listed in `NATIVE_AUDITION_SYNTHS` in withFallback.ts)
 * is triggered from BOTH the preview path (`getInstrument(id, cfg)`, no
 * channelIndex) and the playback path (`getInstrument(id, cfg, channelIndex)`).
 * If its synthType is missing from `isWASMSynth`, those two paths build DIFFERENT
 * instances: the effect chain wires to instance #1, the audition triggers an
 * unwired instance #6+ → silent audition (no error, no crash). That was
 * SunTronicSynth: present in the createInstrument switch but absent from
 * `isWASMSynth`.
 *
 * Invariant: NATIVE_AUDITION_SYNTHS ⊆ isWASMSynth. Static source scan, no audio.
 *
 * Fails on revert: remove `'SunTronicSynth'` from the ToneEngine list and this
 * test fails.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8');
}

/** Extract the string entries of the `const NATIVE_AUDITION_SYNTHS = new Set([...])` literal. */
function nativeAuditionSynths(): string[] {
  const src = read('lib/import/parsers/withFallback.ts');
  const m = src.match(/NATIVE_AUDITION_SYNTHS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  expect(m, 'NATIVE_AUDITION_SYNTHS Set literal not found in withFallback.ts').toBeTruthy();
  return [...m![1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

/** Extract the string entries of the `const isWASMSynth = [...].includes(...)` array literal. */
function isWASMSynthList(): string[] {
  const src = read('engine/ToneEngine.ts');
  const m = src.match(/const isWASMSynth\s*=\s*\[([\s\S]*?)\]\.includes\(/);
  expect(m, 'isWASMSynth array literal not found in ToneEngine.ts').toBeTruthy();
  return [...m![1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

describe('native-audition synths are shared singletons in ToneEngine', () => {
  const audition = nativeAuditionSynths();
  const shared = new Set(isWASMSynthList());

  it('there is at least one native-audition synth (SunTronic pilot)', () => {
    expect(audition).toContain('SunTronicSynth');
  });

  it.each(audition)(
    '%s is in the isWASMSynth shared-instance list (else audition builds an unwired instance)',
    (synthType) => {
      expect(
        shared.has(synthType),
        `${synthType} is a native-audition synth but MISSING from isWASMSynth in ToneEngine.ts. ` +
          `getInstrument will key it per-channel, so preview and playback build different ` +
          `instances and the audition plays through an unwired effect chain (silent).`,
      ).toBe(true);
    },
  );
});
