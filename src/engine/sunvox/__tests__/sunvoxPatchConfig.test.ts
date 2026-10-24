import { describe, it, expect } from 'vitest';
import { sunvoxPatchConfigFromFile } from '../sunvoxPatchConfig';

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
