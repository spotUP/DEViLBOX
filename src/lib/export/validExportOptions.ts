/**
 * The one answer to "which export options are valid for the loaded song". The Export dialog shows exactly
 * these buttons (invalid ones are hidden, not disabled); MCP export tools ask the same function.
 * Per-format ROM/AY/Furnace conditions stay with their own exporters (passed in as flags); the tracker-module
 * conditions are derived here from what the writers do:
 *  - MOD/XM/IT/S3M (OpenMPTExporter) write sample data for Sampler/Player instruments only, and truncate
 *    channels above the format limit (ModuleExportPanel CHANNEL_MAX): a synth-only song would come out silent.
 *  - Chip log (VGM/SAP/...) is built from recorded chip register writes, so only a song with synth voices has any.
 */
import type { ExportMode } from '@/hooks/dialogs/useExportDialog';

/** Channel limits of the OpenMPT module writers (same table the module panel clamps to). */
export const MODULE_CHANNEL_MAX = { mod: 32, xm: 32, it: 64, s3m: 32 } as const;

export interface ValidExportInput {
  /** Largest channel count over all patterns. */
  maxChannels: number;
  instrumentCount: number;
  /** synthType of each instrument. */
  synthTypes: readonly string[];
  /** Formats the song's own native player exporters accept. */
  nativeAvailable: boolean;
  adfAvailable: boolean;
  isFurnaceEditor: boolean;
  furnaceModuleAvailable: boolean;
  furnaceAyAvailable: { arcade: boolean; vectrex: boolean; zx128: boolean; zxbeeper: boolean };
  gbRom: boolean; mdRom: boolean; pceRom: boolean; c64Prg: boolean; smsRom: boolean;
  nesRom: boolean; quadTone: boolean; tad: boolean;
}

const isSampleVoice = (t: string) => t === 'Sampler' || t === 'Player';

export function validExportOptions(i: ValidExportInput): Set<ExportMode> {
  const v = new Set<ExportMode>(['song', 'audio', 'midi']); // valid for every song
  if (i.instrumentCount > 0) { v.add('instrument'); v.add('sfx'); v.add('nano'); }
  const hasSamples = i.synthTypes.some(isSampleVoice);
  for (const f of ['mod', 'xm', 'it', 's3m'] as const) {
    if (hasSamples && i.maxChannels <= MODULE_CHANNEL_MAX[f]) v.add(f);
  }
  if (i.synthTypes.some((t) => !isSampleVoice(t))) v.add('chip');
  const add = (ok: boolean, ...modes: ExportMode[]) => { if (ok) modes.forEach((m) => v.add(m)); };
  add(i.isFurnaceEditor || i.furnaceModuleAvailable, 'fur', 'furText');
  add(i.furnaceAyAvailable.arcade || i.furnaceAyAvailable.vectrex || i.furnaceAyAvailable.zx128 || i.furnaceAyAvailable.zxbeeper, 'furAy');
  add(i.furnaceAyAvailable.zx128, 'zxTap');
  add(i.furnaceAyAvailable.vectrex, 'vectrexCart');
  add(i.furnaceAyAvailable.zxbeeper, 'zxBeeperTap');
  add(i.gbRom, 'gbRom'); add(i.mdRom, 'mdRom'); add(i.pceRom, 'pceRom'); add(i.c64Prg, 'c64Prg');
  add(i.smsRom, 'smsRom', 'ggRom'); add(i.nesRom, 'nesRom', 'nsfe');
  add(i.quadTone, 'zxQuadToneTap'); add(i.tad, 'snesRom', 'tad');
  add(i.nativeAvailable, 'native'); add(i.adfAvailable, 'adf');
  return v;
}
