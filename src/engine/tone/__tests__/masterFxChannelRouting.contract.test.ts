/**
 * Contract test: master FX channel routing must check for a live isolation engine
 * AND verify no hybrid playback (native synths) is active.
 *
 * Bug 1: clicking a channel number in the master FX panel killed ALL effects.
 * Root cause: `buildMasterEffectsChain` used the static `supportsChannelIsolation`
 * check. In classic mode with Tone.js synths (no WASM worklet), effects vanished.
 *
 * Bug 2: effects still died when LibopenmptEngine WAS running but hybrid playback
 * was active (Tone.js synths replacing WASM channels). WASM isolation only captures
 * the worklet output, not native synth audio — so the effect heard nothing.
 *
 * Fix: the rebuild path checks both engine availability AND that no instruments
 * are "replaced" by native synths (hybrid playback).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Master FX channel routing', () => {
  const src = read('src/engine/tone/MasterEffectsChain.ts');

  it('checks for active isolation engine before filtering channel-targeted effects', () => {
    expect(src).toContain('getActiveIsolationEngine');
  });

  it('checks for hybrid playback (replaced instruments) before enabling isolation', () => {
    // Both rebuildMasterEffects and canUseParameterUpdatePath must gate isolation
    // on whether native synths have replaced WASM channels.
    const rebuildFn = src.slice(
      src.indexOf('export async function rebuildMasterEffects'),
      src.indexOf('export function canUseParameterUpdatePath'),
    );
    expect(rebuildFn).toContain('hasReplacedInstruments');

    const canUseFn = src.slice(
      src.indexOf('export function canUseParameterUpdatePath'),
      src.indexOf('export function updateEffectParameters'),
    );
    expect(canUseFn).toContain('hasReplacedInstruments');
  });

  it('does not use only the static supportsChannelIsolation check for filtering', () => {
    const rebuildFn = src.slice(
      src.indexOf('export async function rebuildMasterEffects'),
      src.indexOf('export function canUseParameterUpdatePath'),
    );
    expect(rebuildFn).toContain('engine !== null');
    expect(rebuildFn).toContain('engine.isAvailable()');
  });
});
