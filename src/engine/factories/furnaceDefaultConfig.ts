/**
 * Default Furnace instrument config for a synth type. Pure data: kept out of FurnaceChipSynthFactory (which imports
 * FurnaceSynth and the chip engines) so the stores can ask for a default without loading every synth class.
 */
import { DEFAULT_FURNACE } from '@/types/instrument';

export function getDefaultFurnaceConfig(synthType: string): import('@typedefs/instrument').FurnaceConfig | undefined {
  // Map synth type to chip ID
  const chipTypeMap: Record<string, number> = {
    'FurnaceOPN': 0, 'FurnaceOPM': 1, 'FurnaceOPL': 2, 'FurnacePSG': 3,
    'FurnaceNES': 4, 'FurnaceGB': 5, 'FurnacePCE': 6, 'FurnaceSCC': 7,
    'FurnaceN163': 8, 'FurnaceVRC6': 9, 'FurnaceC64': 10, 'FurnaceOPLL': 11,
    'FurnaceAY': 12, 'FurnaceOPNA': 13, 'FurnaceOPNB': 14, 'FurnaceTIA': 15,
    'FurnaceFDS': 16, 'FurnaceMMC5': 17, 'FurnaceSAA': 18, 'FurnaceSWAN': 19,
    'FurnaceOKI': 20, 'FurnaceES5506': 21, 'FurnaceOPZ': 22, 'FurnaceY8950': 23,
    'FurnaceSNES': 24, 'FurnaceLYNX': 25, 'FurnaceOPL4': 26, 'FurnaceSEGAPCM': 27,
    'FurnaceYMZ280B': 28, 'FurnaceRF5C68': 29, 'FurnaceGA20': 30, 'FurnaceC140': 31,
    'FurnaceQSOUND': 32, 'FurnaceVIC': 33, 'FurnaceTED': 34, 'FurnaceSUPERVISION': 35,
    'FurnaceVERA': 36, 'FurnaceSM8521': 37, 'FurnaceBUBBLE': 38,
    'FurnaceK007232': 39, 'FurnaceK053260': 40, 'FurnaceX1_010': 41,
    'FurnaceUPD1771': 42, 'FurnaceT6W28': 43, 'FurnaceVB': 44,
    'FurnaceSID6581': 45, 'FurnaceSID8580': 46,
    // NEW Chips (47-72)
    'FurnaceOPN2203': 47, 'FurnaceOPNBB': 48, 'FurnaceESFM': 49,
    'FurnaceAY8930': 50, 'FurnaceNDS': 51, 'FurnaceGBA': 52,
    'FurnacePOKEMINI': 54, 'FurnaceNAMCO': 55, 'FurnacePET': 56,
    'FurnacePOKEY': 57, 'FurnaceMSM6258': 58, 'FurnaceMSM5232': 59,
    'FurnaceMULTIPCM': 60, 'FurnaceAMIGA': 61, 'FurnacePCSPKR': 62,
    'FurnacePONG': 63, 'FurnacePV1000': 64, 'FurnaceDAVE': 65,
    'FurnaceSU': 66, 'FurnacePOWERNOISE': 68,
    'FurnaceZXBEEPER': 69, 'FurnaceSCVTONE': 71, 'FurnacePCMDAC': 72,
    'Furnace': 0, // Default to OPN
  };

  const chipType = chipTypeMap[synthType];
  if (chipType === undefined) return undefined;

  // Use DEFAULT_FURNACE as base (has good FM operator settings)
  // Then override with the correct chip type
  const config: import('@typedefs/instrument').FurnaceConfig = {
    ...DEFAULT_FURNACE,
    chipType,
    // Deep copy operators to avoid mutation
    operators: DEFAULT_FURNACE.operators.map(op => ({ ...op })),
  };

  // OPL and OPLL play two operators. DEFAULT_FURNACE is OPN-shaped (four operators, the
  // first carrier at TL 50): on an OPL chip that is a quiet carrier, -35 dB against a
  // properly set 2-op patch.
  if (chipType === 2 || chipType === 23 || chipType === 26 || chipType === 11) {
    config.ops = 2;
    config.algorithm = 0;
    config.feedback = 4;
    config.operators = [
      { ...DEFAULT_FURNACE.operators[0], mult: 2, tl: 30, ar: 15, dr: 4, d2r: 0, sl: 4, rr: 8 },
      { ...DEFAULT_FURNACE.operators[1], mult: 1, tl: 0, ar: 15, dr: 6, d2r: 0, sl: 2, rr: 8 },
    ];
    config.opMacros = [{}, {}];
  }

  // Add chip-specific defaults
  if (synthType === 'FurnaceC64' || synthType === 'FurnaceSID6581' || synthType === 'FurnaceSID8580') {
    config.c64 = {
      triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
      a: 0, d: 8, s: 12, r: 6,
      duty: 2048,
      ringMod: false, oscSync: false,
      toFilter: false, initFilter: false,
      filterCutoff: 1024, filterResonance: 8,
      filterLP: true, filterBP: false, filterHP: false,
      filterCh3Off: false,
    };
  }

  return config;
}
