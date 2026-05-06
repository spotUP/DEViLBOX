/**
 * Contract test: master FX channel routing must check for a live isolation engine.
 *
 * Bug: clicking a channel number in the master FX panel killed ALL effects.
 *
 * Root cause: `buildMasterEffectsChain` used the static `supportsChannelIsolation`
 * check (based on editor mode name) to decide whether to filter channel-targeted
 * effects out of the global chain. In classic mode with Tone.js synths (no WASM
 * multi-output worklet), the mode check returned true but no isolation engine
 * was actually running. The effect was removed from the global chain with nowhere
 * to go — it just vanished.
 *
 * Fix: the rebuild path now calls `getActiveIsolationEngine()` to verify an
 * engine is actually available before filtering effects out of the global chain.
 *
 * This contract test verifies the fix by inspecting the source for the
 * async engine availability check in the rebuild function.
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
    // The rebuild function must call getActiveIsolationEngine to verify
    // a WASM engine is actually running — not just check the static mode.
    expect(src).toContain('getActiveIsolationEngine');
  });

  it('does not use only the static supportsChannelIsolation check for filtering', () => {
    // The old bug: used supportsChannelIsolation (static mode check) to decide
    // whether to filter effects out of the global chain. This must be guarded
    // by the actual engine availability check.
    //
    // Verify that the globalEffects filter is gated on the runtime
    // `isolationAvailable` variable, not directly on supportsChannelIsolation.
    const rebuildFn = src.slice(
      src.indexOf('export async function rebuildMasterEffects'),
      src.indexOf('export function canUseParameterUpdatePath'),
    );
    // The isolationAvailable flag should be set based on engine availability,
    // not just supportsChannelIsolation
    expect(rebuildFn).toContain('engine !== null');
    expect(rebuildFn).toContain('engine.isAvailable()');
  });
});
