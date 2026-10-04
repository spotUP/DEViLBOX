/**
 * Solo and mute must reach every native engine that can take a mask.
 *
 * The mixer kept a hand-written list of engine imports beside WASM_ENGINES.
 * FredReplayerEngine (and Oktalyzer, Dss, Synthesis, SoundFactory2, Asap)
 * implement setMuteMask and were never on it: solo did nothing on
 * `fireworks ii.fred` (2026-10-03, RMS unchanged across all / ch0 / ch3).
 */
import { describe, it, expect } from 'vitest';
import { muteRegistrationFor, collectMuteRegistrations } from '@/lib/mixer/engineMuteRegistry';

class Bitmask { static hasInstance() { return false; } setMuteMask(_m: number) {} }
class GainOnly { static hasInstance() { return false; } setChannelGain(_c: number, _g: number) {} }
class Neither { static hasInstance() { return false; } }
class NoSingleton { setMuteMask(_m: number) {} }

describe('muteRegistrationFor', () => {
  it('classes with a singleton and setMuteMask take the bitmask', () => {
    expect(muteRegistrationFor('a', Bitmask)).toMatchObject({ key: 'a', bitmask: true, gain: false });
  });
  it('classes with setChannelGain only take the gain path', () => {
    expect(muteRegistrationFor('b', GainOnly)).toMatchObject({ bitmask: false, gain: true });
  });
  it('classes that can mute nothing, or have no singleton, are not registered', () => {
    expect(muteRegistrationFor('c', Neither)).toBeNull();
    expect(muteRegistrationFor('d', NoSingleton as unknown as typeof Bitmask)).toBeNull();
    expect(muteRegistrationFor('e', null)).toBeNull();
  });
});

describe('the engine registry is the one source', () => {
  it('resolves the engines the hand list never had', async () => {
    const { WASM_ENGINES } = await import('@/engine/replayer/NativeEngineRouting');
    const regs = await collectMuteRegistrations(WASM_ENGINES);
    const bitmask = new Set(regs.filter(r => r.bitmask).map(r => r.key));
    for (const key of ['FredReplayer2', 'OktalyzerReplayer', 'DssReplayer', 'SynthesisReplayer', 'SoundFactory2Replayer', 'Asap', 'MusicLine']) {
      expect(bitmask.has(key), key).toBe(true);
    }
  }, 60_000);

  it('the mixer registers them after warm-up', async () => {
    const mod = await import('@/stores/useMixerStore');
    await mod.muteRegistryReady;
    const names = mod.muteMaskEngineNames();
    expect(names, names.join(',')).toContain('FredReplayer2');
    expect(names).toContain('OktalyzerReplayer');
  }, 60_000);
});
