/**
 * Furnace chip synth registrations
 *
 * Registers all 79 Furnace chip synths:
 * - FM chips (via FurnaceSynth): OPN, OPM, OPL, OPLL, ESFM, OPZ, OPNA, OPNB, OPL4, Y8950, VRC7, OPN2203, OPNBB
 * - Dispatch chips (via FurnaceDispatchSynth): NES, GB, SID, AY, etc.
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { FurnaceSynth } from '../../FurnaceSynth';
import { FurnaceChipType } from '../../chips/FurnaceChipEngine';
import { FurnaceDispatchSynth, FurnaceDispatchPlatform } from '../../furnace-dispatch';
import type { InstrumentConfig } from '@typedefs/instrument';

// ── Volume offsets (from InstrumentFactory.VOLUME_NORMALIZATION_OFFSETS) ──────

const FURNACE_VOLUME_OFFSETS: Record<string, number> = {
  Furnace: 0,
  FurnaceOPN: 7, FurnaceOPM: 2, FurnaceOPL: 10, FurnaceOPLL: 12, FurnaceESFM: 19,
  FurnaceOPZ: -14, FurnaceOPNA: 6, FurnaceOPNB: 7, FurnaceOPL4: 9, FurnaceY8950: 9,
  FurnaceVRC7: 8, FurnaceOPN2203: -3, FurnaceOPNBB: 2,
  FurnaceNES: 7, FurnaceGB: 4, FurnaceSNES: -10, FurnacePCE: 5, FurnacePSG: 3,
  FurnaceVB: 16, FurnaceLynx: 3, FurnaceSWAN: 4, FurnaceVRC6: 3, FurnaceN163: 7,
  FurnaceFDS: 3, FurnaceMMC5: 37, FurnaceGBA: -10, FurnaceNDS: 3, FurnacePOKEMINI: -10,
  FurnaceC64: 6, FurnaceSID6581: 6, FurnaceSID8580: 6, FurnaceAY: 3, FurnaceAY8930: 25,
  FurnaceVIC: -1, FurnaceSAA: 6, FurnaceTED: -4, FurnaceVERA: 14, FurnaceSCC: 9,
  FurnaceTIA: -7, FurnaceAMIGA: 15, FurnacePET: -10, FurnacePCSPKR: -10,
  FurnaceZXBEEPER: -4, FurnacePOKEY: 7, FurnacePONG: -10, FurnacePV1000: 3,
  FurnaceDAVE: 15, FurnaceSU: 27, FurnacePOWERNOISE: -4,
  FurnaceSEGAPCM: -5, FurnaceQSOUND: 18, FurnaceES5506: 80, FurnaceRF5C68: 0,
  FurnaceC140: 33, FurnaceK007232: -4, FurnaceK053260: 17, FurnaceGA20: 3, FurnaceOKI: 44,
  FurnaceYMZ280B: 39, FurnaceX1_010: 15, FurnaceMSM6258: -10, FurnaceMSM5232: 10,
  FurnaceMULTIPCM: 56, FurnaceNAMCO: -5, FurnacePCMDAC: 8, FurnaceBUBBLE: 3,
  FurnaceSM8521: 9, FurnaceT6W28: 3, FurnaceSUPERVISION: -1, FurnaceUPD1771: 9,
  FurnaceSCVTONE: 3,
};

// ── Chip-specific default FM configs ─────────────────────────────────────────

const CHIP_DEFAULTS: Record<number, Partial<import('@typedefs/instrument').FurnaceConfig>> = {
  0: { // OPN2 (Genesis)
    algorithm: 4, feedback: 5,
    operators: [
      { enabled: true, mult: 1, tl: 20, ar: 31, dr: 8, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 2, tl: 30, ar: 31, dr: 12, d2r: 0, sl: 4, rr: 6, dt: 3, am: false },
      { enabled: true, mult: 1, tl: 25, ar: 31, dr: 10, d2r: 0, sl: 3, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 4, tl: 35, ar: 28, dr: 15, d2r: 0, sl: 5, rr: 10, dt: -1, am: false },
    ],
  },
  1: { // OPM
    algorithm: 5, feedback: 6,
    operators: [
      { enabled: true, mult: 1, tl: 15, ar: 31, dr: 5, d2r: 0, sl: 1, rr: 6, dt: 0, am: false },
      { enabled: true, mult: 3, tl: 40, ar: 31, dr: 8, d2r: 0, sl: 3, rr: 8, dt: 2, am: false },
      { enabled: true, mult: 2, tl: 35, ar: 31, dr: 10, d2r: 0, sl: 4, rr: 8, dt: -2, am: false },
      { enabled: true, mult: 1, tl: 25, ar: 31, dr: 12, d2r: 0, sl: 5, rr: 10, dt: 0, am: true },
    ],
  },
};

const DEFAULT_FM_OPERATORS = [
  { enabled: true, mult: 1, tl: 0, ar: 31, dr: 0, d2r: 0, sl: 0, rr: 15, dt: 0, am: false },
  { enabled: true, mult: 2, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
  { enabled: true, mult: 1, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
  { enabled: true, mult: 1, tl: 20, ar: 31, dr: 15, d2r: 0, sl: 4, rr: 10, dt: 0, am: false },
];

function createFurnaceWithChip(config: InstrumentConfig, chipType: number): FurnaceSynth {
  const chipDefaults = CHIP_DEFAULTS[chipType] || { algorithm: 0, feedback: 0, operators: DEFAULT_FM_OPERATORS };
  const baseConfig = config.furnace || {
    algorithm: chipDefaults.algorithm ?? 0,
    feedback: chipDefaults.feedback ?? 0,
    operators: chipDefaults.operators || [],
    macros: [],
    opMacros: [],
    wavetables: chipDefaults.wavetables || [],
  };
  return new FurnaceSynth({ ...baseConfig, chipType });
}

// ── Shared trigger hooks ─────────────────────────────────────────────────────
// FM chips: no onTriggerAttack — ToneEngine handles channel index + triggerAttack

function furnaceReleaseHook(synth: any, _note: string | undefined, time: number): boolean {
  (synth as any).triggerRelease(time);
  return true;
}

// ── Map synthType → FurnaceDispatchPlatform ──────────────────────────────────

const SYNTH_TO_DISPATCH: Record<string, number> = {
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
};

// ── FM Chips (via FurnaceSynth) ──────────────────────────────────────────────

interface FMChipDef {
  id: string;
  name: string;
  chipType: number;
}

const FM_CHIPS: FMChipDef[] = [
  { id: 'FurnaceOPN', name: 'Sega Genesis (YM2612)', chipType: FurnaceChipType.OPN2 },
  { id: 'FurnaceOPM', name: 'Yamaha OPM (X68000)', chipType: FurnaceChipType.OPM },
  { id: 'FurnaceOPL', name: 'OPL3 (AdLib)', chipType: FurnaceChipType.OPL3 },
  { id: 'FurnaceOPLL', name: 'Yamaha OPLL (MSX)', chipType: FurnaceChipType.OPLL },
  { id: 'FurnaceESFM', name: 'Enhanced OPL3 FM', chipType: FurnaceChipType.ESFM },
  { id: 'FurnaceOPZ', name: 'Yamaha OPZ (TX81Z)', chipType: FurnaceChipType.OPZ },
  { id: 'FurnaceOPNA', name: 'YM2608 (PC-98)', chipType: FurnaceChipType.OPNA },
  { id: 'FurnaceOPNB', name: 'YM2610 (Neo Geo)', chipType: FurnaceChipType.OPNB },
  { id: 'FurnaceOPL4', name: 'YMF278B (OPL4)', chipType: FurnaceChipType.OPL4 },
  { id: 'FurnaceY8950', name: 'Y8950 (MSX-Audio)', chipType: FurnaceChipType.Y8950 },
  { id: 'FurnaceVRC7', name: 'Konami VRC7', chipType: FurnaceChipType.OPLL },
  { id: 'FurnaceOPN2203', name: 'YM2203 (PC-88)', chipType: FurnaceChipType.OPN },
  { id: 'FurnaceOPNBB', name: 'YM2610B (Neo Geo ext.)', chipType: FurnaceChipType.OPNB_B },
];

const fmChipDescs: SynthDescriptor[] = FM_CHIPS.map(chip => ({
  id: chip.id,
  name: chip.name,
  category: 'wasm' as const,
  loadMode: 'eager' as const,
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: FURNACE_VOLUME_OFFSETS[chip.id] ?? 0,
  controlsComponent: 'FurnaceControls',
  create: (config: InstrumentConfig) => createFurnaceWithChip(config, chip.chipType),
  onTriggerRelease: furnaceReleaseHook,
}));

// ── Generic Furnace (no specific chip) ───────────────────────────────────────

const furnaceGenericDesc: SynthDescriptor = {
  id: 'Furnace',
  name: 'Furnace',
  category: 'wasm',
  loadMode: 'eager',
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 0,
  controlsComponent: 'FurnaceControls',
  create: (config) => {
    if (!config.furnace) {
      throw new Error('Furnace config required for Furnace synth type');
    }
    return new FurnaceSynth(config.furnace);
  },
  onTriggerRelease: furnaceReleaseHook,
};

// ── Dispatch Chips (via FurnaceDispatchSynth) ────────────────────────────────

const DISPATCH_CHIPS = Object.keys(SYNTH_TO_DISPATCH);

const dispatchChipDescs: SynthDescriptor[] = DISPATCH_CHIPS.map(id => ({
  id,
  name: id.replace('Furnace', ''),
  category: 'wasm' as const,
  loadMode: 'eager' as const,
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: FURNACE_VOLUME_OFFSETS[id] ?? 0,
  controlsComponent: 'FurnaceControls',
  create: (config: InstrumentConfig) => {
    const dispatchPlatform = SYNTH_TO_DISPATCH[id];
    const instrument = new FurnaceDispatchSynth(dispatchPlatform);
    const furnaceIndex = config.furnace?.furnaceIndex ?? 0;
    instrument.setFurnaceInstrumentIndex(furnaceIndex);
    if (config.furnace) {
      const uploadPromise = instrument.uploadInstrumentFromConfig(
        config.furnace as unknown as Record<string, unknown>,
        config.name,
      ).catch(err => {
        console.error(`[FurnaceRegistry] Failed to upload instrument data for ${config.name}:`, err);
      });
      instrument.setInstrumentUploadPromise(uploadPromise as Promise<void>);
    }
    return instrument;
  },
  onTriggerRelease: furnaceReleaseHook,
}));

// ── Register all ─────────────────────────────────────────────────────────────

SynthRegistry.register(furnaceGenericDesc);
SynthRegistry.register(fmChipDescs);
SynthRegistry.register(dispatchChipDescs);
