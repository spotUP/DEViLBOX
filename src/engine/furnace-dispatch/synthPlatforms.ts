/**
 * Which Furnace chip each DEViLBOX Furnace synth plays on, and back.
 *
 * One table for the synth factories (which chip to create for a synth) and
 * the importer (which synth a module instrument becomes, given the chip it
 * plays on). Values are DivSystem ids (FurnaceDispatchPlatform).
 */
import { FurnaceDispatchPlatform } from './platforms';
import type { SynthType } from '@typedefs/instrument';

export const SYNTH_TO_DISPATCH: Record<string, number> = {
  FurnaceNES: FurnaceDispatchPlatform.NES,
  FurnaceGB: FurnaceDispatchPlatform.GB,
  FurnaceSNES: FurnaceDispatchPlatform.SNES,
  FurnacePCE: FurnaceDispatchPlatform.PCE,
  FurnacePSG: FurnaceDispatchPlatform.SMS,
  FurnaceVB: FurnaceDispatchPlatform.VBOY,
  FurnaceLynx: FurnaceDispatchPlatform.LYNX,
  FurnaceSWAN: FurnaceDispatchPlatform.SWAN,
  FurnaceVRC6: FurnaceDispatchPlatform.VRC6,
  FurnaceN163: FurnaceDispatchPlatform.N163,
  FurnaceFDS: FurnaceDispatchPlatform.FDS,
  FurnaceMMC5: FurnaceDispatchPlatform.MMC5,
  FurnaceGBA: FurnaceDispatchPlatform.GBA_DMA,
  FurnaceNDS: FurnaceDispatchPlatform.NDS,
  FurnacePOKEMINI: FurnaceDispatchPlatform.POKEMINI,
  FurnaceC64: FurnaceDispatchPlatform.C64_6581,
  FurnaceSID6581: FurnaceDispatchPlatform.C64_6581,
  FurnaceSID8580: FurnaceDispatchPlatform.C64_8580,
  FurnaceSID3: FurnaceDispatchPlatform.SID3,
  FurnaceAY: FurnaceDispatchPlatform.AY8910,
  FurnaceAY8930: FurnaceDispatchPlatform.AY8930,
  FurnaceVIC: FurnaceDispatchPlatform.VIC20,
  FurnaceSAA: FurnaceDispatchPlatform.SAA1099,
  FurnaceTED: FurnaceDispatchPlatform.TED,
  FurnaceVERA: FurnaceDispatchPlatform.VERA,
  FurnaceSCC: FurnaceDispatchPlatform.SCC,
  FurnaceTIA: FurnaceDispatchPlatform.TIA,
  FurnaceAMIGA: FurnaceDispatchPlatform.AMIGA,
  FurnacePET: FurnaceDispatchPlatform.PET,
  FurnacePCSPKR: FurnaceDispatchPlatform.PCSPKR,
  FurnaceZXBEEPER: FurnaceDispatchPlatform.SFX_BEEPER,
  FurnacePOKEY: FurnaceDispatchPlatform.POKEY,
  FurnacePONG: FurnaceDispatchPlatform.PONG,
  FurnacePV1000: FurnaceDispatchPlatform.PV1000,
  FurnaceDAVE: FurnaceDispatchPlatform.DAVE,
  FurnaceSU: FurnaceDispatchPlatform.SOUND_UNIT,
  FurnacePOWERNOISE: FurnaceDispatchPlatform.POWERNOISE,
  FurnaceSEGAPCM: FurnaceDispatchPlatform.SEGAPCM,
  FurnaceQSOUND: FurnaceDispatchPlatform.QSOUND,
  FurnaceES5506: FurnaceDispatchPlatform.ES5506,
  FurnaceRF5C68: FurnaceDispatchPlatform.RF5C68,
  FurnaceC140: FurnaceDispatchPlatform.C140,
  FurnaceK007232: FurnaceDispatchPlatform.K007232,
  FurnaceK053260: FurnaceDispatchPlatform.K053260,
  FurnaceGA20: FurnaceDispatchPlatform.GA20,
  FurnaceOKI: FurnaceDispatchPlatform.MSM6295,
  FurnaceYMZ280B: FurnaceDispatchPlatform.YMZ280B,
  FurnaceX1_010: FurnaceDispatchPlatform.X1_010,
  FurnaceMSM6258: FurnaceDispatchPlatform.MSM6258,
  FurnaceMSM5232: FurnaceDispatchPlatform.MSM5232,
  FurnaceMULTIPCM: FurnaceDispatchPlatform.MULTIPCM,
  FurnaceNAMCO: FurnaceDispatchPlatform.NAMCO,
  FurnacePCMDAC: FurnaceDispatchPlatform.PCM_DAC,
  FurnaceBUBBLE: FurnaceDispatchPlatform.BUBSYS_WSG,
  FurnaceSM8521: FurnaceDispatchPlatform.SM8521,
  FurnaceT6W28: FurnaceDispatchPlatform.T6W28,
  FurnaceSUPERVISION: FurnaceDispatchPlatform.SUPERVISION,
  FurnaceUPD1771: FurnaceDispatchPlatform.UPD1771C,
  FurnaceSCVTONE: FurnaceDispatchPlatform.UPD1771C,
  // FM chips (Yamaha) — now unified under FurnaceDispatch
  FurnaceOPN: FurnaceDispatchPlatform.GENESIS,
  FurnaceOPM: FurnaceDispatchPlatform.ARCADE,
  FurnaceOPL: FurnaceDispatchPlatform.OPL3,
  FurnaceOPLL: FurnaceDispatchPlatform.OPLL,
  FurnaceESFM: FurnaceDispatchPlatform.ESFM,
  FurnaceOPZ: FurnaceDispatchPlatform.OPZ,
  FurnaceOPNA: FurnaceDispatchPlatform.YM2608,
  FurnaceOPNB: FurnaceDispatchPlatform.YM2610,
  FurnaceOPL4: FurnaceDispatchPlatform.OPL4,
  FurnaceY8950: FurnaceDispatchPlatform.Y8950,
  FurnaceVRC7: FurnaceDispatchPlatform.VRC7,
  FurnaceOPN2203: FurnaceDispatchPlatform.YM2203,
  FurnaceOPNBB: FurnaceDispatchPlatform.YM2610B,
  // Generic Furnace defaults to Genesis (OPN2)
  Furnace: FurnaceDispatchPlatform.GENESIS,
};

/**
 * Chips that play a compound system's instruments when the compound itself
 * is not running. Furnace splits these systems into their parts on load
 * (fileOps/dmf.cpp "handle compound systems"), so a song runs YM2612 +
 * SN76489 where a synth asks for Genesis. The synths that address a compound
 * (FurnaceOPN = GENESIS, FurnaceOPM = ARCADE) are FM instruments, so the FM
 * part stands in, then its variants. The dispatch worklet routes by this
 * table (sent on init); the importer reads it backwards.
 */
const OPN2_FAMILY = [
  FurnaceDispatchPlatform.YM2612, FurnaceDispatchPlatform.YM2612_EXT,
  FurnaceDispatchPlatform.YM2612_DUALPCM, FurnaceDispatchPlatform.YM2612_DUALPCM_EXT,
  FurnaceDispatchPlatform.YM2612_CSM,
];
export const STAND_INS: Readonly<Record<number, readonly number[]>> = {
  [FurnaceDispatchPlatform.GENESIS]: OPN2_FAMILY,
  [FurnaceDispatchPlatform.GENESIS_EXT]: [
    FurnaceDispatchPlatform.YM2612_EXT, FurnaceDispatchPlatform.YM2612,
    FurnaceDispatchPlatform.YM2612_DUALPCM, FurnaceDispatchPlatform.YM2612_DUALPCM_EXT,
    FurnaceDispatchPlatform.YM2612_CSM,
  ],
  [FurnaceDispatchPlatform.ARCADE]: [FurnaceDispatchPlatform.YM2151],
};

/**
 * The synth for a module instrument that plays on `platform`, or undefined
 * when no Furnace synth plays that chip. The first synth listed for a chip
 * is its own (FurnacePSG for the SN76489, FurnaceC64 for the 6581); a chip
 * with no synth of its own gets the synth it stands in for (a YM2612 song
 * chip gets FurnaceOPN, which addresses Genesis).
 */
export function synthTypeForPlatform(platform: number): SynthType | undefined {
  const entries = Object.entries(SYNTH_TO_DISPATCH);
  for (const [synthType, p] of entries) {
    if (p === platform) return synthType as SynthType;
  }
  for (const [synthType, p] of entries) {
    if (STAND_INS[p]?.includes(platform)) return synthType as SynthType;
  }
  return undefined;
}
