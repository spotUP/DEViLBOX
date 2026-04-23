/**
 * Regression tests for the SID dub bus signal chain.
 *
 * Bug: SID audio permanently bled into echo/reverb because:
 *   1. Dub send baseline was 0.4 (40% of signal always went to wet chain)
 *   2. Channel sliders used worklet path which doesn't know about SID
 *   3. Per-voice taps weren't controllable from the mixer UI
 *
 * Fix: Baseline→0, getActiveDubBus() singleton, setSidVoiceDubSend() method.
 */
import { describe, it, expect } from 'vitest';

// ── Source contracts (grep-based) ───────────────────────────────────────────
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = (...p: string[]) => join(__dirname, '..', '..', '..', ...p);

describe('SID dub bus baseline', () => {
  const c64Src = readFileSync(SRC('engine', 'C64SIDEngine.ts'), 'utf8');
  const routingSrc = readFileSync(SRC('engine', 'replayer', 'NativeEngineRouting.ts'), 'utf8');
  const dubBusSrc = readFileSync(SRC('engine', 'dub', 'DubBus.ts'), 'utf8');
  const mixerSrc = readFileSync(SRC('stores', 'useMixerStore.ts'), 'utf8');

  it('C64SIDEngine.connectDubSend defaults to 0 (silent at rest)', () => {
    // The default amount parameter must be 0, not 0.4
    expect(c64Src).toMatch(/connectDubSend\([^)]*amount\s*=\s*0\)/);
  });

  it('NativeEngineRouting passes 0 baseline to connectDubSend and registerSidDubSend', () => {
    expect(routingSrc).toContain('connectDubSend(dubInput, 0)');
    expect(routingSrc).toContain('registerSidDubSend(sendGain, 0)');
  });

  it('DubBus exports getActiveDubBus singleton accessor', () => {
    expect(dubBusSrc).toContain('export function getActiveDubBus()');
    expect(dubBusSrc).toContain('_activeDubBus');
  });

  it('DubBus.setSidVoiceDubSend exists and returns boolean', () => {
    expect(dubBusSrc).toMatch(/setSidVoiceDubSend\(voiceIndex:\s*number,\s*amount:\s*number\):\s*boolean/);
  });

  it('DubBus.setSidVoiceDubSend has whole-mix fallback for websid (no per-voice taps)', () => {
    // When there are no per-voice taps (websid), the method should
    // fall back to controlling the whole-mix _sidDubSendGain
    expect(dubBusSrc).toContain('_sidChannelDubSends');
    expect(dubBusSrc).toContain('_sidDubSendGain');
    // Path 2 comment documents the websid fallback
    expect(dubBusSrc).toMatch(/websid.*no per-voice output/i);
  });

  it('mixer store uses getActiveDubBus (sync) not async import', () => {
    // Must NOT use async import for SID dub send routing
    expect(mixerSrc).not.toMatch(/import\s*\(\s*['"].*useMIDIPadRouting['"]\s*\)/);
    // Must use synchronous getActiveDubBus
    expect(mixerSrc).toContain('getActiveDubBus');
  });

  it('mixer store calls setSidVoiceDubSend and short-circuits tracker path when SID handles it', () => {
    expect(mixerSrc).toContain('setSidVoiceDubSend');
    // Should flag SID-handled and skip the ChannelRoutedEffects path
    expect(mixerSrc).toMatch(/setSidVoiceDubSend[\s\S]*handledBySid\s*=\s*true/);
    expect(mixerSrc).toMatch(/if\s*\(\s*!handledBySid\s*\)/);
  });

  // ── SID make-up boost when dub bus is enabled ─────────────────────────
  // The SID's dry signal sits ~6 dB below the perceived loudness of the
  // dub wet chain. When the user turns the dub bus on we ramp the SID
  // master up, and we MUST ramp it back to 1.0 on disable so the SID
  // doesn't get stuck amplified when the user toggles dub off.
  it('C64SIDEngine exposes setDubBoost that applies engineGain * boost', () => {
    expect(c64Src).toContain('setDubBoost(boost: number)');
    // The effective gain must multiply ENGINE_GAIN by the clamped boost
    expect(c64Src).toMatch(/engineGain\s*\*\s*b/);
    // Must also cover the jsSID setVolume path
    expect(c64Src).toMatch(/setDubBoost[\s\S]*setVolume\(this\.masterVolume\s*\*\s*target\)/);
  });

  it('DubBus has registerSidBoostHandler and ramps on enable/disable', () => {
    expect(dubBusSrc).toContain('registerSidBoostHandler');
    expect(dubBusSrc).toContain('_sidBoostHandler');
    // The enable/disable branch in setSettings must call the handler with
    // boost on enable and 1 on disable.
    expect(dubBusSrc).toMatch(
      /_sidBoostHandler[\s\S]{0,400}settings\.enabled\s*\?\s*this\._sidBoostAmount\s*:\s*1/,
    );
  });

  it('DubBus.disableSIDMode restores SID master boost to 1', () => {
    // If dub stays enabled while SID engine goes away, we must unboost
    // before clearing state or a later non-SID engine reusing the handler
    // slot would inherit a stuck 2x gain.
    expect(dubBusSrc).toMatch(/disableSIDMode[\s\S]{0,400}_sidBoostHandler[\s\S]{0,100}\(1\)/);
  });

  it('NativeEngineRouting registers the SID boost handler on init', () => {
    expect(routingSrc).toContain('registerSidBoostHandler');
    expect(routingSrc).toMatch(/setDubBoost\(boost\)/);
  });
});
