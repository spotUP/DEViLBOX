/**
 * set_master_effects keeps every field of an effect config.
 *
 * The handler rebuilt each effect from five fields and dropped the rest, so a
 * GuitarML amp arrived without its neuralModelIndex and ran as a
 * pass-through: every neural amp in the 2026-09-29 master FX sweep read 0 dB.
 */
import { describe, it, expect } from 'vitest';
import { setMasterEffects } from '../handlers/writeHandlers';
import { useAudioStore } from '@stores/useAudioStore';

describe('set_master_effects', () => {
  it('passes the neural model and channel routing through', () => {
    setMasterEffects({ effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 100, parameters: { drive: 50 }, neuralModelIndex: 7, neuralModelName: 'Blackstar HT40' },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: {}, selectedChannels: [1] },
    ] });
    const [amp, comp] = useAudioStore.getState().masterEffects;
    expect(amp).toMatchObject({ type: 'Neural', neuralModelIndex: 7, neuralModelName: 'Blackstar HT40', parameters: { drive: 50 } });
    expect(comp).toMatchObject({ type: 'Compressor', selectedChannels: [1] });
    expect(amp.id).toMatch(/^audit-fx-/);
  });
});
