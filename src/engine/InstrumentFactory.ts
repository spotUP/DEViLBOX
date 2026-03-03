/**
 * InstrumentFactory - Creates and manages synth instances
 * Factory class to create all synth types from InstrumentConfig.
 * Returns Tone.ToneAudioNode for Tone.js synths, or DevilboxSynth for native synths.
 *
 * Delegates to focused sub-factories in ./factories/
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import {
  DEFAULT_SUPERCOLLIDER,
} from '@/types/instrument';
import { HivelySynth } from './hively/HivelySynth';
import { JamCrackerSynth } from './jamcracker/JamCrackerSynth';
import { SoundMonSynth } from './soundmon/SoundMonSynth';
import { SidMonSynth } from './sidmon/SidMonSynth';
import { DigMugSynth } from './digmug/DigMugSynth';
import { FCSynth } from './fc/FCSynth';
import { TFMXSynth } from './tfmx/TFMXSynth';
import { FredSynth } from './fred/FredSynth';
import { HippelCoSoSynth } from './hippelcoso/HippelCoSoSynth';
import { RobHubbardSynth } from './robhubbard/RobHubbardSynth';
import { SidMon1Synth } from './sidmon1/SidMon1Synth';
import { OctaMEDSynth } from './octamed/OctaMEDSynth';
import { DavidWhittakerSynth } from './davidwhittaker/DavidWhittakerSynth';
import { SonicArrangerSynth } from './sonic-arranger/SonicArrangerSynth';
import { SymphonieSynth } from './symphonie/SymphonieSynth';
import { SunVoxSynth } from './sunvox/SunVoxSynth';
import { UADESynth } from './uade/UADESynth';
import { SuperColliderSynth } from './sc/SuperColliderSynth';
import { MAMESynth } from './MAMESynth';
import { FurnaceChipType } from './chips/FurnaceChipEngine';
import { FurnaceDispatchSynth } from './furnace-dispatch';
import { BuzzmachineType } from './buzzmachines/BuzzmachineEngine';
import { VSTBridgeSynth } from './vstbridge/VSTBridgeSynth';
import { SYNTH_REGISTRY } from './vstbridge/synth-registry';
import { SynthRegistry } from './registry/SynthRegistry';

// Sub-factory imports
import { VOLUME_NORMALIZATION_OFFSETS } from './factories/volumeNormalization';
import {
  createToneJSSynth,
  createSynth as createToneJSBasicSynth,
} from './factories/ToneJSSynthFactory';
import {
  SYNTH_TO_DISPATCH,
  createFurnace,
  createFurnaceWithChip,
  createBuzzmachine,
} from './factories/FurnaceChipSynthFactory';
import {
  createTB303,
  createWAM,
  createNamedWAM,
  createWavetable,
  createFormantSynth,
  createWobbleBass,
  createDrumKit,
  createDubSiren,
  createSpaceLaser,
  createV2,
  createSam,
  createSynare,
  createDexed,
  createOBXd,
  createCZ101,
  createCEM3394,
  createSCSP,
  createVFX,
  createD50,
  createRdPiano,
  createMU2000,
  createBuzzGenerator,
  createBuzz3o3,
  createBuzz3o3DF,
  createModularSynth,
  createMAMEAICA,
  createMAMEASC,
  createMAMEAstrocade,
  createMAMEC352,
  createMAMEES5503,
  createMAMEICS2115,
  createMAMEK054539,
  createMAMEMEA8000,
  createMAMERF5C400,
  createMAMESN76477,
  createMAMESNKWave,
  createMAMESP0250,
  createMAMETMS36XX,
  createMAMETMS5220,
  createMAMETR707,
  createMAMEUPD931,
  createMAMEUPD933,
  createMAMEVotrax,
  createMAMEYMF271,
  createMAMEYMOPQ,
  createMAMEVASynth,
} from './factories/CommunitySynthFactory';

// Re-export standalone functions (preserves existing import paths)
export { getDefaultEffectParameters, createEffect, createEffectChain } from './factories/EffectFactory';
export { getDefaultFurnaceConfig } from './factories/FurnaceChipSynthFactory';

export class InstrumentFactory {
  /**
   * Create a synth instance based on InstrumentConfig.
   * Returns a Tone.ToneAudioNode for Tone.js synths, or a DevilboxSynth for native synths (e.g. WAM).
   */
  public static createInstrument(config: InstrumentConfig): Tone.ToneAudioNode | DevilboxSynth | null {
    // Try SynthRegistry first (new registry architecture)
    const registryDesc = SynthRegistry.get(config.synthType);
    if (registryDesc) {
      const instrument = registryDesc.create(config);
      // Apply volume offset for Furnace WASM synths via setVolumeOffset
      if (config.synthType.startsWith('Furnace') && registryDesc.volumeOffsetDb && 'setVolumeOffset' in instrument) {
        (instrument as unknown as { setVolumeOffset: (offset: number) => void }).setVolumeOffset(registryDesc.volumeOffsetDb);
      }
      return instrument;
    }

    let instrument: Tone.ToneAudioNode | DevilboxSynth;

    switch (config.synthType) {
      case 'Synth':
        instrument = createToneJSBasicSynth(config);
        break;

      case 'MonoSynth':
        instrument = createToneJSSynth({ ...config, synthType: "MonoSynth" })!;
        break;

      case 'DuoSynth':
        instrument = createToneJSSynth({ ...config, synthType: "DuoSynth" })!;
        break;

      case 'FMSynth':
        instrument = createToneJSSynth({ ...config, synthType: "FMSynth" })!;
        break;

      case 'AMSynth':
        instrument = createToneJSSynth({ ...config, synthType: "AMSynth" })!;
        break;

      case 'PluckSynth':
        instrument = createToneJSSynth({ ...config, synthType: "PluckSynth" })!;
        break;

      case 'MetalSynth':
        instrument = createToneJSSynth({ ...config, synthType: "MetalSynth" })!;
        break;

      case 'MembraneSynth':
        instrument = createToneJSSynth({ ...config, synthType: "MembraneSynth" })!;
        break;

      case 'NoiseSynth':
        instrument = createToneJSSynth({ ...config, synthType: "NoiseSynth" })!;
        break;

      case 'TB303':
        instrument = createTB303(config);
        break;

      // C64 SID: audio handled by C64SIDEngine — no synth needed
      case 'C64SID':
        return null;

      case 'Furnace':
        instrument = createFurnace(config);
        break;

      case 'Buzzmachine':
        instrument = createBuzzmachine(config);
        break;

      // Furnace Chip Types - using FurnaceChipType enum for correct IDs
      case 'FurnaceOPN':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPN2);
        break;
      case 'FurnaceOPM':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPM);
        break;
      case 'FurnaceOPL':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPL3);
        break;
      case 'FurnaceOPLL':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPLL);
        break;
      case 'FurnaceESFM':
        instrument = createFurnaceWithChip(config, FurnaceChipType.ESFM);
        break;
      case 'FurnaceOPZ':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPZ);
        break;
      case 'FurnaceOPNA':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPNA);
        break;
      case 'FurnaceOPNB':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPNB);
        break;
      case 'FurnaceOPL4':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPL4);
        break;
      case 'FurnaceY8950':
        instrument = createFurnaceWithChip(config, FurnaceChipType.Y8950);
        break;
      case 'FurnaceVRC7':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPLL); // VRC7 uses OPLL core
        break;
      // Non-FM Furnace chips — use FurnaceDispatchSynth (native WASM dispatch)
      case 'FurnaceNES': case 'FurnaceGB': case 'FurnaceSNES': case 'FurnacePCE':
      case 'FurnacePSG': case 'FurnaceVB': case 'FurnaceLynx': case 'FurnaceSWAN':
      case 'FurnaceVRC6': case 'FurnaceN163': case 'FurnaceFDS': case 'FurnaceMMC5':
      case 'FurnaceGBA': case 'FurnaceNDS': case 'FurnacePOKEMINI':
      case 'FurnaceC64': case 'FurnaceSID6581': case 'FurnaceSID8580':
      case 'FurnaceAY': case 'FurnaceAY8930': case 'FurnaceVIC': case 'FurnaceSAA':
      case 'FurnaceTED': case 'FurnaceVERA': case 'FurnaceSCC': case 'FurnaceTIA':
      case 'FurnaceAMIGA': case 'FurnacePET': case 'FurnacePCSPKR':
      case 'FurnaceZXBEEPER': case 'FurnacePOKEY': case 'FurnacePONG':
      case 'FurnacePV1000': case 'FurnaceDAVE': case 'FurnaceSU':
      case 'FurnacePOWERNOISE':
      case 'FurnaceSEGAPCM': case 'FurnaceQSOUND': case 'FurnaceES5506':
      case 'FurnaceRF5C68': case 'FurnaceC140': case 'FurnaceK007232':
      case 'FurnaceK053260': case 'FurnaceGA20': case 'FurnaceOKI':
      case 'FurnaceYMZ280B': case 'FurnaceX1_010': case 'FurnaceMSM6258':
      case 'FurnaceMSM5232': case 'FurnaceMULTIPCM': case 'FurnaceNAMCO':
      case 'FurnacePCMDAC': case 'FurnaceBUBBLE': case 'FurnaceSM8521':
      case 'FurnaceT6W28': case 'FurnaceSUPERVISION': case 'FurnaceUPD1771': case 'FurnaceSCVTONE': {
        const dispatchPlatform = SYNTH_TO_DISPATCH[config.synthType];
        if (dispatchPlatform !== undefined) {
          instrument = new FurnaceDispatchSynth(dispatchPlatform);
          // Set the Furnace instrument index and upload encoded instrument
          const furnaceIndex = config.furnace?.furnaceIndex ?? 0;
          (instrument as FurnaceDispatchSynth).setFurnaceInstrumentIndex(furnaceIndex);
          if (config.furnace) {
            // Encode and upload instrument from config (converts to FINS format)
            // Track the promise so ensureInitialized() waits for the upload to complete
            console.log(`[InstrumentFactory] Queuing upload for instrument ${config.name}, furnaceIndex=${furnaceIndex}`);
            const uploadPromise = (instrument as FurnaceDispatchSynth).uploadInstrumentFromConfig(config.furnace as unknown as Record<string, unknown>, config.name).catch(err => {
              console.error(`[InstrumentFactory] Failed to upload instrument data for ${config.name}:`, err);
            });
            (instrument as FurnaceDispatchSynth).setInstrumentUploadPromise(uploadPromise as Promise<void>);
          }
        } else {
          instrument = createFurnaceWithChip(config, FurnaceChipType.OPN2);
        }
        break;
      }

      // FM chips that stay on FurnaceSynth (already produce audio)
      case 'FurnaceOPN2203':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPN);
        break;
      case 'FurnaceOPNBB':
        instrument = createFurnaceWithChip(config, FurnaceChipType.OPNB_B);
        break;

      case 'Sampler': {
        // Check if this is a MOD/XM sample that needs period-based playback
        const hasMODMetadata = config.metadata?.modPlayback?.usePeriodPlayback;
        console.log(`[InstrumentFactory] Creating ${config.synthType} for instrument ${config.id}:`, {
          hasMODMetadata,
          metadataExists: !!config.metadata,
          modPlaybackExists: !!config.metadata?.modPlayback,
          usePeriodPlayback: config.metadata?.modPlayback?.usePeriodPlayback,
        });
        if (hasMODMetadata) {
          console.log('[InstrumentFactory] Using Player for MOD/XM period-based playback');
          instrument = createToneJSSynth({ ...config, synthType: "Player" })!; // Use Player for period-based playback
        } else {
          console.log('[InstrumentFactory] Using Sampler for regular sample playback');
          instrument = createToneJSSynth({ ...config, synthType: "Sampler" })!; // Use Sampler for regular samples
        }
        break;
      }

      case 'Player':
        instrument = createToneJSSynth({ ...config, synthType: "Player" })!;
        break;

      case 'Wavetable':
        instrument = createWavetable(config);
        break;

      case 'GranularSynth':
        instrument = createToneJSSynth({ ...config, synthType: "GranularSynth" })!;
        break;

      // New synths
      case 'SuperSaw':
        instrument = createToneJSSynth({ ...config, synthType: "SuperSaw" })!;
        break;

      case 'PolySynth':
        instrument = createToneJSSynth({ ...config, synthType: "PolySynth" })!;
        break;

      case 'Organ':
        instrument = createToneJSSynth({ ...config, synthType: "Organ" })!;
        break;

      case 'DrumMachine':
        instrument = createToneJSSynth({ ...config, synthType: "DrumMachine" })!;
        break;

      case 'ChipSynth':
        instrument = createToneJSSynth({ ...config, synthType: "ChipSynth" })!;
        break;

      case 'PWMSynth':
        instrument = createToneJSSynth({ ...config, synthType: "PWMSynth" })!;
        break;

      case 'StringMachine':
        instrument = createToneJSSynth({ ...config, synthType: "StringMachine" })!;
        break;

      case 'FormantSynth':
        instrument = createFormantSynth(config);
        break;

      case 'WobbleBass':
        instrument = createWobbleBass(config);
        break;

      case 'DrumKit':
        instrument = createDrumKit(config);
        break;

      case 'DubSiren':
        instrument = createDubSiren(config);
        break;

      case 'SpaceLaser':
        instrument = createSpaceLaser(config);
        break;

      case 'V2':
      case 'V2Speech':
        instrument = createV2(config);
        break;

      case 'Sam':
        instrument = createSam(config);
        break;

      case 'Synare':
        instrument = createSynare(config);
        break;

      case 'WAMOBXd':
      case 'WAMSynth101':
      case 'WAMTinySynth':
      case 'WAMFaustFlute':
        instrument = createNamedWAM(config);
        break;

      case 'WAM':
        instrument = createWAM(config);
        break;

      // JUCE WASM Synths
      case 'Dexed':
        instrument = createDexed(config);
        break;

      case 'OBXd':
        instrument = createOBXd(config);
        break;

      case 'MAMEVFX':
      case 'VFX':
        instrument = createVFX(config);
        break;

      case 'D50':
        instrument = createD50(config);
        break;

      case 'MAMEDOC':
        instrument = new MAMESynth({ type: 'doc' });
        break;

      case 'MAMERSA':
        instrument = createRdPiano(config);
        break;

      case 'MAMESWP30':
        instrument = createMU2000(config);
        break;

      case 'CZ101':
        instrument = createCZ101(config);
        break;

      case 'CEM3394':
        instrument = createCEM3394(config);
        break;

      case 'SCSP':
        instrument = createSCSP(config);
        break;

      // Buzzmachine Generators (WASM-emulated Buzz synths)
      // Non-303 Buzz synths: apply volume via output gain (setVolume is no-op for non-303)
      case 'BuzzDTMF':
        instrument = createBuzzGenerator(BuzzmachineType.CYANPHASE_DTMF, 'BuzzDTMF', config);
        break;
      case 'BuzzFreqBomb':
        instrument = createBuzzGenerator(BuzzmachineType.ELENZIL_FREQUENCYBOMB, 'BuzzFreqBomb', config);
        break;
      case 'BuzzKick':
        instrument = createBuzzGenerator(BuzzmachineType.FSM_KICK, 'BuzzKick', config);
        break;
      case 'BuzzKickXP':
        instrument = createBuzzGenerator(BuzzmachineType.FSM_KICKXP, 'BuzzKickXP', config);
        break;
      case 'BuzzNoise':
        instrument = createBuzzGenerator(BuzzmachineType.JESKOLA_NOISE, 'BuzzNoise', config);
        break;
      case 'BuzzTrilok':
        instrument = createBuzzGenerator(BuzzmachineType.JESKOLA_TRILOK, 'BuzzTrilok', config);
        break;
      case 'Buzz4FM2F':
        instrument = createBuzzGenerator(BuzzmachineType.MADBRAIN_4FM2F, 'Buzz4FM2F', config);
        break;
      case 'BuzzDynamite6':
        instrument = createBuzzGenerator(BuzzmachineType.MADBRAIN_DYNAMITE6, 'BuzzDynamite6', config);
        break;
      case 'BuzzM3':
        instrument = createBuzzGenerator(BuzzmachineType.MAKK_M3, 'BuzzM3', config);
        break;
      case 'Buzz3o3':
        instrument = createBuzz3o3(config);
        break;
      case 'Buzz3o3DF':
        instrument = createBuzz3o3DF(config);
        break;
      case 'BuzzM4':
        instrument = createBuzzGenerator(BuzzmachineType.MAKK_M4, 'BuzzM4', config);
        break;

      // MAME Hardware-Accurate Synths
      case 'MAMEAICA':
        instrument = createMAMEAICA(config);
        break;
      case 'MAMEASC':
        instrument = createMAMEASC(config);
        break;
      case 'MAMEAstrocade':
        instrument = createMAMEAstrocade(config);
        break;
      case 'MAMEC352':
        instrument = createMAMEC352(config);
        break;
      case 'MAMEES5503':
        instrument = createMAMEES5503(config);
        break;
      case 'MAMEICS2115':
        instrument = createMAMEICS2115(config);
        break;
      case 'MAMEK054539':
        instrument = createMAMEK054539(config);
        break;
      case 'MAMEMEA8000':
        instrument = createMAMEMEA8000(config);
        break;
      case 'MAMERF5C400':
        instrument = createMAMERF5C400(config);
        break;
      case 'MAMESN76477':
        instrument = createMAMESN76477(config);
        break;
      case 'MAMESNKWave':
        instrument = createMAMESNKWave(config);
        break;
      case 'MAMESP0250':
        instrument = createMAMESP0250(config);
        break;
      case 'MAMETMS36XX':
        instrument = createMAMETMS36XX(config);
        break;
      case 'MAMETMS5220':
        instrument = createMAMETMS5220(config);
        break;
      case 'MAMETR707':
        instrument = createMAMETR707(config);
        break;
      case 'MAMEUPD931':
        instrument = createMAMEUPD931(config);
        break;
      case 'MAMEUPD933':
        instrument = createMAMEUPD933(config);
        break;
      case 'MAMEVotrax':
        instrument = createMAMEVotrax(config);
        break;
      case 'MAMEYMF271':
        instrument = createMAMEYMF271(config);
        break;
      case 'MAMEYMOPQ':
        instrument = createMAMEYMOPQ(config);
        break;
      case 'MAMEVASynth':
        instrument = createMAMEVASynth(config);
        break;

      case 'ModularSynth':
        instrument = createModularSynth(config);
        break;

      case 'ChiptuneModule':
        // ChiptuneModule requires module data - without it, fall back to basic synth
        // In a full implementation, this would use libopenmpt WASM
        console.log('[InstrumentFactory] ChiptuneModule - using fallback synth (requires module data)');
        instrument = createToneJSBasicSynth(config);
        break;

      case 'HivelySynth':
        instrument = new HivelySynth();
        break;

      case 'JamCrackerSynth':
        instrument = new JamCrackerSynth();
        break;

      case 'SoundMonSynth': {
        const smSynth = new SoundMonSynth();
        if (config.soundMon) {
          smSynth.setInstrument(config.soundMon).catch(err =>
            console.error('[InstrumentFactory] SoundMon load failed:', err)
          );
        }
        instrument = smSynth;
        break;
      }

      case 'SidMonSynth': {
        const sidSynth = new SidMonSynth();
        if (config.sidMon) {
          sidSynth.setInstrument(config.sidMon).catch(err =>
            console.error('[InstrumentFactory] SidMon load failed:', err)
          );
        }
        instrument = sidSynth;
        break;
      }

      case 'DigMugSynth': {
        const dmSynth = new DigMugSynth();
        if (config.digMug) {
          dmSynth.setInstrument(config.digMug).catch(err =>
            console.error('[InstrumentFactory] DigMug load failed:', err)
          );
        }
        instrument = dmSynth;
        break;
      }

      case 'FCSynth': {
        const fcSynth = new FCSynth();
        if (config.fc) {
          fcSynth.setInstrument(config.fc).catch(err =>
            console.error('[InstrumentFactory] FC load failed:', err)
          );
        }
        instrument = fcSynth;
        break;
      }

      case 'TFMXSynth': {
        const tfmxSynth = new TFMXSynth();
        if (config.tfmx) {
          tfmxSynth.setInstrument(config.tfmx).catch(err =>
            console.error('[InstrumentFactory] TFMX load failed:', err)
          );
        }
        instrument = tfmxSynth;
        break;
      }

      case 'SymphonieSynth': {
        const symphSynth = new SymphonieSynth();
        if (config.symphonie) {
          symphSynth.load({ symphonie: config.symphonie }).catch((err: unknown) =>
            console.error('[InstrumentFactory] Symphonie load failed:', err)
          );
        }
        instrument = symphSynth;
        break;
      }

      case 'SunVoxSynth': {
        const svSynth = new SunVoxSynth();
        if (config.sunvox?.patchData) {
          const loader = config.sunvox.isSong
            ? svSynth.setSong(config.sunvox.patchData)
            : svSynth.setModule(config.sunvox.patchData);
          loader.catch((err: unknown) =>
            console.error('[InstrumentFactory] SunVox patch load failed:', err)
          );
        }
        instrument = svSynth;
        break;
      }

      case 'FredSynth': {
        const fredSynth = new FredSynth();
        if (config.fred) {
          fredSynth.setInstrument(config.fred).catch(err =>
            console.error('[InstrumentFactory] Fred load failed:', err)
          );
        }
        instrument = fredSynth;
        break;
      }

      case 'HippelCoSoSynth': {
        const hcSynth = new HippelCoSoSynth();
        if (config.hippelCoso) {
          hcSynth.setInstrument(config.hippelCoso).catch(err =>
            console.error('[InstrumentFactory] HippelCoSo load failed:', err)
          );
        }
        instrument = hcSynth;
        break;
      }

      case 'RobHubbardSynth': {
        const rhSynth = new RobHubbardSynth();
        if (config.robHubbard) {
          rhSynth.setInstrument(config.robHubbard).catch(err =>
            console.error('[InstrumentFactory] RobHubbard load failed:', err)
          );
        }
        instrument = rhSynth;
        break;
      }

      case 'SidMon1Synth': {
        const sm1Synth = new SidMon1Synth();
        if (config.sidmon1) {
          sm1Synth.setInstrument(config.sidmon1).catch(err =>
            console.error('[InstrumentFactory] SidMon1 load failed:', err)
          );
        }
        instrument = sm1Synth;
        break;
      }

      case 'OctaMEDSynth': {
        const octaSynth = new OctaMEDSynth();
        if (config.octamed) {
          octaSynth.setInstrument(config.octamed).catch(err =>
            console.error('[InstrumentFactory] OctaMED load failed:', err)
          );
        }
        instrument = octaSynth;
        break;
      }

      case 'DavidWhittakerSynth': {
        const dwSynth = new DavidWhittakerSynth();
        if (config.davidWhittaker) {
          dwSynth.setInstrument(config.davidWhittaker).catch(err =>
            console.error('[InstrumentFactory] DavidWhittaker load failed:', err)
          );
        }
        instrument = dwSynth;
        break;
      }

      case 'SonicArrangerSynth': {
        const saSynth = new SonicArrangerSynth();
        if (config.sonicArranger) {
          saSynth.setInstrument(config.sonicArranger).catch(err =>
            console.error('[InstrumentFactory] SonicArranger load failed:', err)
          );
        }
        instrument = saSynth;
        break;
      }

      case 'UADESynth': {
        const uadeSynth = new UADESynth();
        if (config.uade) {
          // Fire-and-forget: load the file data into the UADE engine
          uadeSynth.setInstrument(config.uade).catch(err =>
            console.error('[InstrumentFactory] UADE load failed:', err)
          );
        }
        instrument = uadeSynth;
        break;
      }

      case 'SuperCollider': {
        const sc = config.superCollider ?? DEFAULT_SUPERCOLLIDER;
        const audioCtx = Tone.getContext().rawContext as AudioContext;
        instrument = new SuperColliderSynth(sc, audioCtx);
        break;
      }

      default: {
        // Check VSTBridge registry for dynamically registered synths
        const desc = SYNTH_REGISTRY.get(config.synthType);
        if (desc) {
          instrument = new VSTBridgeSynth(desc, config);
        } else {
          console.warn(`Unknown synth type: ${config.synthType}, defaulting to Synth`);
          instrument = createToneJSBasicSynth(config);
        }
      }
    }

    // Apply volume normalization for Furnace WASM synths
    // These route audio through native GainNodes (bypassing Tone.js gain),
    // so we use setVolumeOffset() to control the native gain
    if (config.synthType.startsWith('Furnace') && instrument) {
      const offset = VOLUME_NORMALIZATION_OFFSETS[config.synthType] ?? 0;
      if (offset !== 0 && 'setVolumeOffset' in instrument) {
        (instrument as unknown as { setVolumeOffset: (offset: number) => void }).setVolumeOffset(offset);
      }
    }

    return instrument;
  }

  /**
   * Create effect chain from config (delegates to EffectFactory)
   */
  public static async createEffectChain(
    effects: EffectConfig[]
  ): Promise<(Tone.ToneAudioNode | DevilboxSynth)[]> {
    const { createEffectChain } = await import('./factories/EffectFactory');
    return createEffectChain(effects);
  }

  /**
   * Create single effect instance (delegates to EffectFactory)
   */
  public static async createEffect(
    config: EffectConfig
  ): Promise<Tone.ToneAudioNode | DevilboxSynth> {
    const { createEffect } = await import('./factories/EffectFactory');
    return createEffect(config);
  }

  /**
   * Connect instrument through effect chain to destination
   */
  public static connectWithEffects(
    instrument: Tone.ToneAudioNode,
    effects: Tone.ToneAudioNode[],
    destination: Tone.ToneAudioNode
  ): void {
    if (effects.length === 0) {
      instrument.connect(destination);
      return;
    }

    // Connect instrument to first effect
    instrument.connect(effects[0]);

    // Chain effects together
    for (let i = 0; i < effects.length - 1; i++) {
      effects[i].connect(effects[i + 1]);
    }

    // Connect last effect to destination
    effects[effects.length - 1].connect(destination);
  }

  /**
   * Dispose of instrument and effects
   */
  public static disposeInstrument(
    instrument: Tone.ToneAudioNode,
    effects: Tone.ToneAudioNode[]
  ): void {
    // Dispose effects
    effects.forEach((fx) => fx.dispose());

    // Dispose instrument
    instrument.dispose();
  }
}
