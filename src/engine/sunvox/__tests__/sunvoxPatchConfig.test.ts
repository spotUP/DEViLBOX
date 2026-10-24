import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_SUNVOX_PATCH_URL, listBundledSunVoxPresets, sunvoxPatchConfigFromFile, sunvoxPatchConfigFromUrl,
} from '../sunvoxPatchConfig';

describe('sunvoxPatchConfigFromFile', () => {
  it('builds a patch config from the file bytes and strips the extension from the name', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { name, config } = await sunvoxPatchConfigFromFile(new File([bytes], 'Fat Bass.SunSynth'));
    expect(name).toBe('Fat Bass');
    expect(config.patchName).toBe('Fat Bass');
    expect(config.isSong).toBe(false);
    expect(config.controlValues).toEqual({});
    expect(new Uint8Array(config.patchData!)).toEqual(bytes);
  });
});

describe('bundled SunVox presets', () => {
  it('lists every bundled instrument (sunsynth, xi, wav) grouped by category', () => {
    const presets = listBundledSunVoxPresets();
    // 528 .sunsynth + 65 .xi + 28 .wav in public/data/instruments/sunvox/instruments
    expect(presets).toHaveLength(621);
    expect(new Set(presets.map(p => p.category.split('/')[0]))).toEqual(new Set(
      ['bass', 'bell', 'drums', 'fx', 'guitar', 'keyboard', 'pads', 'strings', 'various', 'wind'],
    ));
    // Pack subfolders are walked too.
    expect(presets.find(p => p.name === 'Needle Bass')?.category).toBe('bass/Elfferich Big basses pack');
    const analog = presets.find(p => p.name === 'ACheney Analog Synth');
    expect(analog?.url).toBe(DEFAULT_SUNVOX_PATCH_URL);
  });

  it('loads a picked preset by URL into a replace-graph patch config', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fetchMock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { name, config } = await sunvoxPatchConfigFromUrl('/data/instruments/sunvox/instruments/bass/Deep%20Bass.xi');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(name).toBe('Deep Bass');
      expect(config.isSong).toBe(false);
      expect(config.noteTargetModuleId).toBeUndefined();
      expect(new Uint8Array(config.patchData!)).toEqual(bytes);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
