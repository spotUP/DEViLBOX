import { describe, it, expect } from 'vitest';
import {
  nostalgicPlayerPresetToConfig,
  NOSTALGICPLAYER_BANKS,
  NOSTALGICPLAYER_BANK_SYNTH,
  isBankVisible,
} from '../nostalgicPlayerPresets';

describe('nostalgicPlayerPresetToConfig', () => {
  it('keeps the name, sets the synth type and carries the raw params unchanged', () => {
    const c = nostalgicPlayerPresetToConfig('SoundMonWasmSynth', { name: 'X', category: 'bass', params: { volume: 64, waveTable: 3 } });
    expect(c.name).toBe('X');
    expect(c.synthType).toBe('SoundMonWasmSynth');
    expect(c.parameters).toMatchObject({ volume: 64, waveTable: 3, presetCategory: 'bass' });
  });
  it('the 8 banks hold 130 presets in all, every entry on its own synth type', () => {
    expect(Object.keys(NOSTALGICPLAYER_BANKS)).toHaveLength(8);
    let total = 0;
    for (const [cat, bank] of Object.entries(NOSTALGICPLAYER_BANKS)) {
      total += bank.length;
      expect(bank.every((p) => p.synthType === NOSTALGICPLAYER_BANK_SYNTH[cat])).toBe(true);
    }
    expect(total).toBe(130);
  });
  it('a bank is hidden when the format cannot hold its synth type, shown when unlocked', () => {
    expect(isBankVisible('SoundMon', null)).toBe(true);
    expect(isBankVisible('SoundMon', ['Sampler'])).toBe(false);
    expect(isBankVisible('SoundMon', ['SoundMonWasmSynth'])).toBe(true);
    expect(isBankVisible('Bass', ['Sampler'])).toBe(true);
  });
});
