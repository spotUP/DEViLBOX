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
  // noteTargetModuleId cleared: the instrument store merges sunvox, and the old graph's id means nothing here.
  return { name, config: { patchData, patchName: name, isSong: false, controlValues: {}, noteTargetModuleId: undefined } };
}

/**
 * A whole .sunvox song played by its own sequencer, not an instrument graph.
 * Instrument graphs are saved as song bytes too, but always carry a note
 * target (the generator notes go to, -1 when the graph has none).
 */
export function isSunVoxSongPlayer(sunvox: SunVoxConfig | undefined): boolean {
  return !!sunvox?.patchData && sunvox.isSong === true && sunvox.noteTargetModuleId === undefined;
}
