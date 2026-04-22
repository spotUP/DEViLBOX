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

  it('mixer store uses getActiveDubBus (sync) not async import', () => {
    // Must NOT use async import for SID dub send routing
    expect(mixerSrc).not.toMatch(/import\s*\(\s*['"].*useMIDIPadRouting['"]\s*\)/);
    // Must use synchronous getActiveDubBus
    expect(mixerSrc).toContain('getActiveDubBus');
  });

  it('mixer store calls setSidVoiceDubSend and returns early if handled', () => {
    expect(mixerSrc).toContain('setSidVoiceDubSend');
    // Should return early when SID handles it
    expect(mixerSrc).toMatch(/setSidVoiceDubSend.*\n.*return.*handled/s);
  });
});
