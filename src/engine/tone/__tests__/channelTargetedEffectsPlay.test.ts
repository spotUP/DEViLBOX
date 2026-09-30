/**
 * Master effects aimed at channels play on songs from every isolation engine.
 *
 * Owner, 2026-09-30: "i managed to kill the master effects by clicking the
 * numbered channel buttons". On a Hively song, deselecting channel 1 sent
 * Neural, EQ3 and Reverb to channels 2-4: they left the master chain, and the
 * isolation slots meant to carry them stayed empty. Two causes:
 *  - HivelyEngine and UADEEngine overrode getAudioContext() with
 *    `getDevilboxAudioContext().rawContext`, but that is the native context,
 *    which has no rawContext: always null, and the slot builder skipped every
 *    channel without a word.
 *  - The slots were built only when the master chain was, so effects aimed at
 *    channels before a song's engine started never reached it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rebuildMasterEffects = vi.fn(async () => {});
const scheduleWasmEffectRebuild = vi.fn();
const effects = [{ id: 'a', type: 'Reverb', enabled: true, selectedChannels: [1, 2, 3] }];
vi.mock('@/stores/useAudioStore', () => ({ useAudioStore: { getState: () => ({ masterEffects: effects }) } }));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ rebuildMasterEffects }) }));
vi.mock('@/stores/useMixerStore', () => ({ scheduleWasmEffectRebuild }));

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('channel-targeted master effects', () => {
  beforeEach(() => { rebuildMasterEffects.mockClear(); scheduleWasmEffectRebuild.mockClear(); });

  it('Hively and UADE give their own AudioContext (the base class method), not a null rawContext', () => {
    expect(src('engine/wasm/WASMSingletonBase.ts')).toMatch(/export abstract class WASMSingletonBase[\s\S]*getAudioContext\(\): AudioContext \| null \{\n\s*return this\.audioContext;/);
    for (const f of ['engine/hively/HivelyEngine.ts', 'engine/uade/UADEEngine.ts']) {
      expect(src(f), f).not.toMatch(/getAudioContext\(\)[^{]*\{[^}]*rawContext/);
    }
  });

  it('a newly started engine rebuilds the chain and the slots', async () => {
    const { setPlayingIsolationEngine } = await import('../ChannelRoutedEffects');
    const engine = { addIsolation() {}, removeIsolation() {}, isAvailable: () => true } as never;
    setPlayingIsolationEngine(engine);
    await vi.waitFor(() => expect(scheduleWasmEffectRebuild).toHaveBeenCalled());
    expect(rebuildMasterEffects).toHaveBeenCalledWith(effects);
    // The same engine again changes nothing.
    rebuildMasterEffects.mockClear(); scheduleWasmEffectRebuild.mockClear();
    setPlayingIsolationEngine(engine);
    await new Promise((r) => setTimeout(r, 20));
    expect(scheduleWasmEffectRebuild).not.toHaveBeenCalled();
  });
});
