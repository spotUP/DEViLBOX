/**
 * Furnace chip synth registrations
 *
 * Registers all 79+ Furnace chip synths via unified FurnaceDispatchSynth:
 * - FM chips: OPN2, OPM, OPL, OPLL, ESFM, OPZ, OPNA, OPNB, OPL4, Y8950, VRC7, YM2203, YM2610B
 * - PSG/Console: NES, GB, SID, AY, SNES, PCE, etc.
 * - Sample-based: Amiga, SEGA PCM, QSound, RF5C68, etc.
 *
 * All chips use the Furnace Dispatch WASM engine with blip_buf resampling
 * for correct chip clocking at any output sample rate.
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { FurnaceDispatchSynth, FurnaceDispatchPlatform } from '../../furnace-dispatch';
import type { InstrumentConfig } from '@typedefs/instrument';

// ── Volume offsets (from InstrumentFactory.VOLUME_NORMALIZATION_OFFSETS) ──────

const FURNACE_VOLUME_OFFSETS: Record<string, number> = {
  Furnace: 0,
  FurnaceOPN: 7, FurnaceOPM: -6, FurnaceOPL: 2, FurnaceOPLL: -18, FurnaceESFM: 5,
  FurnaceOPZ: -14, FurnaceOPNA: -11, FurnaceOPNB: -10, FurnaceOPL4: -8, FurnaceY8950: -5,
  FurnaceVRC7: -29, FurnaceOPN2203: -23, FurnaceOPNBB: -21,
  FurnaceNES: 7, FurnaceGB: 4, FurnaceSNES: -10, FurnacePCE: 5, FurnacePSG: 3,
  FurnaceVB: 0, FurnaceLynx: 3, FurnaceSWAN: 4, FurnaceVRC6: 3, FurnaceN163: -29,
  FurnaceFDS: 3, FurnaceMMC5: 37, FurnaceGBA: -10, FurnaceNDS: 3, FurnacePOKEMINI: -10,
  FurnaceC64: -2, FurnaceSID6581: -3, FurnaceSID8580: 7, FurnaceAY: 3, FurnaceAY8930: 25,
  FurnaceVIC: -1, FurnaceSAA: 6, FurnaceTED: -4, FurnaceVERA: 2, FurnaceSCC: 9,
  FurnaceTIA: -7, FurnaceAMIGA: -4, FurnacePET: -10, FurnacePCSPKR: -10,
  FurnaceZXBEEPER: -4, FurnacePOKEY: 7, FurnacePONG: -10, FurnacePV1000: 3,
  FurnaceDAVE: 2, FurnaceSU: 8, FurnacePOWERNOISE: -4,
  FurnaceSEGAPCM: -5, FurnaceQSOUND: 4, FurnaceES5506: 38, FurnaceRF5C68: 0,
  FurnaceC140: -9, FurnaceK007232: -4, FurnaceK053260: -1, FurnaceGA20: 3, FurnaceOKI: -7,
  FurnaceYMZ280B: -5, FurnaceX1_010: 2, FurnaceMSM6258: -10, FurnaceMSM5232: 10,
  FurnaceMULTIPCM: 14, FurnaceNAMCO: -15, FurnacePCMDAC: -5, FurnaceBUBBLE: 3,
  FurnaceSM8521: 9, FurnaceT6W28: 3, FurnaceSUPERVISION: -1, FurnaceUPD1771: 9,
  FurnaceSCVTONE: 3,
};

// ── Shared trigger hooks ─────────────────────────────────────────────────────
// FM chips: no onTriggerAttack — ToneEngine handles channel index + triggerAttack

function furnaceReleaseHook(synth: any, note: string | undefined, time: number): boolean {
  if (synth instanceof FurnaceDispatchSynth) {
    synth.triggerRelease(note, time);
  }
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

// ── All Furnace Chips (via FurnaceDispatchSynth) ─────────────────────────────

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

// ── Register all (unified under FurnaceDispatchSynth) ─────────────────────────

SynthRegistry.register(dispatchChipDescs);
