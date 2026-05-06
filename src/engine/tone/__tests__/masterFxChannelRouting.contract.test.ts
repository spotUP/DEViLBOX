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
 * Bug 3: canUseParameterUpdatePath assumed isolation was available when
 * _cachedGetTrackerReplayer was null (never populated because no WASM engine ran).
 * This caused selectedChannels changes to skip the fast path and trigger full
 * chain rebuilds — audible audio dropouts on every channel button click.
 *
 * Fix: the rebuild path checks both engine availability AND that no instruments
 * are "replaced" by native synths (hybrid playback). The fast-path check
 * conservatively assumes isolation is NOT available when the replayer getter
 * hasn't been cached yet.
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

  it('falls back to isolation=false when cached replayer getter is unavailable', () => {
    // canUseParameterUpdatePath must NOT assume isolation is available when
    // _cachedGetTrackerReplayer is null — this means no WASM engine ever ran.
    const canUseFn = src.slice(
      src.indexOf('export function canUseParameterUpdatePath'),
      src.indexOf('export function updateEffectParameters'),
    );
    expect(canUseFn).toContain('!_cachedGetTrackerReplayer');
    expect(canUseFn).toContain('isolationAvailable = false');
  });
});
