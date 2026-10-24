/**
 * sunvoxPatchConfig — the one place a SunVox patch file becomes a SunVoxConfig.
 * Used by the import dialog (new instrument) and the SunVox editor's Load Patch (this instrument).
 */
import type { SunVoxConfig } from '@typedefs/instrument';

/** Extensions routed to the SunVox patch loader (UnifiedFileLoader routes .sunsynth). */
export const SUNVOX_PATCH_ACCEPT = '.sunsynth';

export async function sunvoxPatchConfigFromFile(file: File): Promise<{ name: string; config: SunVoxConfig }> {
  const patchData = await file.arrayBuffer();
  const name = file.name.replace(/\.sunsynth$/i, '');
  return { name, config: { patchData, patchName: name, isSong: false, controlValues: {} } };
}
