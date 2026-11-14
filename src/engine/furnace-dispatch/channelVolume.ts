/**
 * Volume maxima of Furnace chip channels (upstream GET_VOLMAX). Pure: no Tone, no runtime engine,
 * so byte writers such as FurnaceModuleExporter can use it outside the browser.
 */

import { FurnaceDispatchPlatform } from './platforms';
import { maxVolumeOfChipChannel } from './chipVoiceKinds';
import { synthTypeForPlatform } from './synthPlatforms';


/** Platform volume maximums (matching Furnace GET_VOLMAX per chip) */
// volMax values from upstream Furnace GET_VOLMAX dispatch (per-platform .cpp files).
// Some platforms have per-channel volMax (e.g. YM2608 FM=127, PSG=15, ADPCM-A=31, ADPCM-B=255).
// This table holds their FM value; maxVolumeOfChannel() below gives the value of one channel
// and is what live notes and cell volumes use.
export const PLATFORM_VOL_MAX: Record<number, number> = {
  // PSG / simple chips (4-bit volume = 15)
  [FurnaceDispatchPlatform.GB]: 15,
  [FurnaceDispatchPlatform.SMS]: 15,
  [FurnaceDispatchPlatform.NES]: 15,
  [FurnaceDispatchPlatform.AY]: 15,
  [FurnaceDispatchPlatform.C64_6581]: 15,
  [FurnaceDispatchPlatform.C64_8580]: 15,
  [FurnaceDispatchPlatform.SAA1099]: 15,
  [FurnaceDispatchPlatform.SCC]: 15,
  [FurnaceDispatchPlatform.SCC_PLUS]: 15,
  [FurnaceDispatchPlatform.VIC20]: 15,
  [FurnaceDispatchPlatform.TIA]: 15,
  [FurnaceDispatchPlatform.POKEY]: 15,
  [FurnaceDispatchPlatform.MMC5]: 15,
  [FurnaceDispatchPlatform.SWAN]: 15,
  [FurnaceDispatchPlatform.VRC6]: 15,        // pulse=15; saw (chan 2)=63 via maxVolumeOfChipChannel
  [FurnaceDispatchPlatform.VBOY]: 15,
  [FurnaceDispatchPlatform.N163]: 15,
  [FurnaceDispatchPlatform.OPLL]: 15,
  [FurnaceDispatchPlatform.T6W28]: 15,
  [FurnaceDispatchPlatform.NAMCO]: 15,
  [FurnaceDispatchPlatform.NAMCO_15XX]: 15,
  [FurnaceDispatchPlatform.NAMCO_CUS30]: 15,
  [FurnaceDispatchPlatform.BUBSYS_WSG]: 15,
  [FurnaceDispatchPlatform.X1_010]: 15,
  [FurnaceDispatchPlatform.K007232]: 15,
  [FurnaceDispatchPlatform.POWERNOISE]: 15,
  [FurnaceDispatchPlatform.SID2]: 15,
  [FurnaceDispatchPlatform.SUPERVISION]: 15,
  // 5-bit volume = 31
  [FurnaceDispatchPlatform.AY8930]: 31,
  [FurnaceDispatchPlatform.PCE]: 31,
  [FurnaceDispatchPlatform.SM8521]: 31,
  // 6-bit volume = 63
  [FurnaceDispatchPlatform.ESFM]: 63,
  [FurnaceDispatchPlatform.DAVE]: 63,
  [FurnaceDispatchPlatform.VERA]: 63,         // PSG=63; PCM (chan 16)=15 via maxVolumeOfChipChannel
  // OPL family (opl.cpp:2578-2583): 63 for FM; Y8950 ADPCM 255 and OPL4 PCM 127 via maxVolumeOfChipChannel
  [FurnaceDispatchPlatform.OPL]: 63,
  [FurnaceDispatchPlatform.OPL2]: 63,
  [FurnaceDispatchPlatform.OPL3]: 63,
  [FurnaceDispatchPlatform.OPL_DRUMS]: 63,
  [FurnaceDispatchPlatform.OPL2_DRUMS]: 63,
  [FurnaceDispatchPlatform.OPL3_DRUMS]: 63,
  [FurnaceDispatchPlatform.OPL4]: 63,
  [FurnaceDispatchPlatform.OPL4_DRUMS]: 63,
  [FurnaceDispatchPlatform.Y8950]: 63,
  [FurnaceDispatchPlatform.Y8950_DRUMS]: 63,
  // Special small volumes
  [FurnaceDispatchPlatform.FDS]: 32,
  [FurnaceDispatchPlatform.TED]: 8,
  [FurnaceDispatchPlatform.MSM6258]: 8,
  [FurnaceDispatchPlatform.MSM6295]: 8,
  [FurnaceDispatchPlatform.POKEMINI]: 2,
  [FurnaceDispatchPlatform.GBA_DMA]: 2,       // upstream gbadma.cpp returns 2
  [FurnaceDispatchPlatform.SFX_BEEPER]: 1,
  [FurnaceDispatchPlatform.SFX_BEEPER_QUADTONE]: 2,
  [FurnaceDispatchPlatform.PCSPKR]: 1,
  [FurnaceDispatchPlatform.PONG]: 1,
  [FurnaceDispatchPlatform.PV1000]: 1,
  [FurnaceDispatchPlatform.PET]: 1,
  // Sample-based (8-bit volume = 255)
  [FurnaceDispatchPlatform.QSOUND]: 255,
  [FurnaceDispatchPlatform.RF5C68]: 255,
  [FurnaceDispatchPlatform.GA20]: 255,
  [FurnaceDispatchPlatform.C140]: 255,
  [FurnaceDispatchPlatform.C219]: 255,
  [FurnaceDispatchPlatform.YMZ280B]: 255,
  [FurnaceDispatchPlatform.BIFURCATOR]: 255,
  [FurnaceDispatchPlatform.SID3]: 255,
  [FurnaceDispatchPlatform.GBA_MINMOD]: 255,
  // 7-bit volume = 127
  [FurnaceDispatchPlatform.SNES]: 127,
  [FurnaceDispatchPlatform.NDS]: 127,
  [FurnaceDispatchPlatform.LYNX]: 127,
  [FurnaceDispatchPlatform.GENESIS]: 127,
  [FurnaceDispatchPlatform.YM2612]: 127,
  [FurnaceDispatchPlatform.YM2612_EXT]: 127,
  [FurnaceDispatchPlatform.YM2612_DUALPCM]: 127,
  [FurnaceDispatchPlatform.YM2612_DUALPCM_EXT]: 127,
  [FurnaceDispatchPlatform.YM2612_CSM]: 127,
  [FurnaceDispatchPlatform.YM2151]: 127,
  [FurnaceDispatchPlatform.TX81Z]: 127,
  [FurnaceDispatchPlatform.ARCADE]: 127,
  [FurnaceDispatchPlatform.YM2203]: 127,      // FM=127, PSG=15 (per-channel)
  [FurnaceDispatchPlatform.YM2203_EXT]: 127,
  [FurnaceDispatchPlatform.YM2203_CSM]: 127,
  [FurnaceDispatchPlatform.YM2608]: 127,      // FM=127, PSG=15, ADPCM-A=31, ADPCM-B=255
  [FurnaceDispatchPlatform.YM2608_EXT]: 127,
  [FurnaceDispatchPlatform.YM2608_CSM]: 127,
  [FurnaceDispatchPlatform.YM2610_FULL]: 127,  // FM=127, PSG=15, ADPCM-A=31, ADPCM-B=255
  [FurnaceDispatchPlatform.YM2610_FULL_EXT]: 127,
  [FurnaceDispatchPlatform.YM2610_CSM]: 127,
  [FurnaceDispatchPlatform.YM2610B]: 127,
  [FurnaceDispatchPlatform.YM2610B_EXT]: 127,
  [FurnaceDispatchPlatform.YM2610B_CSM]: 127,
  [FurnaceDispatchPlatform.SEGAPCM]: 127,
  [FurnaceDispatchPlatform.K053260]: 127,
  [FurnaceDispatchPlatform.MSM5232]: 127,
  [FurnaceDispatchPlatform.MULTIPCM]: 127,
  [FurnaceDispatchPlatform.SOUND_UNIT]: 127,
  // Amiga (6-bit + sign = 64)
  [FurnaceDispatchPlatform.AMIGA]: 64,
};

export function getMaxVolume(platform: number): number {
  return PLATFORM_VOL_MAX[platform] ?? 127;
}

/**
 * Extended-FM chips: the base chip and the first of the four operator channels
 * that replace one FM channel (Furnace ym2610ext.cpp / ym2610bext.cpp, extChanOffs).
 */
const EXT_FM_LAYOUT: Readonly<Record<number, { base: number; extStart: number }>> = {
  [FurnaceDispatchPlatform.YM2610_FULL_EXT]: { base: FurnaceDispatchPlatform.YM2610_FULL, extStart: 1 },
  [FurnaceDispatchPlatform.YM2610B_EXT]: { base: FurnaceDispatchPlatform.YM2610B, extStart: 2 },
};

/** Volume maximum of one chip channel: the channel kind's own on a mixed-kind chip, else the platform's. */
export function maxVolumeOfChannel(platform: number, chan: number): number {
  const ext = EXT_FM_LAYOUT[platform];
  if (ext) {
    // The four operator channels are one FM channel; channels after them sit 3 higher than on the base chip.
    const chipChan = chan < ext.extStart + 4 ? Math.min(chan, ext.extStart) : chan - 3;
    return maxVolumeOfChannel(ext.base, chipChan);
  }
  return maxVolumeOfChipChannel(synthTypeForPlatform(platform), chan) ?? getMaxVolume(platform);
}
