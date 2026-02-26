/**
 * InstrumentFactory - Creates and manages synth instances
 * Factory class to create all synth types from InstrumentConfig.
 * Returns Tone.ToneAudioNode for Tone.js synths, or DevilboxSynth for native synths.
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig, PitchEnvelopeConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import {
  DEFAULT_SYNARE,
  DEFAULT_SAM,
  VOWEL_FORMANTS,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_DRUMKIT,
  DEFAULT_ORGAN,
  DEFAULT_POLYSYNTH,
  DEFAULT_SUPERSAW,
  DEFAULT_WAVETABLE,
  DEFAULT_FURNACE,
  DEFAULT_SPACE_LASER,
  DEFAULT_DUB_SIREN,
  DEFAULT_TB303,
  DEFAULT_PWM_SYNTH,
  DEFAULT_STRING_MACHINE,
  DEFAULT_CHIP_SYNTH,
} from '@/types/instrument';
import { TapeSaturation } from './effects/TapeSaturation';
import { HivelySynth } from './hively/HivelySynth';
import { SoundMonSynth } from './soundmon/SoundMonSynth';
import { SidMonSynth } from './sidmon/SidMonSynth';
import { DigMugSynth } from './digmug/DigMugSynth';
import { FCSynth } from './fc/FCSynth';
import { TFMXSynth } from './tfmx/TFMXSynth';
import { FredSynth } from './fred/FredSynth';
import { UADESynth } from './uade/UADESynth';
import { WavetableSynth } from './WavetableSynth';
import { NeuralEffectWrapper } from './effects/NeuralEffectWrapper';
import { SpaceEchoEffect } from './effects/SpaceEchoEffect';
import { SpaceyDelayerEffect } from './effects/SpaceyDelayerEffect';
import { RETapeEchoEffect } from './effects/RETapeEchoEffect';
import { BiPhaseEffect } from './effects/BiPhaseEffect';
import { DubFilterEffect } from './effects/DubFilterEffect';
import { MoogFilterEffect, MoogFilterModel, MoogFilterMode } from './effects/MoogFilterEffect';
import { MVerbEffect } from './effects/MVerbEffect';
import { LeslieEffect } from './effects/LeslieEffect';
import { SpringReverbEffect } from './effects/SpringReverbEffect';
import { VinylNoiseEffect } from './effects/VinylNoiseEffect';
import { ToneArmEffect } from './effects/ToneArmEffect';
import { isEffectBpmSynced, getEffectSyncDivision, computeSyncedValue, SYNCABLE_EFFECT_PARAMS } from './bpmSync';
import { SidechainCompressor } from './effects/SidechainCompressor';
import { ArpeggioEngine } from './ArpeggioEngine';
import { FurnaceSynth } from './FurnaceSynth';
import { FurnaceChipType } from './chips/FurnaceChipEngine';
import { FurnaceDispatchSynth, FurnaceDispatchPlatform } from './furnace-dispatch';
import { DrumKitSynth } from './DrumKitSynth';
import { DubSirenSynth } from './DubSirenSynth';
import { SpaceLaserSynth } from './SpaceLaserSynth';
import { SynareSynth } from './SynareSynth';
import { SAMSynth } from './sam/SAMSynth';
import { V2Synth } from './v2/V2Synth';
import { V2SpeechSynth } from './v2/V2SpeechSynth';
import { DB303Synth } from './db303/DB303Synth';
import { MAMESynth } from './MAMESynth';
import { BuzzmachineGenerator } from './buzzmachines/BuzzmachineGenerator';
import { BuzzmachineType } from './buzzmachines/BuzzmachineEngine';
import { DexedSynth } from './dexed/DexedSynth';
import { OBXdSynth } from './obxd/OBXdSynth';
import { CZ101Synth } from './cz101/CZ101Synth';
import { CEM3394Synth } from './cem3394/CEM3394Synth';
import { SCSPSynth } from './scsp/SCSPSynth';
import { VFXSynth } from './vfx/VFXSynth';
import { D50Synth } from './d50/D50Synth';
import { RdPianoSynth } from './rdpiano/RdPianoSynth';
import { MU2000Synth } from './mu2000/MU2000Synth';
// MAME Hardware Synths
import { AICASynth } from './aica/AICASynth';
import { ASCSynth } from './asc/ASCSynth';
import { AstrocadeSynth } from './astrocade/AstrocadeSynth';
import { C352Synth } from './c352/C352Synth';
import { ES5503Synth } from './es5503/ES5503Synth';
import { ICS2115Synth } from './ics2115/ICS2115Synth';
import { K054539Synth } from './k054539/K054539Synth';
import { MEA8000Synth } from './mea8000/MEA8000Synth';
import { RF5C400Synth } from './rf5c400/RF5C400Synth';
import { SN76477Synth } from './sn76477/SN76477Synth';
import { SNKWaveSynth } from './snkwave/SNKWaveSynth';
import { SP0250Synth } from './sp0250/SP0250Synth';
import { TMS36XXSynth } from './tms36xx/TMS36XXSynth';
import { TMS5220Synth } from './tms5220/TMS5220Synth';
import { TR707Synth } from './tr707/TR707Synth';
import { UPD931Synth } from './upd931/UPD931Synth';
import { UPD933Synth } from './upd933/UPD933Synth';
import { VotraxSynth } from './votrax/VotraxSynth';
import { YMF271Synth } from './ymf271/YMF271Synth';
import { YMOPQSynth } from './ymopq/YMOPQSynth';
import { VASynthSynth } from './vasynth/VASynthSynth';
import { WAMSynth } from './wam/WAMSynth';
import { WAMEffectNode } from './wam/WAMEffectNode';
import { WAM_EFFECT_URLS, WAM_SYNTH_URLS } from '@/constants/wamPlugins';
import { VSTBridgeSynth } from './vstbridge/VSTBridgeSynth';
import { SYNTH_REGISTRY } from './vstbridge/synth-registry';
import { ModularSynth } from './modular/ModularSynth';
import { DEFAULT_MODULAR_PATCH } from '@/types/modular';
import { SynthRegistry } from './registry/SynthRegistry';
import { EffectRegistry } from './registry/EffectRegistry';

/**
 * Returns the complete set of default parameters for a given effect type.
 * Single source of truth — matches InstrumentFactory.createEffect() constructor defaults.
 * Used by addEffect() to populate parameters so the store always has all params.
 */
export function getDefaultEffectParameters(type: string): Record<string, number | string> {
  // Try registry first
  const desc = EffectRegistry.get(type);
  if (desc) return desc.getDefaultParameters();

  // Fallback to switch for unregistered effects
  switch (type) {
    case 'Distortion':
      return { drive: 0.4, oversample: 'none' };
    case 'Reverb':
      return { decay: 1.5, preDelay: 0.01 };
    case 'Delay':
    case 'FeedbackDelay':
      return { time: 0.25, feedback: 0.5 };
    case 'Chorus':
      return { frequency: 1.5, delayTime: 3.5, depth: 0.7 };
    case 'Phaser':
      return { frequency: 0.5, octaves: 3, baseFrequency: 350 };
    case 'Tremolo':
      return { frequency: 10, depth: 0.5 };
    case 'Vibrato':
      return { frequency: 5, depth: 0.1 };
    case 'AutoFilter':
      return { frequency: 1, baseFrequency: 200, octaves: 2.6, filterType: 'lowpass' };
    case 'AutoPanner':
      return { frequency: 1, depth: 1 };
    case 'AutoWah':
      return { baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2, gain: 2, follower: 0.1 };
    case 'BitCrusher':
      return { bits: 4 };
    case 'Chebyshev':
      return { order: 2, oversample: 'none' };
    case 'FrequencyShifter':
      return { frequency: 0 };
    case 'PingPongDelay':
      return { time: 0.25, feedback: 0.5 };
    case 'PitchShift':
      return { pitch: 0, windowSize: 0.1, delayTime: 0, feedback: 0 };
    case 'Compressor':
      return { threshold: -24, ratio: 12, attack: 0.003, release: 0.25 };
    case 'EQ3':
      return { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 };
    case 'Filter':
      return { type: 'lowpass', frequency: 5000, rolloff: -12, Q: 1, gain: 0 };
    case 'JCReverb':
      return { roomSize: 0.5 };
    case 'StereoWidener':
      return { width: 0.5 };
    case 'TapeSaturation':
      return { drive: 50, tone: 12000 };
    case 'SidechainCompressor':
      return { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 6, sidechainGain: 100 };
    case 'SpaceEcho':
      return { mode: 4, rate: 300, intensity: 0.5, echoVolume: 0.8, reverbVolume: 0.3, bass: 0, treble: 0 };
    case 'SpaceyDelayer':
      return { firstTap: 250, tapSize: 150, feedback: 40, multiTap: 1, tapeFilter: 0 };
    case 'RETapeEcho':
      return { mode: 3, repeatRate: 0.5, intensity: 0.5, echoVolume: 0.8, wow: 0, flutter: 0, dirt: 0, inputBleed: 0, loopAmount: 0, playheadFilter: 1 };
    case 'BiPhase':
      return { rateA: 0.5, depthA: 0.6, rateB: 4.0, depthB: 0.4, feedback: 0.3, routing: 0 };
    case 'DubFilter':
      return { cutoff: 20, resonance: 30, gain: 1 };
    case 'MoogFilter':
      return { cutoff: 1000, resonance: 10, drive: 1.0, model: 0, filterMode: 0 };
    case 'MVerb':
      return { damping: 0.5, density: 0.5, bandwidth: 0.5, decay: 0.7, predelay: 0.0, size: 0.8, gain: 1.0, mix: 0.4, earlyMix: 0.5 };
    case 'Leslie':
      return { speed: 0.0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.5, width: 0.8, acceleration: 0.5 };
    case 'SpringReverb':
      return { decay: 0.6, damping: 0.4, tension: 0.5, mix: 0.35, drip: 0.5, diffusion: 0.7 };
    case 'VinylNoise':
      return { hiss: 50, dust: 58, age: 45, speed: 5.5,
               riaa: 52, stylusResonance: 50, wornStylus: 28,
               pinch: 35, innerGroove: 25, ghostEcho: 20,
               dropout: 10, warp: 10, eccentricity: 18 };  // "Played" condition at 33 RPM
    case 'ToneArm':
      return { wow: 20, coil: 50, flutter: 15, riaa: 50, stylus: 30, hiss: 20, pops: 15, rpm: 33.333 };
    default:
      return {};
  }
}

/** Map synthType strings to FurnaceDispatchPlatform values for non-FM chips */
const SYNTH_TO_DISPATCH: Record<string, number> = {
  // Console PSG chips
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
  // Commodore / Computer chips
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
  // Sample-based chips
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
  // Misc chips
  FurnaceBUBBLE: FurnaceDispatchPlatform.BUBSYS_WSG,
  FurnaceSM8521: FurnaceDispatchPlatform.SM8521,
  FurnaceT6W28: FurnaceDispatchPlatform.T6W28,
  FurnaceSUPERVISION: FurnaceDispatchPlatform.SUPERVISION,
  FurnaceUPD1771: FurnaceDispatchPlatform.UPD1771C,
  FurnaceSCVTONE: FurnaceDispatchPlatform.UPD1771C,
};

export class InstrumentFactory {
  /**
   * Volume normalization offsets in dB
   * Measured empirically to achieve consistent ~-10dB peak output at volume=-12dB
   * Positive values boost quiet synths, negative values reduce loud synths
   * Measured 2026-02-03 using browser AudioContext + Tone.Meter
   */
  private static readonly VOLUME_NORMALIZATION_OFFSETS: Record<string, number> = {
    // Tone.js built-in synths - calibrated 2026-02-04 via browser test runner
    'Synth': 11,           // Measured: -6.6dB → reduce 3
    'MonoSynth': 14,       // Measured: -11.9dB → increase 2
    'DuoSynth': 5,         // Measured: -3.2dB → reduce 7
    'FMSynth': 16,         // Measured: -9.1dB → reduce 1
    'AMSynth': 22,         // Measured: -13.2dB → increase 3
    'PluckSynth': 32,      // Calibrated: measured -18.3dB at 24, target -10dB
    'MetalSynth': 23,      // Kept (suspect: very short transient, meter may miss peak)
    'MembraneSynth': 10,   // Measured: +0.4dB → reduce 10
    'NoiseSynth': 7,       // Measured: -2.9dB → reduce 7
    'PolySynth': 8,        // Measured: -5.7dB → reduce 4
    // Custom synths (WASM and specialized engines)
    'TB303': 15,           // Calibrated: measured -24.9dB at offset 0. Raw peak ~-12.9dB. Target -10dB.
    'JC303': 15,           // Same engine as TB303
    'Buzz3o3': 5,          // Kept (WASM-dependent)
    'Furnace': 0,          // Generic Furnace - WASM dispatcher, no chip-specific output
    // Furnace FM chips - recalibrated 2026-02-13 via browser test runner
    'FurnaceOPN': 7,       // Measured: -10.0dB → on target
    'FurnaceOPM': 2,       // Measured: -10.1dB → on target
    'FurnaceOPL': 10,      // Measured: -9.5dB → on target
    'FurnaceOPLL': 12,     // Measured: variable (-10 to -34dB), using conservative +12
    'FurnaceESFM': 19,     // Measured: -28.6dB → need +19dB
    'FurnaceOPZ': -14,     // Measured: +3.8dB → need -14dB
    'FurnaceOPNA': 6,      // Measured: -15.7dB → need +6dB
    'FurnaceOPNB': 7,      // Measured: -17.4dB → need +7dB
    'FurnaceOPL4': 9,      // Measured: -18.6dB → need +9dB
    'FurnaceY8950': 9,     // Measured: -18.7dB → need +9dB
    'FurnaceVRC7': 8,      // Measured: variable (-9 to -26dB), using conservative +8
    'FurnaceOPN2203': -3,  // Measured: -7.5dB → need -3dB
    'FurnaceOPNBB': 2,     // Measured: -9.5dB → on target
    // Furnace Dispatch chips - recalibrated 2026-02-13 via browser test runner
    'FurnaceNES': 7,       // Measured: -9.8dB → on target
    'FurnaceGB': 4,        // Measured: -9.6dB → on target
    'FurnaceSNES': -10,    // Measured: -10.0dB → on target
    'FurnacePCE': 5,       // Measured: variable (-7 to -20dB), using moderate +5
    'FurnacePSG': 3,       // Measured: -9.1dB → on target
    'FurnaceVB': 16,       // Measured: -9.7dB → on target
    'FurnaceLynx': 3,      // Measured: -9.7dB → on target
    'FurnaceSWAN': 4,      // Measured: -9.9dB → on target
    'FurnaceVRC6': 3,      // Measured: -9.6dB → on target
    'FurnaceN163': 7,      // Measured: -10.5dB → on target
    'FurnaceFDS': 3,       // Measured: -8.2dB → on target
    'FurnaceMMC5': 37,     // Measured: -9.8dB → on target
    'FurnaceGBA': -10,     // Measured: -10.0dB → on target
    'FurnaceNDS': 3,       // Measured: -8.6dB → on target
    'FurnacePOKEMINI': -10, // Measured: -10.0dB → on target
    'FurnaceC64': 6,       // Measured: -11.1dB → on target
    'FurnaceSID6581': 6,   // Measured: -11.1dB → on target
    'FurnaceSID8580': 6,   // Measured: -11.1dB → on target
    'FurnaceAY': 3,        // Measured: -9.0dB → on target
    'FurnaceAY8930': 25,   // Measured: -32.4dB → need +22dB
    'FurnaceVIC': -1,      // Measured: -6.4dB → need -4dB (was +3, overcorrected)
    'FurnaceSAA': 6,       // Measured: -9.5dB → on target
    'FurnaceTED': -4,      // Measured: -10.0dB → on target
    'FurnaceVERA': 14,     // Measured: -13.4dB → need +3dB
    'FurnaceSCC': 9,       // Measured: -9.7dB → on target
    'FurnaceTIA': -7,      // Measured: -10.4dB → on target
    'FurnaceAMIGA': 15,    // Measured: -21.6dB → need +12dB
    'FurnacePET': -10,     // Measured: -10.0dB → on target
    'FurnacePCSPKR': -10,  // Measured: -10.0dB → on target
    'FurnaceZXBEEPER': -4, // Measured: -10.2dB → on target
    'FurnacePOKEY': 7,     // Measured: -9.7dB → on target
    'FurnacePONG': -10,    // Measured: -10.0dB → on target
    'FurnacePV1000': 3,    // Measured: -9.6dB → on target
    'FurnaceDAVE': 15,     // Measured: -21.6dB → need +12dB
    'FurnaceSU': 27,       // Measured: -29.4dB → need +19dB
    'FurnacePOWERNOISE': -4, // Measured: -10.4dB → on target
    'FurnaceSEGAPCM': -5,  // Measured: -10.4dB → on target
    'FurnaceQSOUND': 18,   // Measured: -22.9dB → need +13dB
    'FurnaceES5506': 80,   // Measured: -52.3dB → need +42dB
    'FurnaceRF5C68': 0,    // Silent - sample format mismatch (needs signed magnitude)
    'FurnaceC140': 33,     // Measured: -34.7dB → need +25dB
    'FurnaceK007232': -4,  // Measured: -9.9dB → on target
    'FurnaceK053260': 17,  // Measured: -24.0dB → need +14dB
    'FurnaceGA20': 3,      // Silent - sample format mismatch (needs unsigned 8-bit)
    'FurnaceOKI': 44,      // Silent - needs VOX ADPCM encoding
    'FurnaceYMZ280B': 39,  // Measured: -34.7dB → need +25dB
    'FurnaceX1_010': 15,   // Measured: -9.6dB → on target
    'FurnaceMSM6258': -10, // Measured: -10.1dB → on target
    'FurnaceMSM5232': 10,  // Measured: -9.8dB → on target
    'FurnaceMULTIPCM': 56, // Measured: -51.7dB → need +42dB
    'FurnaceNAMCO': -5,    // Measured: variable (-7 to +5dB), using conservative -5
    'FurnacePCMDAC': 8,    // Measured: -23.0dB → need +13dB
    'FurnaceBUBBLE': 3,    // Measured: -9.5dB → on target
    'FurnaceSM8521': 9,    // Measured: -16.2dB → need +6dB
    'FurnaceT6W28': 3,     // Measured: -8.3dB → on target
    'FurnaceSUPERVISION': -1, // Measured: -6.2dB → need -4dB (was +3, overcorrected)
    'FurnaceUPD1771': 9,   // Measured: -15.7dB → need +6dB
    'FurnaceSCVTONE': 3,   // Measured: -8.1dB → on target
    'BuzzKick': 3,         // Calibrated with output gain: measured -13.1dB, target -10
    'BuzzKickXP': 5,       // Calibrated with output gain: measured -21.7dB, target -10
    'BuzzNoise': 7,        // Calibrated with output gain: measured -22.3dB, target -10
    'BuzzTrilok': 5,       // Calibrated with output gain: measured -22.4dB, target -10
    'Buzz4FM2F': 7,        // Calibrated with output gain: measured -21.2dB, target -10
    'BuzzFreqBomb': 4,     // Calibrated with output gain: measured -21.3dB, target -10
    'Buzz3o3DF': 8,        // Calibrated with output gain: measured -13.8dB, target -10
    'Synare': 7,           // Measured: -7.1dB (OK)
    'DubSiren': 13,        // Measured: -0.5dB → reduce 10 (now uses getNormalizedVolume)
    'SpaceLaser': 24,      // Measured 2026-02-05: peak 1.2dB at offset 35 → need -11dB delta
    'V2': 0,               // Reset to 0 - WASM doesn't init in test, was unmeasured guess of 30
    'Sam': 16,             // Measured: -2.5dB → reduce 7 (now uses getNormalizedVolume)
    'SuperSaw': 9,         // Measured: -7.8dB (OK)
    'WobbleBass': 13,      // Measured: -0.4dB → reduce 10 (now uses getNormalizedVolume)
    'FormantSynth': 9,     // Measured: -7.3dB → reduce 3
    'StringMachine': 11,   // Measured: -8.6dB → increase 1
    'PWMSynth': 9,         // Measured: -9.1dB → increase 1
    'ChipSynth': 5,        // Measured: -5.1dB → reduce 5
    'Wavetable': 5,        // Calibrated: raw peak ~-3.4dB, gain=-12+5=-7 → target ~-10dB
    'Organ': 3,            // Measured: -2.8dB → reduce 7
    'Sampler': 10,         // Measured: -20.3dB → increase 10
    'Player': 10,          // Measured 2026-02-05: peak -19.6dB → need +10dB delta
    'GranularSynth': -47,  // Measured 2026-02-05: peak +45dB at offset 8 → need -55dB delta (engine runs very hot)
    'DrumMachine': 18,     // Measured 2026-02-05: peak -18.4dB at offset 10 → need +8dB delta
    'ChiptuneModule': -6,  // Measured: -3.8dB → decrease 6
    'DrumKit': 0,          // Kept (test sample may not load)
    // MAME/WASM synths - CAUTION: test runner can't measure these (WASM doesn't init in test)
    // These offsets are GUESSES. Only Dexed/OBXd reliably init in test environment.
    'MAMEVFX': 0,          // Reset to 0 - was unmeasured guess of 8
    'MAMEDOC': 0,          // Reset to 0 - was unmeasured guess of 8
    'MAMERSA': 0,          // Reset to 0 - was unmeasured guess of 8
    'MAMESWP30': 0,        // Reset to 0 - was unmeasured guess of 8
    'CZ101': 0,            // Reset to 0 - was unmeasured guess of 10
    'Dexed': 41,           // VERIFIED: measured -9.9dB with this offset (correct!)
    'OBXd': 9,             // VERIFIED: measured -10.0dB with this offset (correct!)
    'CEM3394': 19,         // Measured 2026-02-05: peak -29.2dB → need +19dB delta
    'SCSP': 15,            // Measured 2026-02-05: peak -25.2dB → need +15dB
    // MAME chip synths - calibrated 2026-02-07 via browser test runner
    'MAMEAstrocade': 18,   // Measured: -27.6dB → need +18dB
    'MAMESN76477': 5,      // Measured: -15.0dB → need +5dB
    'MAMEASC': 11,         // Measured: -21.4dB → need +11dB
    'MAMEES5503': 62,      // Measured: -72.1dB (nearly silent) → need +62dB
    'MAMEMEA8000': 12,     // Measured: -22.2dB → need +12dB
    'MAMESNKWave': 8,      // Measured: -18.2dB → need +8dB
    'MAMESP0250': 26,      // Measured: -35.8dB → need +26dB
    'MAMETMS36XX': 6,      // Measured: -16.5dB → need +6dB
    'MAMEVotrax': 20,      // Measured: -30.4dB → need +20dB
    'MAMEYMOPQ': 19,       // Measured 2026-02-07: -29.1dB → need +19dB
    'MAMEUPD931': 23,      // Measured: -33.2dB → need +23dB
    'MAMEUPD933': 28,      // Measured: -38.3dB → need +28dB
    'MAMETMS5220': 37,     // Measured: -47.2dB → need +37dB
    'MAMEYMF271': 15,      // Measured: -24.9dB → need +15dB
    'MAMETR707': 22,       // Measured 2026-02-07: -31.6dB → need +22dB
    'MAMEVASynth': 20,     // Measured: -30.0dB → need +20dB
    'MAMEAICA': 0,         // Silent (sample-playback chip, needs ROM + mapping)
    'MAMEICS2115': 35,     // Measured 2026-02-07: -44.6dB → need +35dB
    'MAMEK054539': 22,     // Measured 2026-02-07: -31.8dB → need +22dB
    'MAMEC352': 17,        // Measured 2026-02-07: -26.7dB → need +17dB
    'MAMERF5C400': 0,      // Silent (sample-playback chip, needs ROM + mapping)
    'ModularSynth': 0,     // Not yet calibrated
    'HivelySynth': 0,     // WASM song player — volume managed internally
    'UADESynth': 0,       // UADE exotic Amiga player — volume managed internally
  };

  /**
   * Get the normalized volume for a synth type
   * Applies synth-specific offset to achieve consistent output levels
   */
  private static getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
    const baseVolume = configVolume ?? -12;
    const offset = this.VOLUME_NORMALIZATION_OFFSETS[synthType] ?? 0;
    return baseVolume + offset;
  }

  /**
   * Create a synth instance based on InstrumentConfig.
   * Returns a Tone.ToneAudioNode for Tone.js synths, or a DevilboxSynth for native synths (e.g. WAM).
   */
  public static createInstrument(config: InstrumentConfig): Tone.ToneAudioNode | DevilboxSynth {
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
        instrument = this.createSynth(config);
        break;

      case 'MonoSynth':
        instrument = this.createMonoSynth(config);
        break;

      case 'DuoSynth':
        instrument = this.createDuoSynth(config);
        break;

      case 'FMSynth':
        instrument = this.createFMSynth(config);
        break;

      case 'AMSynth':
        instrument = this.createAMSynth(config);
        break;

      case 'PluckSynth':
        instrument = this.createPluckSynth(config);
        break;

      case 'MetalSynth':
        instrument = this.createMetalSynth(config);
        break;

      case 'MembraneSynth':
        instrument = this.createMembraneSynth(config);
        break;

      case 'NoiseSynth':
        instrument = this.createNoiseSynth(config);
        break;

      case 'TB303':
        instrument = this.createTB303(config);
        break;

      case 'Furnace':
        instrument = this.createFurnace(config);
        break;

      case 'Buzzmachine':
        instrument = this.createBuzzmachine(config);
        break;

      // Furnace Chip Types - using FurnaceChipType enum for correct IDs
      case 'FurnaceOPN':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPN2);
        break;
      case 'FurnaceOPM':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPM);
        break;
      case 'FurnaceOPL':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPL3);
        break;
      case 'FurnaceOPLL':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPLL);
        break;
      case 'FurnaceESFM':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.ESFM);
        break;
      case 'FurnaceOPZ':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPZ);
        break;
      case 'FurnaceOPNA':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPNA);
        break;
      case 'FurnaceOPNB':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPNB);
        break;
      case 'FurnaceOPL4':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPL4);
        break;
      case 'FurnaceY8950':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.Y8950);
        break;
      case 'FurnaceVRC7':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPLL); // VRC7 uses OPLL core
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
      case 'FurnaceT6W28': case 'FurnaceSUPERVISION': case 'FurnaceUPD1771': {
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
          instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPN2);
        }
        break;
      }

      // FM chips that stay on FurnaceSynth (already produce audio)
      case 'FurnaceOPN2203':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPN);
        break;
      case 'FurnaceOPNBB':
        instrument = this.createFurnaceWithChip(config, FurnaceChipType.OPNB_B);
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
          instrument = this.createPlayer(config); // Use Player for period-based playback
        } else {
          console.log('[InstrumentFactory] Using Sampler for regular sample playback');
          instrument = this.createSampler(config); // Use Sampler for regular samples
        }
        break;
      }

      case 'Player':
        instrument = this.createPlayer(config);
        break;

      case 'Wavetable':
        instrument = this.createWavetable(config);
        break;

      case 'GranularSynth':
        instrument = this.createGranularSynth(config);
        break;

      // New synths
      case 'SuperSaw':
        instrument = this.createSuperSaw(config);
        break;

      case 'PolySynth':
        instrument = this.createPolySynth(config);
        break;

      case 'Organ':
        instrument = this.createOrgan(config);
        break;

      case 'DrumMachine':
        instrument = this.createDrumMachine(config);
        break;

      case 'ChipSynth':
        instrument = this.createChipSynth(config);
        break;

      case 'PWMSynth':
        instrument = this.createPWMSynth(config);
        break;

      case 'StringMachine':
        instrument = this.createStringMachine(config);
        break;

      case 'FormantSynth':
        instrument = this.createFormantSynth(config);
        break;

      case 'WobbleBass':
        instrument = this.createWobbleBass(config);
        break;

      case 'DrumKit':
        instrument = this.createDrumKit(config);
        break;

      case 'DubSiren':
        instrument = this.createDubSiren(config);
        break;

      case 'SpaceLaser':
        instrument = this.createSpaceLaser(config);
        break;

      case 'V2':
      case 'V2Speech':
        instrument = this.createV2(config);
        break;

      case 'Sam':
        instrument = this.createSam(config);
        break;

      case 'Synare':
        instrument = this.createSynare(config);
        break;

      case 'WAMOBXd':
      case 'WAMSynth101':
      case 'WAMTinySynth':
      case 'WAMFaustFlute':
        instrument = this.createNamedWAM(config);
        break;

      case 'WAM':
        instrument = this.createWAM(config);
        break;

      // JUCE WASM Synths
      case 'Dexed':
        instrument = this.createDexed(config);
        break;

      case 'OBXd':
        instrument = this.createOBXd(config);
        break;

      case 'MAMEVFX':
      case 'VFX':
        instrument = this.createVFX(config);
        break;

      case 'D50':
        instrument = this.createD50(config);
        break;

      case 'MAMEDOC':
        instrument = new MAMESynth({ type: 'doc' });
        break;

      case 'MAMERSA':
        instrument = this.createRdPiano(config);
        break;

      case 'MAMESWP30':
        instrument = this.createMU2000(config);
        break;

      case 'CZ101':
        instrument = this.createCZ101(config);
        break;

      case 'CEM3394':
        instrument = this.createCEM3394(config);
        break;

      case 'SCSP':
        instrument = this.createSCSP(config);
        break;

      // Buzzmachine Generators (WASM-emulated Buzz synths)
      // Non-303 Buzz synths: apply volume via output gain (setVolume is no-op for non-303)
      case 'BuzzDTMF':
        instrument = this.createBuzzGenerator(BuzzmachineType.CYANPHASE_DTMF, 'BuzzDTMF', config);
        break;
      case 'BuzzFreqBomb':
        instrument = this.createBuzzGenerator(BuzzmachineType.ELENZIL_FREQUENCYBOMB, 'BuzzFreqBomb', config);
        break;
      case 'BuzzKick':
        instrument = this.createBuzzGenerator(BuzzmachineType.FSM_KICK, 'BuzzKick', config);
        break;
      case 'BuzzKickXP':
        instrument = this.createBuzzGenerator(BuzzmachineType.FSM_KICKXP, 'BuzzKickXP', config);
        break;
      case 'BuzzNoise':
        instrument = this.createBuzzGenerator(BuzzmachineType.JESKOLA_NOISE, 'BuzzNoise', config);
        break;
      case 'BuzzTrilok':
        instrument = this.createBuzzGenerator(BuzzmachineType.JESKOLA_TRILOK, 'BuzzTrilok', config);
        break;
      case 'Buzz4FM2F':
        instrument = this.createBuzzGenerator(BuzzmachineType.MADBRAIN_4FM2F, 'Buzz4FM2F', config);
        break;
      case 'BuzzDynamite6':
        instrument = this.createBuzzGenerator(BuzzmachineType.MADBRAIN_DYNAMITE6, 'BuzzDynamite6', config);
        break;
      case 'BuzzM3':
        instrument = this.createBuzzGenerator(BuzzmachineType.MAKK_M3, 'BuzzM3', config);
        break;
      case 'Buzz3o3':
        instrument = this.createBuzz3o3(config);
        break;
      case 'Buzz3o3DF':
        instrument = this.createBuzz3o3DF(config);
        break;
      case 'BuzzM4':
        instrument = this.createBuzzGenerator(BuzzmachineType.MAKK_M4, 'BuzzM4', config);
        break;

      // MAME Hardware-Accurate Synths
      case 'MAMEAICA':
        instrument = this.createMAMEAICA(config);
        break;
      case 'MAMEASC':
        instrument = this.createMAMEASC(config);
        break;
      case 'MAMEAstrocade':
        instrument = this.createMAMEAstrocade(config);
        break;
      case 'MAMEC352':
        instrument = this.createMAMEC352(config);
        break;
      case 'MAMEES5503':
        instrument = this.createMAMEES5503(config);
        break;
      case 'MAMEICS2115':
        instrument = this.createMAMEICS2115(config);
        break;
      case 'MAMEK054539':
        instrument = this.createMAMEK054539(config);
        break;
      case 'MAMEMEA8000':
        instrument = this.createMAMEMEA8000(config);
        break;
      case 'MAMERF5C400':
        instrument = this.createMAMERF5C400(config);
        break;
      case 'MAMESN76477':
        instrument = this.createMAMESN76477(config);
        break;
      case 'MAMESNKWave':
        instrument = this.createMAMESNKWave(config);
        break;
      case 'MAMESP0250':
        instrument = this.createMAMESP0250(config);
        break;
      case 'MAMETMS36XX':
        instrument = this.createMAMETMS36XX(config);
        break;
      case 'MAMETMS5220':
        instrument = this.createMAMETMS5220(config);
        break;
      case 'MAMETR707':
        instrument = this.createMAMETR707(config);
        break;
      case 'MAMEUPD931':
        instrument = this.createMAMEUPD931(config);
        break;
      case 'MAMEUPD933':
        instrument = this.createMAMEUPD933(config);
        break;
      case 'MAMEVotrax':
        instrument = this.createMAMEVotrax(config);
        break;
      case 'MAMEYMF271':
        instrument = this.createMAMEYMF271(config);
        break;
      case 'MAMEYMOPQ':
        instrument = this.createMAMEYMOPQ(config);
        break;
      case 'MAMEVASynth':
        instrument = this.createMAMEVASynth(config);
        break;

      case 'ModularSynth':
        instrument = this.createModularSynth(config);
        break;

      case 'ChiptuneModule':
        // ChiptuneModule requires module data - without it, fall back to basic synth
        // In a full implementation, this would use libopenmpt WASM
        console.log('[InstrumentFactory] ChiptuneModule - using fallback synth (requires module data)');
        instrument = this.createSynth(config);
        break;

      case 'HivelySynth':
        instrument = new HivelySynth();
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

      default: {
        // Check VSTBridge registry for dynamically registered synths
        const desc = SYNTH_REGISTRY.get(config.synthType);
        if (desc) {
          instrument = new VSTBridgeSynth(desc, config);
        } else {
          console.warn(`Unknown synth type: ${config.synthType}, defaulting to Synth`);
          instrument = this.createSynth(config);
        }
      }
    }

    // Apply volume normalization for Furnace WASM synths
    // These route audio through native GainNodes (bypassing Tone.js gain),
    // so we use setVolumeOffset() to control the native gain
    if (config.synthType.startsWith('Furnace') && instrument) {
      const offset = this.VOLUME_NORMALIZATION_OFFSETS[config.synthType] ?? 0;
      if (offset !== 0 && 'setVolumeOffset' in instrument) {
        (instrument as unknown as { setVolumeOffset: (offset: number) => void }).setVolumeOffset(offset);
      }
    }

    return instrument;
  }

  /**
   * Create effect chain from config (now async for neural effects)
   */
  public static async createEffectChain(
    effects: EffectConfig[]
  ): Promise<(Tone.ToneAudioNode | DevilboxSynth)[]> {
    const enabled = effects.filter((fx) => fx.enabled);
    return Promise.all(enabled.map((fx) => this.createEffect(fx)));
  }

  /**
   * Create single effect instance (now async for neural effects)
   */
  public static async createEffect(
    config: EffectConfig
  ): Promise<Tone.ToneAudioNode | DevilboxSynth> {
    const wetValue = config.wet / 100;
    // Helper: Tone.js expects specific numeric/string params; our EffectConfig stores them as number|string
    const p = config.parameters as Record<string, number & string>;

    // Try EffectRegistry first
    const effectDesc = await EffectRegistry.ensure(config.type);
    if (effectDesc) {
      const registryNode = await effectDesc.create(config);
      (registryNode as Tone.ToneAudioNode & { _fxType?: string })._fxType = config.type;
      return registryNode;
    }

    // Neural effects
    if (config.category === 'neural') {
      if (config.neuralModelIndex === undefined) {
        throw new Error('Neural effect requires neuralModelIndex');
      }

      const wrapper = new NeuralEffectWrapper({
        modelIndex: config.neuralModelIndex,
        wet: wetValue,
      });

      await wrapper.loadModel();

      // Set all parameters from config
      Object.entries(config.parameters).forEach(([key, value]) => {
        wrapper.setParameter(key, value as number);
      });

      return wrapper;
    }

    // Tone.js effects
    let node: Tone.ToneAudioNode | DevilboxSynth;
    
    switch (config.type) {
      case 'Distortion':
        node = new Tone.Distortion({
          distortion: p.drive || 0.4,
          oversample: p.oversample || 'none',
          wet: wetValue,
        });
        break;

      case 'Reverb': {
        const reverb = new Tone.Reverb({
          decay: p.decay || 1.5,
          preDelay: p.preDelay || 0.01,
          wet: wetValue,
        });
        // Reverb needs to generate its impulse response before it can process audio
        await reverb.ready;
        node = reverb;
        break;
      }

      case 'Delay':
        node = new Tone.FeedbackDelay({
          delayTime: p.time || 0.25,
          feedback: p.feedback || 0.5,
          wet: wetValue,
        });
        break;

      case 'Chorus': {
        const chorus = new Tone.Chorus({
          frequency: p.frequency || 1.5,
          delayTime: p.delayTime || 3.5,
          depth: p.depth || 0.7,
          wet: wetValue,
        });
        chorus.start(); // Start LFO
        node = chorus;
        break;
      }

      case 'Phaser':
        node = new Tone.Phaser({
          frequency: p.frequency || 0.5,
          octaves: p.octaves || 3,
          baseFrequency: p.baseFrequency || 350,
          wet: wetValue,
        });
        break;

      case 'Tremolo': {
        const tremolo = new Tone.Tremolo({
          frequency: p.frequency || 10,
          depth: p.depth || 0.5,
          wet: wetValue,
        });
        tremolo.start(); // Start LFO
        node = tremolo;
        break;
      }

      case 'Vibrato': {
        const vibrato = new Tone.Vibrato({
          frequency: p.frequency || 5,
          depth: p.depth || 0.1,
          wet: wetValue,
        });
        node = vibrato;
        break;
      }

      case 'AutoFilter': {
        const autoFilter = new Tone.AutoFilter({
          frequency: p.frequency || 1,
          baseFrequency: p.baseFrequency || 200,
          octaves: p.octaves || 2.6,
          filter: {
            type: p.filterType || 'lowpass',
            rolloff: -12,
            Q: 1,
          },
          wet: wetValue,
        });
        autoFilter.start(); // Start LFO
        node = autoFilter;
        break;
      }

      case 'AutoPanner': {
        const autoPanner = new Tone.AutoPanner({
          frequency: p.frequency || 1,
          depth: p.depth || 1,
          wet: wetValue,
        });
        autoPanner.start(); // Start LFO
        node = autoPanner;
        break;
      }

      case 'AutoWah':
        node = new Tone.AutoWah({
          baseFrequency: p.baseFrequency || 100,
          octaves: p.octaves || 6,
          sensitivity: p.sensitivity || 0,
          Q: p.Q || 2,
          gain: p.gain || 2,
          follower: p.follower || 0.1,
          wet: wetValue,
        });
        break;

      case 'BitCrusher': {
        // Use Tone.Distortion with a staircase WaveShaper curve instead of
        // Tone.BitCrusher. The latter uses an AudioWorklet that fails to
        // initialize due to standardized-audio-context's AudioWorkletNode
        // throwing InvalidStateError (even though the native API works).
        // A WaveShaper-based approach is synchronous and fully reliable.
        const bitsValue = Number(p.bits) || 4;
        const crusher = new Tone.Distortion({ distortion: 0, wet: wetValue, oversample: 'none' });
        const step = Math.pow(0.5, bitsValue - 1);
        (crusher as unknown as { _shaper: { setMap: (fn: (v: number) => number, len?: number) => void } })
          ._shaper.setMap((val: number) => step * Math.floor(val / step + 0.5), 4096);
        // Tag for parameter updates in applyEffectParametersDiff
        (crusher as unknown as Record<string, unknown>)._isBitCrusher = true;
        (crusher as unknown as Record<string, unknown>)._bitsValue = bitsValue;
        node = crusher;
        break;
      }

      case 'Chebyshev':
        node = new Tone.Chebyshev({
          order: p.order || 2,
          oversample: p.oversample || 'none',
          wet: wetValue,
        });
        break;

      case 'FeedbackDelay':
        node = new Tone.FeedbackDelay({
          delayTime: p.time || 0.25,
          feedback: p.feedback || 0.5,
          wet: wetValue,
        });
        break;

      case 'FrequencyShifter':
        node = new Tone.FrequencyShifter({
          frequency: p.frequency || 0,
          wet: wetValue,
        });
        break;

      case 'PingPongDelay':
        node = new Tone.PingPongDelay({
          delayTime: p.time || 0.25,
          feedback: p.feedback || 0.5,
          wet: wetValue,
        });
        break;

      case 'PitchShift':
        node = new Tone.PitchShift({
          pitch: p.pitch || 0,
          windowSize: p.windowSize || 0.1,
          delayTime: p.delayTime || 0,
          feedback: p.feedback || 0,
          wet: wetValue,
        });
        break;

      case 'Compressor':
        node = new Tone.Compressor({
          threshold: p.threshold || -24,
          ratio: p.ratio || 12,
          attack: p.attack || 0.003,
          release: p.release || 0.25,
        });
        break;

      case 'EQ3':
        node = new Tone.EQ3({
          low: p.low || 0,
          mid: p.mid || 0,
          high: p.high || 0,
          lowFrequency: p.lowFrequency || 400,
          highFrequency: p.highFrequency || 2500,
        });
        break;

      case 'Filter':
        node = new Tone.Filter({
          type: p.type || 'lowpass',
          frequency: p.frequency || 5000,
          rolloff: p.rolloff || -12,
          Q: p.Q || 1,
          gain: p.gain || 0,
        });
        break;

      case 'JCReverb': {
        const jcr = new Tone.JCReverb({
          roomSize: p.roomSize || 0.5,
          wet: wetValue,
        });
        // JCReverb uses 4 FeedbackCombFilter AudioWorklets that load async.
        // Wait for them to connect before returning, otherwise wet path is silent.
        const combFilters = (jcr as unknown as { _feedbackCombFilters: { _worklet?: AudioWorkletNode }[] })._feedbackCombFilters;
        if (combFilters?.length) {
          for (let attempt = 0; attempt < 50; attempt++) {
            if (combFilters.every(f => f._worklet)) break;
            await new Promise(r => setTimeout(r, 20));
          }
        }
        node = jcr;
        break;
      }

      case 'StereoWidener':
        node = new Tone.StereoWidener({
          width: p.width || 0.5,
        });
        break;

      case 'TapeSaturation':
        node = new TapeSaturation({
          drive: (p.drive || 50) / 100,   // 0-100 -> 0-1
          tone: p.tone || 12000,          // Hz
          wet: wetValue,
        });
        break;

      case 'SidechainCompressor':
        node = new SidechainCompressor({
          threshold: p.threshold ?? -24,
          ratio: p.ratio ?? 4,
          attack: p.attack ?? 0.003,
          release: p.release ?? 0.25,
          knee: p.knee ?? 6,
          sidechainGain: (p.sidechainGain ?? 100) / 100,
          wet: wetValue,
        });
        break;

      case 'SpaceEcho':
        node = new SpaceEchoEffect({
          mode: Number(p.mode) || 4,
          rate: Number(p.rate) || 300,
          intensity: Number(p.intensity) || 0.5,
          echoVolume: Number(p.echoVolume) || 0.8,
          reverbVolume: Number(p.reverbVolume) || 0.3,
          bass: Number(p.bass) || 0,
          treble: Number(p.treble) || 0,
          wet: wetValue,
        });
        break;

      case 'SpaceyDelayer':
        node = new SpaceyDelayerEffect({
          firstTap: Number(p.firstTap) || 250,
          tapSize: Number(p.tapSize) || 150,
          feedback: Number(p.feedback) || 40,
          multiTap: p.multiTap != null ? Number(p.multiTap) : 1,
          tapeFilter: Number(p.tapeFilter) || 0,
          wet: wetValue,
        });
        break;

      case 'RETapeEcho':
        node = new RETapeEchoEffect({
          mode: p.mode != null ? Number(p.mode) : 3,
          repeatRate: Number(p.repeatRate) || 0.5,
          intensity: Number(p.intensity) || 0.5,
          echoVolume: Number(p.echoVolume) || 0.8,
          wow: Number(p.wow) || 0,
          flutter: Number(p.flutter) || 0,
          dirt: Number(p.dirt) || 0,
          inputBleed: p.inputBleed != null ? Number(p.inputBleed) : 0,
          loopAmount: Number(p.loopAmount) || 0,
          playheadFilter: p.playheadFilter != null ? Number(p.playheadFilter) : 1,
          wet: wetValue,
        });
        break;

      case 'BiPhase':
        node = new BiPhaseEffect({
          rateA: Number(p.rateA) || 0.5,
          depthA: Number(p.depthA) || 0.6,
          rateB: Number(p.rateB) || 4.0,
          depthB: Number(p.depthB) || 0.4,
          feedback: Number(p.feedback) || 0.3,
          routing: Number(p.routing) === 1 ? 'series' : 'parallel',
          wet: wetValue,
        });
        break;

      case 'DubFilter':
        node = new DubFilterEffect({
          cutoff: Number(p.cutoff) || 20,
          resonance: Number(p.resonance) || 30,
          gain: Number(p.gain) || 1,
          wet: wetValue,
        });
        break;

      // Buzzmachines
      case 'BuzzDistortion': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('ArguruDistortion');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzSVF': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('ElakSVF');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzDelay': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaDelay');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzChorus': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMChorus');

        // Apply parameters from config
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) {
            synth.setParameter(paramIndex, value as number);
          }
        });

        node = synth;
        break;
      }

      case 'BuzzCompressor': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('GeonikCompressor');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzOverdrive': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('GeonikOverdrive');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzDistortion2': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaDistortion');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzCrossDelay': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaCrossDelay');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzPhilta': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMPhilta');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzDist2': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('ElakDist2');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzFreeverb': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('JeskolaFreeverb');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzFreqShift': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('BigyoFrequencyShifter');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzNotch': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('CyanPhaseNotch');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzStereoGain': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('DedaCodeStereoGain');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzSoftSat': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('GraueSoftSat');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzLimiter': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('LdSLimit');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzExciter': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('OomekExciter');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzMasterizer': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('OomekMasterizer');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzStereoDist': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('WhiteNoiseStereoDist');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzWhiteChorus': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('WhiteNoiseWhiteChorus');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzZfilter': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('QZfilter');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzChorus2': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMChorus2');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      case 'BuzzPanzerDelay': {
        const { BuzzmachineSynth } = await import('./buzzmachines/BuzzmachineSynth');
        const synth = new BuzzmachineSynth('FSMPanzerDelay');
        Object.entries(config.parameters).forEach(([key, value]) => {
          const paramIndex = parseInt(key, 10);
          if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
        });
        node = synth;
        break;
      }

      // WASM effects
      case 'MoogFilter':
        node = new MoogFilterEffect({
          cutoff: Number(p.cutoff) || 1000,
          resonance: (Number(p.resonance) || 10) / 100,  // 0-100 -> 0-1
          drive: Number(p.drive) || 1.0,
          model: (Number(p.model) || MoogFilterModel.Hyperion) as MoogFilterModel,
          filterMode: (Number(p.filterMode) || MoogFilterMode.LP4) as MoogFilterMode,
          wet: wetValue,
        });
        break;

      case 'MVerb':
        node = new MVerbEffect({
          damping: Number(p.damping),
          density: Number(p.density),
          bandwidth: Number(p.bandwidth),
          decay: Number(p.decay),
          predelay: Number(p.predelay),
          size: Number(p.size),
          gain: Number(p.gain),
          mix: Number(p.mix),
          earlyMix: Number(p.earlyMix),
          wet: wetValue,
        });
        break;

      case 'Leslie':
        node = new LeslieEffect({
          speed: Number(p.speed),
          hornRate: Number(p.hornRate),
          drumRate: Number(p.drumRate),
          hornDepth: Number(p.hornDepth),
          drumDepth: Number(p.drumDepth),
          doppler: Number(p.doppler),
          width: Number(p.width),
          acceleration: Number(p.acceleration),
          wet: wetValue,
        });
        break;

      case 'SpringReverb':
        node = new SpringReverbEffect({
          decay: Number(p.decay),
          damping: Number(p.damping),
          tension: Number(p.tension),
          mix: Number(p.mix),
          drip: Number(p.drip),
          diffusion: Number(p.diffusion),
          wet: wetValue,
        });
        break;

      case 'ToneArm': {
        const node = new ToneArmEffect({
          wow:     (p.wow     != null ? Number(p.wow)     : 20) / 100,
          coil:    (p.coil    != null ? Number(p.coil)    : 50) / 100,
          flutter: (p.flutter != null ? Number(p.flutter) : 15) / 100,
          riaa:    (p.riaa    != null ? Number(p.riaa)    : 50) / 100,
          stylus:  (p.stylus  != null ? Number(p.stylus)  : 30) / 100,
          hiss:    (p.hiss    != null ? Number(p.hiss)    : 20) / 100,
          pops:    (p.pops    != null ? Number(p.pops)    : 15) / 100,
          rpm:     (p.rpm     != null ? Number(p.rpm)     : 33.333),
          wet:     wetValue,
        });
        (node as Tone.ToneAudioNode & { _fxType?: string })._fxType = 'ToneArm';
        return node;
      }

      case 'VinylNoise': {
        const node = new VinylNoiseEffect({
          hiss:            (p.hiss            != null ? Number(p.hiss)            : 20)  / 100,
          dust:            (p.dust            != null ? Number(p.dust)            : 30)  / 100,
          age:             (p.age             != null ? Number(p.age)             : 18)  / 100,
          speed:           (p.speed           != null ? Number(p.speed)           : 5.5) / 100,
          riaa:            (p.riaa            != null ? Number(p.riaa)            : 30)  / 100,
          stylusResonance: (p.stylusResonance != null ? Number(p.stylusResonance) : 25)  / 100,
          wornStylus:      (p.wornStylus      != null ? Number(p.wornStylus)      : 0)   / 100,
          pinch:           (p.pinch           != null ? Number(p.pinch)           : 15)  / 100,
          innerGroove:     (p.innerGroove     != null ? Number(p.innerGroove)     : 0)   / 100,
          ghostEcho:       (p.ghostEcho       != null ? Number(p.ghostEcho)       : 0)   / 100,
          dropout:         (p.dropout         != null ? Number(p.dropout)         : 0)   / 100,
          warp:            (p.warp            != null ? Number(p.warp)            : 0)   / 100,
          eccentricity:    (p.eccentricity    != null ? Number(p.eccentricity)    : 0)   / 100,
          wet: wetValue,
        });
        (node as Tone.ToneAudioNode & { _fxType?: string })._fxType = 'VinylNoise';
        return node;
      }

      // WAM 2.0 effects
      case 'WAMBigMuff':
      case 'WAMTS9':
      case 'WAMDistoMachine':
      case 'WAMQuadraFuzz':
      case 'WAMVoxAmp':
      case 'WAMStonePhaser':
      case 'WAMPingPongDelay':
      case 'WAMFaustDelay':
      case 'WAMPitchShifter':
      case 'WAMGraphicEQ':
      case 'WAMPedalboard': {
        const wamUrl = WAM_EFFECT_URLS[config.type];
        if (!wamUrl) {
          console.warn(`[InstrumentFactory] No WAM URL for effect: ${config.type}`);
          node = new Tone.Gain(1);
          break;
        }
        const wamNode = new WAMEffectNode({ moduleUrl: wamUrl, wet: wetValue });
        await wamNode.ensureInitialized();
        node = wamNode;
        break;
      }

      default:
        console.warn(`Unknown effect type: ${config.type}, creating bypass`);
        node = new Tone.Gain(1);
    }

    // Attach type metadata for identification in the engine
    (node as Tone.ToneAudioNode & { _fxType?: string })._fxType = config.type;

    // Apply initial BPM-synced values if sync is enabled
    if (isEffectBpmSynced(config.parameters)) {
      const syncEntries = SYNCABLE_EFFECT_PARAMS[config.type];
      if (syncEntries) {
        const bpm = Tone.getTransport().bpm.value;
        const division = getEffectSyncDivision(config.parameters);
        for (const entry of syncEntries) {
          const value = computeSyncedValue(bpm, division, entry.unit);
          // Apply directly via the same pattern as ToneEngine.applyBpmSyncedParam
          switch (config.type) {
            case 'Delay':
            case 'FeedbackDelay':
              if (entry.param === 'time' && node instanceof Tone.FeedbackDelay) node.delayTime.value = value;
              break;
            case 'PingPongDelay':
              if (entry.param === 'time' && node instanceof Tone.PingPongDelay) node.delayTime.value = value;
              break;
            case 'SpaceEcho':
              if (entry.param === 'rate' && node instanceof SpaceEchoEffect) node.setRate(value);
              break;
            case 'SpaceyDelayer':
              if (entry.param === 'firstTap' && node instanceof SpaceyDelayerEffect) node.setFirstTap(value);
              break;
            case 'RETapeEcho':
              if (entry.param === 'repeatRate' && node instanceof RETapeEchoEffect) node.setRepeatRate(value);
              break;
            case 'Chorus':
              if (entry.param === 'frequency' && node instanceof Tone.Chorus) node.frequency.value = value;
              break;
            case 'BiPhase':
              if (entry.param === 'rateA' && node instanceof BiPhaseEffect) (node as unknown as { rateA: number }).rateA = value;
              break;
          }
        }
      }
    }

    return node;
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

  // ============================================================================
  // PRIVATE SYNTH CREATORS
  // ============================================================================

  private static createSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType,
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      volume: this.getNormalizedVolume('Synth', config.volume),
    });
    if (config.oscillator?.detune) {
      synth.set({ detune: config.oscillator.detune });
    }

    // Setup pitch envelope if enabled
    const pitchEnv = config.pitchEnvelope;
    const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

    // If no pitch envelope, return wrapped synth with voice leak prevention
    if (!hasPitchEnv) {
      return {
        triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
          // Release any existing voice for this note first to prevent voice leak
          try { synth.triggerRelease(note, time); } catch { /* ignore */ }
          synth.triggerAttackRelease(note, duration, time, velocity);
        },
        triggerAttack: (note: string, time?: number, velocity?: number) => {
          // Release any existing voice for this note first to prevent voice leak
          try { synth.triggerRelease(note, time); } catch { /* ignore */ }
          synth.triggerAttack(note, time, velocity);
        },
        triggerRelease: (note: string, time?: number) => {
          synth.triggerRelease(note, time);
        },
        releaseAll: () => synth.releaseAll(),
        connect: (dest: Tone.InputNode) => synth.connect(dest),
        disconnect: () => synth.disconnect(),
        dispose: () => synth.dispose(),
        volume: synth.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    // Wrap synth to add pitch envelope support
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, t); } catch { /* ignore */ }
        this.applyPitchEnvelope(synth, pitchEnv!, t, duration);
        synth.triggerAttackRelease(note, duration, t, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, t); } catch { /* ignore */ }
        this.triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
        synth.triggerAttack(note, t, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        this.triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
        synth.triggerRelease(note, t);
      },
      releaseAll: () => {
        synth.set({ detune: 0 });
        synth.releaseAll();
      },
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  private static createMonoSynth(config: InstrumentConfig): Tone.MonoSynth {
    // Build base config first
    const monoConfig: Record<string, unknown> = {
      oscillator: {
        type: (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType,
        detune: config.oscillator?.detune || 0,
      },
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      volume: this.getNormalizedVolume('MonoSynth', config.volume),
    };

    // Only add filter if all required properties exist (don't pass undefined)
    if (config.filter && config.filter.type && config.filter.frequency) {
      monoConfig.filter = {
        type: config.filter.type,
        frequency: config.filter.frequency,
        Q: config.filter.Q ?? 1,
        rolloff: config.filter.rolloff ?? -12,
      };
    }

    // Only add filterEnvelope if all required properties exist (don't pass undefined)
    if (config.filterEnvelope &&
        config.filterEnvelope.baseFrequency !== undefined &&
        config.filterEnvelope.attack !== undefined) {
      monoConfig.filterEnvelope = {
        baseFrequency: config.filterEnvelope.baseFrequency,
        octaves: config.filterEnvelope.octaves ?? 3,
        attack: config.filterEnvelope.attack / 1000,
        decay: (config.filterEnvelope.decay ?? 200) / 1000,
        sustain: (config.filterEnvelope.sustain ?? 50) / 100,
        release: (config.filterEnvelope.release ?? 1000) / 1000,
      };
    }

    return new Tone.MonoSynth(monoConfig as unknown as Tone.MonoSynthOptions);
  }

  private static createDuoSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const oscType = (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType;
    const synth = new Tone.DuoSynth({
      voice0: {
        oscillator: {
          type: oscType,
        } as Partial<Tone.OmniOscillatorOptions>,
        envelope: {
          attack: (config.envelope?.attack ?? 10) / 1000,
          decay: (config.envelope?.decay ?? 200) / 1000,
          sustain: (config.envelope?.sustain ?? 50) / 100,
          release: (config.envelope?.release ?? 1000) / 1000,
        },
      },
      voice1: {
        oscillator: {
          type: oscType,
        } as Partial<Tone.OmniOscillatorOptions>,
        envelope: {
          attack: (config.envelope?.attack ?? 10) / 1000,
          decay: (config.envelope?.decay ?? 200) / 1000,
          sustain: (config.envelope?.sustain ?? 50) / 100,
          release: (config.envelope?.release ?? 1000) / 1000,
        },
      },
      vibratoAmount: config.oscillator?.detune ? config.oscillator.detune / 100 : 0.5,
      vibratoRate: 5,
      volume: this.getNormalizedVolume('DuoSynth', config.volume),
    });
    // DuoSynth is monophonic (2 oscillators per single voice) but can still get stuck
    // if triggered rapidly before release completes. Wrap to force release before attack.
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (time?: number) => synth.triggerRelease(time),
      releaseAll: () => { try { synth.triggerRelease(); } catch { /* ignore */ } },
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  private static createFMSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      oscillator: {
        type: config.oscillator?.type || 'sine',
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      modulationIndex: 10,
      volume: this.getNormalizedVolume('FMSynth', config.volume),
    });
    // Wrap to prevent voice leak on rapid retrigger
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => synth.triggerRelease(note, time),
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  private static createAMSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new Tone.PolySynth(Tone.AMSynth, {
      oscillator: {
        type: config.oscillator?.type || 'sine',
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      volume: this.getNormalizedVolume('AMSynth', config.volume),
    });
    // Wrap to prevent voice leak on rapid retrigger
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => synth.triggerRelease(note, time),
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  private static createPluckSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new Tone.PolySynth(Tone.PluckSynth as unknown as typeof Tone.Synth);
    synth.set({
      attackNoise: 1,
      dampening: 4000,
      resonance: 0.7,
    } as unknown as Partial<Tone.SynthOptions>);
    synth.volume.value = this.getNormalizedVolume('PluckSynth', config.volume);
    // Wrap to prevent voice leak on rapid retrigger
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => synth.triggerRelease(note, time),
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  private static createMetalSynth(config: InstrumentConfig): Tone.MetalSynth {
    return new Tone.MetalSynth({
      envelope: {
        attack: (config.envelope?.attack ?? 1) / 1000,
        decay: (config.envelope?.decay ?? 100) / 1000,
        release: (config.envelope?.release ?? 100) / 1000,
      },
      volume: this.getNormalizedVolume('MetalSynth', config.volume),
    });
  }

  private static createMembraneSynth(config: InstrumentConfig): Tone.MembraneSynth {
    return new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 10,
      oscillator: {
        type: config.oscillator?.type || 'sine',
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (config.envelope?.attack ?? 1) / 1000,
        decay: (config.envelope?.decay ?? 400) / 1000,
        sustain: 0.01,
        release: (config.envelope?.release ?? 100) / 1000,
      },
      volume: this.getNormalizedVolume('MembraneSynth', config.volume),
    });
  }

  private static createNoiseSynth(config: InstrumentConfig): Tone.NoiseSynth {
    return new Tone.NoiseSynth({
      noise: {
        type: 'white',
      },
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
      volume: this.getNormalizedVolume('NoiseSynth', config.volume),
    });
  }

  private static createTB303(config: InstrumentConfig): DB303Synth {
    const tb303Config = config.tb303 || { ...DEFAULT_TB303 };
    // Apply normalized volume boost for TB303
    const normalizedVolume = this.getNormalizedVolume('TB303', config.volume);

    console.log('[InstrumentFactory] Creating DB303 synth with config:', JSON.stringify({
      filter: tb303Config.filter,
      filterEnvelope: tb303Config.filterEnvelope,
      oscillator: tb303Config.oscillator,
      accent: tb303Config.accent,
      volume: normalizedVolume,
    }, null, 2));
    return this.createDB303(tb303Config, normalizedVolume);
  }

  private static createWAM(config: InstrumentConfig): WAMSynth {
    const wamConfig = config.wam || { moduleUrl: '', pluginState: null };
    const synth = new WAMSynth(wamConfig);

    // WAMs usually have their own internal gain — set the native GainNode level
    synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);

    return synth;
  }

  /**
   * Create a named WAM synth (preconfigured URL from WAM_SYNTH_URLS)
   */
  private static createNamedWAM(config: InstrumentConfig): WAMSynth {
    const url = WAM_SYNTH_URLS[config.synthType];
    if (!url) {
      console.warn(`[InstrumentFactory] No URL found for WAM synth type: ${config.synthType}`);
      return this.createWAM(config);
    }
    const wamConfig = { ...config.wam, moduleUrl: url, pluginState: config.wam?.pluginState ?? null };
    const synth = new WAMSynth(wamConfig);
    synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
    return synth;
  }

  /**
   * Create a DB303 (TB-303 WASM engine) with tb303 config applied
   */
  private static createDB303(tb: NonNullable<InstrumentConfig['tb303']>, volume?: number): DB303Synth {
    const synth = new DB303Synth();

    // Apply all parameters via the synth's canonical applyConfig method.
    // All config values are 0-1 normalized.
    synth.applyConfig(tb);

    // Apply instrument-level dB normalization via the output GainNode
    if (volume !== undefined) {
      synth.output.gain.value = Tone.dbToGain(volume);
    }

    return synth;
  }

  /**
   * Create a non-303 Buzzmachine generator with volume normalization applied via output gain.
   * BuzzmachineGenerator.setVolume() is a no-op for non-303 types, so we use the output gain node.
   */
  private static createBuzzGenerator(
    machineType: BuzzmachineType,
    synthType: string,
    config: InstrumentConfig
  ): BuzzmachineGenerator {
    const synth = new BuzzmachineGenerator(machineType);
    const normalizedVolume = this.getNormalizedVolume(synthType, config.volume);
    synth.output.gain.value = Tone.dbToGain(normalizedVolume);
    return synth;
  }

  /**
   * Create a Buzz3o3 (Oomek Aggressor Devil Fish) with tb303 config applied
   * Uses the Devil Fish enhanced WASM for native Devil Fish parameters
   */
  private static createBuzz3o3(config: InstrumentConfig): BuzzmachineGenerator {
    // Use Devil Fish WASM for full Devil Fish feature support
    const synth = new BuzzmachineGenerator(BuzzmachineType.OOMEK_AGGRESSOR_DF);

    // Apply TB303 config if present
    if (config.tb303) {
      const tb = config.tb303;

      // Core 303 parameters
      synth.setCutoff(tb.filter.cutoff);
      synth.setResonance(tb.filter.resonance);
      synth.setEnvMod(tb.filterEnvelope.envMod);
      synth.setDecay(tb.filterEnvelope.decay);
      synth.setAccentAmount(tb.accent.amount);
      synth.setWaveform(tb.oscillator.type);

      if (tb.tuning !== undefined) {
        synth.setTuning(tb.tuning);
      }

      // External effects (overdrive via effects chain)
      if (tb.overdrive) {
        synth.setOverdrive(tb.overdrive.amount);
      }

      // Devil Fish mods (now native in WASM for Buzz3o3)
      if (tb.devilFish) {
        const df = tb.devilFish;
        if (df.enabled) {
          synth.enableDevilFish(true, {
            overdrive: tb.overdrive?.amount,
            muffler: df.muffler as 'off' | 'dark' | 'mid' | 'bright',
          });
        }
        if (df.muffler) {
          synth.setMuffler(df.muffler);
        }
        if (df.highResonance) {
          synth.setHighResonanceEnabled(df.highResonance);
        }
        if (df.filterTracking !== undefined) {
          synth.setFilterTracking(df.filterTracking);
        }
        // New Devil Fish WASM parameters
        if (df.normalDecay !== undefined) {
          synth.setNormalDecay(df.normalDecay);
        }
        if (df.accentDecay !== undefined) {
          synth.setAccentDecay(df.accentDecay);
        }
        if (df.vegDecay !== undefined) {
          synth.setVegDecay(df.vegDecay);
        }
        if (df.vegSustain !== undefined) {
          synth.setVegSustain(df.vegSustain);
        }
        if (df.softAttack !== undefined) {
          synth.setSoftAttack(df.softAttack);
        }
        if (df.sweepSpeed !== undefined) {
          synth.setSweepSpeed(df.sweepSpeed);
        }
        if (df.filterFmDepth !== undefined) {
          synth.setFilterFM(df.filterFmDepth);
        }
      }

      // Apply normalized volume
      const normalizedVolume = this.getNormalizedVolume('Buzz3o3', config.volume);
      synth.setVolume(normalizedVolume);
    }

    return synth;
  }

  private static createWavetable(config: InstrumentConfig): WavetableSynth {
    const wavetableConfig = config.wavetable || DEFAULT_WAVETABLE;
    const synth = new WavetableSynth(wavetableConfig);
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('Wavetable', config.volume));
    return synth;
  }

  private static createSampler(config: InstrumentConfig): Tone.Sampler {
    // Priority 1: Check for multi-sample map (Pro Bake)
    if (config.sample?.multiMap && Object.keys(config.sample.multiMap).length > 0) {
      console.log(`[InstrumentFactory] Creating Multi-Sampler for ${config.name} with ${Object.keys(config.sample.multiMap).length} samples`);
      return new Tone.Sampler({
        urls: config.sample.multiMap,
        volume: this.getNormalizedVolume('Sampler', config.volume),
      });
    }

    // Priority 2: Check for sample URL from parameters (Legacy/Upload)
    const params = config.parameters as Record<string, string | number> | undefined;
    const sampleUrl = params?.sampleUrl as string | undefined || config.sample?.url;
    const baseNote = config.sample?.baseNote || 'C4';

    // CRITICAL: Check if this is a MOD/XM instrument loaded from localStorage
    if (!sampleUrl && config.metadata?.importedFrom) {
      console.error(
        `[InstrumentFactory] CRITICAL: MOD/XM instrument "${config.name}" has no audio data!`,
        'This happens when instruments are loaded from localStorage.',
        'AudioBuffers and blob URLs cannot be serialized to JSON.',
        'Solution: Re-import the MOD/XM file to restore audio.'
      );
    }

    if (sampleUrl) {
      console.log(`[InstrumentFactory] Creating Sampler with sample URL:`, {
        instrumentId: config.id,
        baseNote,
        hasUrl: !!sampleUrl,
        urlPreview: String(sampleUrl).substring(0, 50) + '...',
      });

      // Map sample to its actual base note
      const urls: { [note: string]: string } = {};
      urls[baseNote] = sampleUrl as string;

      return new Tone.Sampler({
        urls,
        volume: this.getNormalizedVolume('Sampler', config.volume),
      });
    }

    // No sample loaded - create empty sampler
    console.warn(`[InstrumentFactory] Creating empty Sampler (no sample URL provided)`);
    return new Tone.Sampler({
      volume: this.getNormalizedVolume('Sampler', config.volume),
    });
  }

  private static createPlayer(config: InstrumentConfig): Tone.Player {
    // Get sample URL from parameters (base64 data URL from user upload)
    const pp = config.parameters as Record<string, string | number> | undefined;
    const sampleUrl = pp?.sampleUrl as string | undefined;
    const reverseMode = pp?.reverseMode || 'forward';

    if (sampleUrl) {
      const player = new Tone.Player({
        url: sampleUrl as string,
        volume: this.getNormalizedVolume('Player', config.volume),
        reverse: reverseMode === 'reverse',
      });
      return player;
    }

    // No sample loaded - create empty player
    return new Tone.Player({
      volume: this.getNormalizedVolume('Player', config.volume),
    });
  }

  private static createGranularSynth(config: InstrumentConfig): Tone.GrainPlayer {
    // Get sample URL and granular config
    const sampleUrl = config.granular?.sampleUrl || (config.parameters as Record<string, string> | undefined)?.sampleUrl;
    const granularConfig = config.granular;

    if (sampleUrl) {
      const grainPlayer = new Tone.GrainPlayer({
        url: sampleUrl as string,
        grainSize: (granularConfig?.grainSize || 100) / 1000, // ms to seconds
        overlap: (granularConfig?.grainOverlap || 50) / 100, // percentage to ratio
        playbackRate: granularConfig?.playbackRate || 1,
        detune: granularConfig?.detune || 0,
        reverse: granularConfig?.reverse || false,
        loop: true,
        loopStart: 0,
        loopEnd: 0, // 0 = end of buffer
        volume: this.getNormalizedVolume('GranularSynth', config.volume),
      });
      return grainPlayer;
    }

    // No sample loaded - create with placeholder
    return new Tone.GrainPlayer({
      grainSize: 0.1,
      overlap: 0.5,
      playbackRate: 1,
      loop: true,
      volume: this.getNormalizedVolume('GranularSynth', config.volume),
    });
  }

  // ============================================================================
  // NEW SYNTH CREATORS
  // ============================================================================

  /**
   * SuperSaw - Multiple detuned sawtooth oscillators for massive trance/EDM sound
   */
  private static createSuperSaw(config: InstrumentConfig): Tone.ToneAudioNode {
    const ssConfig = config.superSaw || DEFAULT_SUPERSAW;
    const detuneSpread = ssConfig.detune;

    // Create a PolySynth with sawtooth and add unison effect via chorus
    const synth = new Tone.PolySynth(Tone.Synth, {

      oscillator: {
        type: 'sawtooth',
      },
      envelope: {
        attack: (ssConfig.envelope?.attack || 10) / 1000,
        decay: (ssConfig.envelope?.decay || 100) / 1000,
        sustain: (ssConfig.envelope?.sustain ?? 80) / 100,
        release: (ssConfig.envelope?.release || 300) / 1000,
      },
      volume: this.getNormalizedVolume('SuperSaw', config.volume),
    });

    // Apply filter
    const filter = new Tone.Filter({
      type: ssConfig.filter.type,
      frequency: ssConfig.filter.cutoff,
      Q: ssConfig.filter.resonance / 10,
      rolloff: -24,
    });

    // Add chorus for the supersaw detuning effect (simulates multiple detuned oscillators)
    const chorus = new Tone.Chorus({
      frequency: 4,
      delayTime: 2.5,
      depth: Math.min(1, detuneSpread / 50), // Map 0-100 to 0-2, capped at 1
      wet: 0.8,
    });
    chorus.start();

    // Connect synth -> filter -> chorus
    synth.connect(filter);
    filter.connect(chorus);

    // Setup pitch envelope if enabled
    const pitchEnv = config.pitchEnvelope;
    const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

    // Return a wrapper object
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, t); } catch { /* ignore */ }
        if (hasPitchEnv) {
          this.applyPitchEnvelope(synth, pitchEnv!, t, duration);
        }
        synth.triggerAttackRelease(note, duration, t, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, t); } catch { /* ignore */ }
        if (hasPitchEnv) {
          this.triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
        }
        synth.triggerAttack(note, t, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        if (hasPitchEnv) {
          this.triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
        }
        synth.triggerRelease(note, t);
      },
      releaseAll: () => {
        synth.set({ detune: 0 }); // Reset pitch on release all
        synth.releaseAll();
      },
      connect: (dest: Tone.InputNode) => chorus.connect(dest),
      disconnect: () => chorus.disconnect(),
      dispose: () => {
        synth.dispose();
        filter.dispose();
        chorus.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const ssc = newConfig || DEFAULT_SUPERSAW;
        const env = ssc.envelope as Record<string, number>;
        const flt = ssc.filter as Record<string, number & string>;
        synth.set({
          envelope: {
            attack: (env.attack || 10) / 1000,
            decay: (env.decay || 100) / 1000,
            sustain: (env.sustain || 80) / 100,
            release: (env.release || 300) / 1000,
          }
        });
        filter.set({
          type: flt.type,
          frequency: flt.cutoff,
          Q: flt.resonance / 10,
        });
        chorus.set({
          depth: Math.min(1, (ssc.detune as number) / 50),
        });
      },
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  /**
   * PolySynth - True polyphonic synth with voice management
   */
  private static createPolySynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const psConfig = config.polySynth || DEFAULT_POLYSYNTH;

    // Select voice type
    let VoiceClass: typeof Tone.Synth | typeof Tone.FMSynth | typeof Tone.AMSynth = Tone.Synth;
    if (psConfig.voiceType === 'FMSynth') VoiceClass = Tone.FMSynth;
    else if (psConfig.voiceType === 'AMSynth') VoiceClass = Tone.AMSynth;

    const synth = new Tone.PolySynth(VoiceClass as any, {
      oscillator: {
        type: psConfig.oscillator?.type || 'sawtooth',
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (psConfig.envelope?.attack || 50) / 1000,
        decay: (psConfig.envelope?.decay || 200) / 1000,
        sustain: (psConfig.envelope?.sustain ?? 70) / 100,
        release: (psConfig.envelope?.release || 500) / 1000,
      },
      volume: this.getNormalizedVolume('PolySynth', config.volume),
    });
    synth.maxPolyphony = psConfig.voiceCount;

    // Setup pitch envelope if enabled
    const pitchEnv = config.pitchEnvelope;
    const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

    // If no pitch envelope, return wrapped synth with voice leak prevention
    if (!hasPitchEnv) {
      return {
        triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
          try { synth.triggerRelease(note, time); } catch { /* ignore */ }
          synth.triggerAttackRelease(note, duration, time, velocity);
        },
        triggerAttack: (note: string, time?: number, velocity?: number) => {
          try { synth.triggerRelease(note, time); } catch { /* ignore */ }
          synth.triggerAttack(note, time, velocity);
        },
        triggerRelease: (note: string, time?: number) => synth.triggerRelease(note, time),
        releaseAll: () => synth.releaseAll(),
        connect: (dest: Tone.InputNode) => synth.connect(dest),
        disconnect: () => synth.disconnect(),
        dispose: () => synth.dispose(),
        volume: synth.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    // Wrap synth to add pitch envelope support
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        try { synth.triggerRelease(note, t); } catch { /* ignore */ }
        this.applyPitchEnvelope(synth, pitchEnv!, t, duration);
        synth.triggerAttackRelease(note, duration, t, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        try { synth.triggerRelease(note, t); } catch { /* ignore */ }
        this.triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
        synth.triggerAttack(note, t, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        this.triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
        synth.triggerRelease(note, t);
      },
      releaseAll: () => {
        synth.set({ detune: 0 });
        synth.releaseAll();
      },
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  /**
   * Organ - Hammond-style tonewheel organ with 9 drawbars
   * Note: Full drawbar implementation would require 9 oscillators per voice.
   * This simplified version uses a sine wave with rotary effect.
   */
  private static createOrgan(config: InstrumentConfig): Tone.ToneAudioNode {
    const orgConfig = config.organ || DEFAULT_ORGAN;
    const drawbars = orgConfig.drawbars || DEFAULT_ORGAN.drawbars;
    const output = new Tone.Gain(1);

    // Create polyphonic sine synth for organ tone
    const synth = new Tone.PolySynth(Tone.Synth, {

      oscillator: {
        type: 'custom',
        partials: [
          drawbars[0] / 8, // sub
          drawbars[1] / 8, // fundamental
          drawbars[2] / 8, // 3rd
          drawbars[3] / 8, // 4th
          drawbars[4] / 8, // 5th
          drawbars[5] / 8, // 6th
          drawbars[6] / 8, // 7th
          drawbars[7] / 8, // 8th
          drawbars[8] / 8, // 9th
        ]
      } as any,
      envelope: {
        attack: 0.005, // Fast attack for organ click
        decay: 0.1,
        sustain: 1.0,  // Organ sustains fully
        release: 0.1,
      },
      volume: this.getNormalizedVolume('Organ', config.volume),
    });
    synth.maxPolyphony = 32;

    // Add Leslie/rotary effect
    let rotary: Tone.Tremolo | null = null;
    if (orgConfig.rotary?.enabled) {
      rotary = new Tone.Tremolo({
        frequency: orgConfig.rotary.speed === 'fast' ? 6 : 1,
        depth: 0.3,
        wet: 0.5,
      });
      rotary.start();
      synth.connect(rotary);
      rotary.connect(output);
    } else {
      synth.connect(output);
    }

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => output.connect(dest),
      disconnect: () => output.disconnect(),
      dispose: () => {
        synth.dispose();
        rotary?.dispose();
        output.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const oc = newConfig || DEFAULT_ORGAN;
        const db = oc.drawbars as number[];
        synth.set({
          oscillator: {
            partials: [
              (db[0] || 0) / 8,
              (db[1] || 0) / 8,
              (db[2] || 0) / 8,
              (db[3] || 0) / 8,
              (db[4] || 0) / 8,
              (db[5] || 0) / 8,
              (db[6] || 0) / 8,
              (db[7] || 0) / 8,
              (db[8] || 0) / 8,
            ]
          }
        });
        if (rotary) {
          rotary.frequency.rampTo((oc.rotary as Record<string, string>)?.speed === 'fast' ? 6 : 1, 0.1);
        }
      },
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  /**
   * DrumMachine - TR-909 style drum synthesis
   * Based on authentic TR-909 parameters from the er-99 web emulator
   * Key characteristics:
   * - Kick: Sine with pitch envelope (2.5x multiplier, 50ms duration), saturation, 3kHz lowpass
   * - Snare: Pitched body (220Hz, 4x env, 10ms fast drop) + noise with notch filter at 1000Hz
   * - Clap: Multiple delayed noise bursts (10ms spread) with serial bandpass + modulator
   * - Rimshot: Parallel resonant bandpass filters (220/500/950Hz) with high Q and saturation
   * - Toms: Pitched body with 2x envelope, varying frequencies (100/200/300Hz)
   */
  private static createDrumMachine(config: InstrumentConfig): Tone.ToneAudioNode {
    const dmConfig = config.drumMachine || DEFAULT_DRUM_MACHINE;
    const is808 = dmConfig.machineType === '808';

    switch (dmConfig.drumType) {
      case 'kick': {
        // 808 vs 909 kick defaults - significantly different character
        const kickDefaults808 = {
          pitch: 48,          // 808: lower base frequency
          pitchDecay: 50,
          tone: 40,
          toneDecay: 30,
          decay: 200,         // 808: slightly shorter default
          drive: 60,          // 808: more saturation
          envAmount: 2.0,     // 808: less pitch sweep
          envDuration: 110,   // 808: longer pitch envelope
          filterFreq: 250,    // 808: much lower filter (warm/boomy)
        };
        const kickDefaults909 = {
          pitch: 80,          // 909: higher, punchier
          pitchDecay: 50,
          tone: 50,
          toneDecay: 20,
          decay: 300,
          drive: 50,
          envAmount: 2.5,     // 909: more aggressive pitch sweep
          envDuration: 50,    // 909: shorter, snappier
          filterFreq: 3000,   // 909: bright/punchy
        };
        const kickConfig = {
          ...(is808 ? kickDefaults808 : kickDefaults909),
          ...dmConfig.kick
        };

        // TR-909 kick: sine oscillator with pitch envelope and saturation
        // Using MembraneSynth as base for pitch envelope capability
        const synth = new Tone.MembraneSynth({
          // pitchDecay controls how fast pitch drops - use envDuration
          pitchDecay: kickConfig.envDuration / 1000,
          // octaves controls pitch envelope depth - derive from envAmount
          // envAmount 2.5 means start at freq*2.5, so ~1.3 octaves above base
          octaves: Math.log2(kickConfig.envAmount) * 2,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: kickConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: this.getNormalizedVolume('DrumMachine', config.volume),
        });

        // Add saturation via waveshaper if drive > 0
        let output: Tone.ToneAudioNode = synth;
        let saturation: Tone.Distortion | null = null;
        let filter: Tone.Filter | null = null;

        if (kickConfig.drive > 0) {
          saturation = new Tone.Distortion({
            distortion: (kickConfig.drive / 100) * 0.5, // Scale to reasonable range
            oversample: '2x',
            wet: 1,
          });
        }

        // Add lowpass filter (909: 3000Hz)
        filter = new Tone.Filter({
          type: 'lowpass',
          frequency: kickConfig.filterFreq,
          Q: 1,
          rolloff: -24,
        });

        // Connect chain: synth -> saturation (if any) -> filter
        if (saturation) {
          synth.connect(saturation);
          saturation.connect(filter);
        } else {
          synth.connect(filter);
        }
        output = filter;

        // Use fixed 909 frequency (80Hz) regardless of note
        const baseNote = Tone.Frequency(kickConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            synth.triggerAttackRelease(baseNote, duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            synth.triggerAttack(baseNote, time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            synth.triggerRelease(time);
          },
          releaseAll: () => { try { synth.triggerRelease(); } catch { /* ignore */ } },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            synth.dispose();
            saturation?.dispose();
            filter?.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const kc = dmc.kick as Record<string, number> | undefined;
            if (!kc) return;

            synth.set({
              pitchDecay: kc.envDuration / 1000,
              octaves: Math.log2(kc.envAmount) * 2,
              envelope: {
                decay: kc.decay / 1000,
              }
            });
            if (saturation) {
              saturation.distortion = (kc.drive / 100) * 0.5;
            }
            if (filter) {
              filter.frequency.rampTo(kc.filterFreq, 0.1);
            }
          },
          volume: synth.volume,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'snare': {
        // 808 vs 909 snare defaults
        const snareDefaults808 = {
          pitch: 238,           // 808: lower frequency body
          tone: 35,             // 808: more body-focused
          toneDecay: 200,       // 808: longer noise decay
          snappy: 55,           // 808: less harsh noise
          decay: 150,           // 808: slightly longer body
          envAmount: 2.5,       // 808: less aggressive pitch sweep
          envDuration: 25,      // 808: medium pitch envelope
          filterType: 'lowpass' as const, // 808: lowpass for warmth
          filterFreq: 2500,     // 808: warmer filter
        };
        const snareDefaults909 = {
          pitch: 220,           // 909: slightly higher
          tone: 25,
          toneDecay: 250,       // 909: longer
          snappy: 70,           // 909: sharper noise
          decay: 100,           // 909: snappier body
          envAmount: 4.0,       // 909: aggressive pitch sweep
          envDuration: 10,      // 909: very fast pitch drop
          filterType: 'notch' as const, // 909: characteristic notch
          filterFreq: 1000,
        };
        const snareConfig = {
          ...(is808 ? snareDefaults808 : snareDefaults909),
          ...dmConfig.snare
        };

        // Snare: pitched body with pitch envelope + filtered noise
        const body = new Tone.MembraneSynth({
          pitchDecay: snareConfig.envDuration / 1000, // 909: 10ms fast pitch drop
          octaves: Math.log2(snareConfig.envAmount) * 2, // 909: 4x = ~2 octaves
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: snareConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: this.getNormalizedVolume('DrumMachine', config.volume),
        });

        // Noise component for snare "snap"
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: snareConfig.toneDecay / 1000, // 909: 250ms
            sustain: 0,
            release: 0.05,
          },
          volume: (this.getNormalizedVolume('DrumMachine', config.volume)) + (snareConfig.snappy / 15 - 3),
        });

        // 909 uses notch filter at 1000Hz on snare
        const filter = new Tone.Filter({
          type: snareConfig.filterType,
          frequency: snareConfig.filterFreq,
          Q: 2,
        });

        const output = new Tone.Gain(1);
        body.connect(output);
        noise.connect(filter);
        filter.connect(output);

        // Use fixed 909 frequency
        const baseNote = Tone.Frequency(snareConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            body.triggerAttackRelease(baseNote, duration, time, velocity);
            noise.triggerAttackRelease(duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            body.triggerAttack(baseNote, time, velocity);
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            body.triggerRelease(time);
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { body.triggerRelease(); } catch { /* ignore */ }
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            body.dispose();
            noise.dispose();
            filter.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const sc = dmc.snare as Record<string, number & string> | undefined;
            if (!sc) return;

            body.set({
              pitchDecay: sc.envDuration / 1000,
              octaves: Math.log2(sc.envAmount) * 2,
              envelope: {
                decay: sc.decay / 1000,
              }
            });
            noise.set({
              envelope: {
                decay: sc.toneDecay / 1000,
              },
              volume: (this.getNormalizedVolume('DrumMachine', config.volume)) + (sc.snappy / 15 - 3),
            });
            filter.set({
              type: sc.filterType,
              frequency: sc.filterFreq,
            });
          },
          volume: body.volume,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'hihat': {
        // 808 vs 909 hihat defaults - 808 uses 6-square metallic, 909 samples
        const hhDefaults808 = { tone: 40, decay: 80, metallic: 70 };   // 808: warmer, more metallic
        const hhDefaults909 = { tone: 50, decay: 100, metallic: 50 }; // 909: crisper
        const hhConfig = { ...(is808 ? hhDefaults808 : hhDefaults909), ...dmConfig.hihat };
        // Hi-hat: metal synth approximation
        const metalSynth = new Tone.MetalSynth({
          envelope: {
            attack: 0.001,
            decay: hhConfig.decay / 1000,
            release: is808 ? 0.02 : 0.01,
          },
          harmonicity: 5.1,
          modulationIndex: 32 + hhConfig.metallic / 3,
          resonance: 4000 + hhConfig.tone * 40,
          octaves: 1.5,
          volume: config.volume || -12,
        });
        metalSynth.frequency.value = is808 ? 180 + hhConfig.tone * 1.5 : 200 + hhConfig.tone * 2;
        return metalSynth;
      }

      case 'clap': {
        // 808 vs 909 clap defaults
        const clapDefaults808 = {
          tone: 45,              // 808: slightly darker
          decay: 120,            // 808: longer reverby tail
          toneDecay: 350,        // 808: longer noise envelope
          spread: 15,            // 808: wider spread for room effect
          filterFreqs: [700, 1000] as [number, number], // 808: lower filter freqs
          modulatorFreq: 30,
        };
        const clapDefaults909 = {
          tone: 55,              // 909: brighter
          decay: 80,             // 909: snappier
          toneDecay: 250,
          spread: 10,            // 909: tighter spread
          filterFreqs: [900, 1200] as [number, number],
          modulatorFreq: 40,
        };
        const clapConfig = {
          ...(is808 ? clapDefaults808 : clapDefaults909),
          ...dmConfig.clap
        };

        // Clap: Multiple delayed noise bursts with filtering
        // Creates the "clap" effect by triggering noise at slightly
        // offset times creating a richer, more realistic clap
        const output = new Tone.Gain(1);

        // Create noise source for the sustained clap tail
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: clapConfig.decay / 1000,
            sustain: 0,
            release: 0.05,
          },
          volume: config.volume ?? -10,
        });

        // Serial bandpass filters (909: highpass 900Hz -> bandpass 1200Hz)
        const filter1 = new Tone.Filter({
          type: 'highpass',
          frequency: clapConfig.filterFreqs[0],
          Q: 1.2,
        });
        const filter2 = new Tone.Filter({
          type: 'bandpass',
          frequency: clapConfig.filterFreqs[1],
          Q: 0.7,
        });

        // Tone filter for the initial burst character (909: 2200Hz bandpass)
        const toneFilter = new Tone.Filter({
          type: 'bandpass',
          frequency: 1000 + clapConfig.tone * 24, // Scale 0-100 to ~1000-3400Hz
          Q: 2,
        });

        noise.connect(toneFilter);
        toneFilter.connect(filter1);
        filter1.connect(filter2);
        filter2.connect(output);

        // Create additional noise bursts for the "spread" effect
        // In hardware this is done with delay lines; we simulate with timed triggers
        const burstNoises: Tone.NoiseSynth[] = [];
        const numBursts = 4;
        for (let i = 0; i < numBursts; i++) {
          const burstNoise = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: {
              attack: 0.001,
              decay: (clapConfig.toneDecay / 1000) / (i + 1), // Each burst shorter
              sustain: 0,
              release: 0.02,
            },
            volume: (config.volume ?? -10) - (i * 3), // Each burst quieter
          });
          burstNoise.connect(toneFilter);
          burstNoises.push(burstNoise);
        }

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const spreadMs = clapConfig.spread / 1000;
            // Trigger the delayed bursts
            burstNoises.forEach((burst, i) => {
              const burstTime = t + (i * spreadMs);
              const burstVel = (velocity ?? 1) * (1 - i * 0.15);
              burst.triggerAttackRelease(duration / (i + 1), burstTime, burstVel);
            });
            // Main sustain comes last
            noise.triggerAttackRelease(duration, t + (numBursts * spreadMs), velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const spreadMs = clapConfig.spread / 1000;
            burstNoises.forEach((burst, i) => {
              burst.triggerAttack(t + (i * spreadMs), (velocity ?? 1) * (1 - i * 0.15));
            });
            noise.triggerAttack(t + (numBursts * spreadMs), velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            noise.triggerRelease(time);
            burstNoises.forEach(burst => burst.triggerRelease(time));
          },
          releaseAll: () => {
            try { noise.triggerRelease(); } catch { /* ignore */ }
            burstNoises.forEach(burst => {
              try { burst.triggerRelease(); } catch { /* ignore */ }
            });
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            noise.dispose();
            burstNoises.forEach(burst => burst.dispose());
            filter1.dispose();
            filter2.dispose();
            toneFilter.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const cc = dmc.clap as Record<string, any> | undefined;
            if (!cc) return;

            noise.set({
              envelope: {
                decay: cc.decay / 1000,
              }
            });
            filter1.frequency.rampTo(cc.filterFreqs[0], 0.1);
            filter2.frequency.rampTo(cc.filterFreqs[1], 0.1);
            toneFilter.frequency.rampTo(1000 + cc.tone * 24, 0.1);

            burstNoises.forEach((burst, i) => {
              burst.set({
                envelope: {
                  decay: (cc.toneDecay / 1000) / (i + 1),
                }
              });
            });
          },
          volume: noise.volume,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'tom': {
        // 808 vs 909 tom defaults
        const tomDefaults808 = {
          pitch: 160,            // 808: slightly lower
          decay: 300,            // 808: longer decay
          tone: 2,               // 808: pure sine, minimal noise
          toneDecay: 50,
          envAmount: 1.5,        // 808: gentler pitch sweep
          envDuration: 150,      // 808: longer envelope
        };
        const tomDefaults909 = {
          pitch: 200,            // 909: punchier
          decay: 200,
          tone: 5,               // 909: slight noise
          toneDecay: 100,
          envAmount: 2.0,        // 909: more aggressive
          envDuration: 100,
        };
        const tomConfig = {
          ...(is808 ? tomDefaults808 : tomDefaults909),
          ...dmConfig.tom
        };

        // Tom: pitched sine with pitch envelope
        const synth = new Tone.MembraneSynth({
          pitchDecay: tomConfig.envDuration / 1000,
          octaves: Math.log2(tomConfig.envAmount) * 2,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: tomConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: this.getNormalizedVolume('DrumMachine', config.volume),
        });

        // Small amount of noise for attack character
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: tomConfig.toneDecay / 1000,
            sustain: 0,
            release: 0.02,
          },
          volume: (this.getNormalizedVolume('DrumMachine', config.volume)) - 20 + (tomConfig.tone / 5), // Very subtle noise
        });

        const output = new Tone.Gain(1);
        synth.connect(output);
        noise.connect(output);

        const baseNote = Tone.Frequency(tomConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            synth.triggerAttackRelease(baseNote, duration, time, velocity);
            noise.triggerAttackRelease(duration * 0.3, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            synth.triggerAttack(baseNote, time, velocity);
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            synth.triggerRelease(time);
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { synth.triggerRelease(); } catch { /* ignore */ }
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            synth.dispose();
            noise.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const tc = dmc.tom as Record<string, number> | undefined;
            if (!tc) return;

            synth.set({
              pitchDecay: tc.envDuration / 1000,
              octaves: Math.log2(tc.envAmount) * 2,
              envelope: {
                decay: tc.decay / 1000,
              }
            });
            noise.set({
              envelope: {
                decay: tc.toneDecay / 1000,
              },
              volume: (this.getNormalizedVolume('DrumMachine', config.volume)) - 20 + (tc.tone / 5),
            });
          },
          volume: synth.volume,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'rimshot': {
        // 808 vs 909 rimshot defaults
        const rimDefaults808 = {
          decay: 45,             // 808: slightly longer decay
          filterFreqs: [280, 450, 850] as [number, number, number], // 808: lower freqs
          filterQ: 8.0,          // 808: slightly less resonant
          saturation: 2.0,       // 808: less aggressive
        };
        const rimDefaults909 = {
          decay: 30,             // 909: snappier
          filterFreqs: [220, 500, 950] as [number, number, number],
          filterQ: 10.5,         // 909: very resonant "ping"
          saturation: 3.0,       // 909: more aggressive
        };
        const rimConfig = {
          ...(is808 ? rimDefaults808 : rimDefaults909),
          ...dmConfig.rimshot
        };

        // Rimshot: Parallel resonant bandpass filters with saturation
        // The high Q creates the characteristic "ping"
        // Uses a short noise impulse to excite the resonant filters

        // Create noise burst as impulse source
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: rimConfig.decay / 1000,
            sustain: 0,
            release: 0.01,
          },
          volume: config.volume ?? -10,
        });

        // Three parallel resonant bandpass filters (909 characteristic)
        const filter1 = new Tone.Filter({
          type: 'bandpass',
          frequency: rimConfig.filterFreqs[0],
          Q: rimConfig.filterQ,
        });
        const filter2 = new Tone.Filter({
          type: 'bandpass',
          frequency: rimConfig.filterFreqs[1],
          Q: rimConfig.filterQ,
        });
        const filter3 = new Tone.Filter({
          type: 'bandpass',
          frequency: rimConfig.filterFreqs[2],
          Q: rimConfig.filterQ,
        });

        // Mix the parallel filters
        const filterMix = new Tone.Gain(1);
        noise.connect(filter1);
        noise.connect(filter2);
        noise.connect(filter3);
        filter1.connect(filterMix);
        filter2.connect(filterMix);
        filter3.connect(filterMix);

        // Saturation for the punchy 909 rimshot character
        const saturation = new Tone.Distortion({
          distortion: (rimConfig.saturation / 5) * 0.8, // Scale saturation
          oversample: '2x',
          wet: 1,
        });

        // Highpass to remove mud
        const highpass = new Tone.Filter({
          type: 'highpass',
          frequency: 100,
          Q: 0.5,
        });

        filterMix.connect(saturation);
        saturation.connect(highpass);

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            noise.triggerAttackRelease(duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => highpass.connect(dest),
          disconnect: () => highpass.disconnect(),
          dispose: () => {
            noise.dispose();
            filter1.dispose();
            filter2.dispose();
            filter3.dispose();
            filterMix.dispose();
            saturation.dispose();
            highpass.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const rc = dmc.rimshot as Record<string, any> | undefined;
            if (!rc) return;

            noise.set({
              envelope: {
                decay: rc.decay / 1000,
              }
            });
            filter1.frequency.rampTo(rc.filterFreqs[0], 0.1);
            filter2.frequency.rampTo(rc.filterFreqs[1], 0.1);
            filter3.frequency.rampTo(rc.filterFreqs[2], 0.1);
            filter1.Q.value = rc.filterQ;
            filter2.Q.value = rc.filterQ;
            filter3.Q.value = rc.filterQ;
            saturation.distortion = (rc.saturation / 5) * 0.8;
          },
          volume: noise.volume,
        } as unknown as Tone.ToneAudioNode;
      }

      // =========================================================================
      // TR-808 SPECIFIC DRUM TYPES
      // Based on io-808 web emulator - 100% synthesized (no samples)
      // =========================================================================

      case 'conga': {
        // TR-808 Conga: Pure sine oscillator (higher pitched than tom, no noise)
        const congaConfig = {
          pitch: 310,           // Mid conga default
          decay: 180,           // 808: 180ms
          tuning: 50,           // 0-100% pitch interpolation
          ...dmConfig.conga
        };

        // 808 congas are pure sine - no noise component like toms
        const synth = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: congaConfig.decay / 1000,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume ?? -8,
        });

        // Lowpass filter for warmth
        const filter = new Tone.Filter({
          type: 'lowpass',
          frequency: 10000,
          Q: 1,
        });

        synth.connect(filter);
        const baseNote = Tone.Frequency(congaConfig.pitch, 'hz').toNote();

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            synth.triggerAttackRelease(baseNote, duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            synth.triggerAttack(baseNote, time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            synth.triggerRelease(time);
          },
          releaseAll: () => {
            try { synth.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => filter.connect(dest),
          disconnect: () => filter.disconnect(),
          dispose: () => {
            synth.dispose();
            filter.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const cc = dmc.conga as Record<string, number> | undefined;
            if (!cc) return;

            synth.set({
              envelope: {
                decay: cc.decay / 1000,
              }
            });
          },
          volume: synth.volume,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'cowbell': {
        // TR-808 Cowbell: Dual square oscillators at 540Hz and 800Hz through bandpass
        // Dual envelope: short attack + longer exponential tail
        const cowbellConfig = {
          decay: 400,           // 808: 15ms short + 400ms tail
          filterFreq: 2640,     // 808: 2640Hz bandpass center
          ...dmConfig.cowbell
        };

        // Two square oscillators at fixed 808 frequencies
        const osc1 = new Tone.Oscillator({
          type: 'square',
          frequency: 540,
          volume: -6,
        });
        const osc2 = new Tone.Oscillator({
          type: 'square',
          frequency: 800,
          volume: -6,
        });

        // Short envelope for attack transient
        const shortVCA = new Tone.Gain(0);
        // Long envelope for sustaining tail
        const longVCA = new Tone.Gain(0);

        // Bandpass filter for cowbell character
        const filter = new Tone.Filter({
          type: 'bandpass',
          frequency: cowbellConfig.filterFreq,
          Q: 1,
        });

        // Mix oscillators
        const oscMix = new Tone.Gain(0.3);
        osc1.connect(oscMix);
        osc2.connect(oscMix);

        // Split to short and long VCAs
        oscMix.connect(shortVCA);
        oscMix.connect(longVCA);

        // Output mix
        const output = new Tone.Gain(1);
        shortVCA.connect(filter);
        longVCA.connect(filter);
        filter.connect(output);

        // Start oscillators
        osc1.start();
        osc2.start();

        return {
          triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            // Short attack envelope: 0 -> 0.375 over 2ms, then decay to 0 over 15ms
            shortVCA.gain.cancelScheduledValues(t);
            shortVCA.gain.setValueAtTime(0, t);
            shortVCA.gain.linearRampToValueAtTime(0.375 * vel, t + 0.002);
            shortVCA.gain.linearRampToValueAtTime(0, t + 0.017);
            // Long tail envelope: 0 -> 0.125 over 2ms, exponential decay over cowbell decay
            longVCA.gain.cancelScheduledValues(t);
            longVCA.gain.setValueAtTime(0.001, t + 0.015);
            longVCA.gain.exponentialRampToValueAtTime(0.125 * vel, t + 0.017);
            longVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.017 + cowbellConfig.decay / 1000);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            shortVCA.gain.cancelScheduledValues(t);
            shortVCA.gain.setValueAtTime(0, t);
            shortVCA.gain.linearRampToValueAtTime(0.375 * vel, t + 0.002);
            shortVCA.gain.linearRampToValueAtTime(0, t + 0.017);
            longVCA.gain.cancelScheduledValues(t);
            longVCA.gain.setValueAtTime(0.001, t + 0.015);
            longVCA.gain.exponentialRampToValueAtTime(0.125 * vel, t + 0.017);
            longVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.017 + cowbellConfig.decay / 1000);
          },
          triggerRelease: () => {
            // Cowbell doesn't respond to release - it's a one-shot
          },
          releaseAll: () => {
            // One-shot, nothing to release
          },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            osc1.stop();
            osc2.stop();
            osc1.dispose();
            osc2.dispose();
            shortVCA.dispose();
            longVCA.dispose();
            oscMix.dispose();
            filter.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const cc = dmc.cowbell as Record<string, number> | undefined;
            if (!cc) return;

            filter.frequency.rampTo(cc.filterFreq, 0.1);
          },
          volume: output.gain,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'clave': {
        // TR-808 Clave: Triangle (2450Hz) + Sine (1750Hz) through bandpass + distortion
        // Creates woody "click" character
        const claveConfig = {
          decay: 40,            // 808: 40ms
          pitch: 2450,          // 808: 2450Hz triangle
          pitchSecondary: 1750, // 808: 1750Hz sine
          filterFreq: 2450,     // 808: 2450Hz bandpass
          ...dmConfig.clave
        };

        // Primary triangle oscillator
        const osc1 = new Tone.Oscillator({
          type: 'triangle',
          frequency: claveConfig.pitch,
          volume: -6,
        });
        // Secondary sine oscillator
        const osc2 = new Tone.Oscillator({
          type: 'sine',
          frequency: claveConfig.pitchSecondary,
          volume: -8,
        });

        // VCAs for envelope
        const vca1 = new Tone.Gain(0);
        const vca2 = new Tone.Gain(0);

        // Bandpass filter
        const filter = new Tone.Filter({
          type: 'bandpass',
          frequency: claveConfig.filterFreq,
          Q: 5,
        });

        // Distortion for punch (808 "swing VCA" - half-wave rectifier + soft clip)
        const distortion = new Tone.Distortion({
          distortion: 0.5,
          oversample: '2x',
          wet: 1,
        });

        const output = new Tone.Gain(1);

        osc1.connect(vca1);
        osc2.connect(vca2);
        vca1.connect(filter);
        vca2.connect(filter);
        filter.connect(distortion);
        distortion.connect(output);

        osc1.start();
        osc2.start();

        return {
          triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            // Fast exponential decay
            vca1.gain.cancelScheduledValues(t);
            vca1.gain.setValueAtTime(0.7 * vel, t);
            vca1.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
            vca2.gain.cancelScheduledValues(t);
            vca2.gain.setValueAtTime(0.5 * vel, t);
            vca2.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            vca1.gain.cancelScheduledValues(t);
            vca1.gain.setValueAtTime(0.7 * vel, t);
            vca1.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
            vca2.gain.cancelScheduledValues(t);
            vca2.gain.setValueAtTime(0.5 * vel, t);
            vca2.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
          },
          triggerRelease: () => { /* one-shot */ },
          releaseAll: () => { /* one-shot */ },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            osc1.stop();
            osc2.stop();
            osc1.dispose();
            osc2.dispose();
            vca1.dispose();
            vca2.dispose();
            filter.dispose();
            distortion.dispose();
            output.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const cc = dmc.clave as Record<string, number> | undefined;
            if (!cc) return;

            filter.frequency.rampTo(cc.filterFreq, 0.1);
          },
          volume: output.gain,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'maracas': {
        // TR-808 Maracas: White noise through highpass filter (5kHz)
        // Very short decay for "shake" character
        const maracasConfig = {
          decay: 30,            // 808: 30ms (quick shake)
          filterFreq: 5000,     // 808: 5000Hz highpass
          ...dmConfig.maracas
        };

        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: maracasConfig.decay / 1000,
            sustain: 0,
            release: 0.01,
          },
          volume: this.getNormalizedVolume('DrumMachine', config.volume),
        });

        // Highpass filter removes low frequencies, keeps bright rattle
        const filter = new Tone.Filter({
          type: 'highpass',
          frequency: maracasConfig.filterFreq,
          Q: 1,
        });

        noise.connect(filter);

        return {
          triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
            noise.triggerAttackRelease(duration, time, velocity);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            noise.triggerAttack(time, velocity);
          },
          triggerRelease: (_note: string, time?: number) => {
            noise.triggerRelease(time);
          },
          releaseAll: () => {
            try { noise.triggerRelease(); } catch { /* ignore */ }
          },
          connect: (dest: Tone.InputNode) => filter.connect(dest),
          disconnect: () => filter.disconnect(),
          dispose: () => {
            noise.dispose();
            filter.dispose();
          },
          applyConfig: (newConfig: Record<string, unknown>) => {
            const dmc = newConfig || DEFAULT_DRUM_MACHINE;
            const mc = dmc.maracas as Record<string, number> | undefined;
            if (!mc) return;

            noise.set({
              envelope: {
                decay: mc.decay / 1000,
              }
            });
            filter.frequency.rampTo(mc.filterFreq, 0.1);
          },
          volume: noise.volume,
        } as unknown as Tone.ToneAudioNode;
      }

      case 'cymbal': {
        // TR-808 Cymbal: Same 6-oscillator bank as hi-hat but with 3-band processing
        // Complex multi-band filtering with separate envelopes per band
        const cymbalConfig = {
          tone: 50,             // Low/high band balance
          decay: 2000,          // 808: variable from 700-6800ms for low band
          ...dmConfig.cymbal
        };

        // 808 metallic oscillator bank - 6 square waves at inharmonic frequencies
        const oscFreqs = [263, 400, 421, 474, 587, 845];
        const oscillators: Tone.Oscillator[] = [];
        const oscMix = new Tone.Gain(0.3);

        for (const freq of oscFreqs) {
          const osc = new Tone.Oscillator({
            type: 'square',
            frequency: freq,
            volume: -10,
          });
          osc.connect(oscMix);
          osc.start();
          oscillators.push(osc);
        }

        // 3-band filtering with separate VCAs
        // Low band: 5kHz bandpass, long decay
        const lowFilter = new Tone.Filter({ type: 'bandpass', frequency: 5000, Q: 1 });
        const lowVCA = new Tone.Gain(0);
        // Mid band: 10kHz bandpass, medium decay
        const midFilter = new Tone.Filter({ type: 'bandpass', frequency: 10000, Q: 1 });
        const midVCA = new Tone.Gain(0);
        // High band: 8kHz highpass, short decay
        const highFilter = new Tone.Filter({ type: 'highpass', frequency: 8000, Q: 1 });
        const highVCA = new Tone.Gain(0);

        oscMix.connect(lowFilter);
        oscMix.connect(midFilter);
        oscMix.connect(highFilter);

        lowFilter.connect(lowVCA);
        midFilter.connect(midVCA);
        highFilter.connect(highVCA);

        const output = new Tone.Gain(1);
        lowVCA.connect(output);
        midVCA.connect(output);
        highVCA.connect(output);

        // Calculate envelope amounts based on tone parameter
        const lowEnvAmt = 0.666 - (cymbalConfig.tone / 100) * 0.666;
        const midEnvAmt = 0.333;
        const highEnvAmt = 0.666 - (1 - cymbalConfig.tone / 100) * 0.666;

        return {
          triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            // Low band: longest decay (variable based on config)
            lowVCA.gain.cancelScheduledValues(t);
            lowVCA.gain.setValueAtTime(0.001, t);
            lowVCA.gain.exponentialRampToValueAtTime(lowEnvAmt * vel, t + 0.01);
            lowVCA.gain.exponentialRampToValueAtTime(0.001, t + cymbalConfig.decay / 1000);
            // Mid band: medium decay (400ms)
            midVCA.gain.cancelScheduledValues(t);
            midVCA.gain.setValueAtTime(0.001, t);
            midVCA.gain.exponentialRampToValueAtTime(midEnvAmt * vel, t + 0.01);
            midVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            // High band: short decay (150ms)
            highVCA.gain.cancelScheduledValues(t);
            highVCA.gain.setValueAtTime(0.001, t);
            highVCA.gain.exponentialRampToValueAtTime(highEnvAmt * vel, t + 0.01);
            highVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          },
          triggerAttack: (_note: string, time?: number, velocity?: number) => {
            const t = time ?? Tone.now();
            const vel = velocity ?? 1;
            lowVCA.gain.cancelScheduledValues(t);
            lowVCA.gain.setValueAtTime(0.001, t);
            lowVCA.gain.exponentialRampToValueAtTime(lowEnvAmt * vel, t + 0.01);
            lowVCA.gain.exponentialRampToValueAtTime(0.001, t + cymbalConfig.decay / 1000);
            midVCA.gain.cancelScheduledValues(t);
            midVCA.gain.setValueAtTime(0.001, t);
            midVCA.gain.exponentialRampToValueAtTime(midEnvAmt * vel, t + 0.01);
            midVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            highVCA.gain.cancelScheduledValues(t);
            highVCA.gain.setValueAtTime(0.001, t);
            highVCA.gain.exponentialRampToValueAtTime(highEnvAmt * vel, t + 0.01);
            highVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          },
          triggerRelease: () => { /* one-shot */ },
          releaseAll: () => { /* one-shot */ },
          connect: (dest: Tone.InputNode) => output.connect(dest),
          disconnect: () => output.disconnect(),
          dispose: () => {
            oscillators.forEach(osc => {
              osc.stop();
              osc.dispose();
            });
            oscMix.dispose();
            lowFilter.dispose();
            midFilter.dispose();
            highFilter.dispose();
            lowVCA.dispose();
            midVCA.dispose();
            highVCA.dispose();
            output.dispose();
          },
          applyConfig: () => {
            // Cymbal parameters primarily affect triggerAttack, but we can store them
            // or update relevant static params here if needed.
            // For now, since most logic is in trigger, we just ensure it doesn't crash.
          },
          volume: output.gain,
        } as unknown as Tone.ToneAudioNode;
      }

      default:
        // Default to 808/909-style kick
        return new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 3,
          envelope: {
            attack: 0.001,
            decay: 0.3,
            sustain: 0,
            release: 0.1,
          },
          volume: config.volume || -12,
        });
    }
  }

  /**
   * ChipSynth - 8-bit video game console sounds
   * Uses square/triangle waves with bit crushing for authentic lo-fi character
   * Now includes integrated ArpeggioEngine for true chiptune-style arpeggios
   */
  private static createChipSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const chipConfig = config.chipSynth || DEFAULT_CHIP_SYNTH;
    const arpeggioConfig = chipConfig.arpeggio;

    // Create base oscillator based on channel type
    // Note: 'pulse' channels use 'square' since Tone.Synth doesn't support pulse width
    let oscillatorType: 'square' | 'triangle' = 'square';
    if (chipConfig.channel === 'triangle') {
      oscillatorType = 'triangle';
    }

    if (chipConfig.channel === 'noise') {
      // Noise channel uses NoiseSynth
      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: (chipConfig.envelope?.attack || 5) / 1000,
          decay: (chipConfig.envelope?.decay || 100) / 1000,
          sustain: (chipConfig.envelope?.sustain ?? 0) / 100,
          release: (chipConfig.envelope?.release || 50) / 1000,
        },
        volume: config.volume || -12,
      });

      // Add bit crusher for 8-bit sound
      const bitCrusher = new Tone.BitCrusher(chipConfig.bitDepth);
      bitCrusher.wet.value = 1;
      noise.connect(bitCrusher);

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          noise.triggerAttackRelease(duration, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          noise.triggerAttack(time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          noise.triggerRelease(time);
        },
        releaseAll: () => {
          // NoiseSynth doesn't have releaseAll, just release current note
          try { noise.triggerRelease(); } catch { /* ignore */ }
        },
        connect: (dest: Tone.InputNode) => bitCrusher.connect(dest),
        disconnect: () => bitCrusher.disconnect(),
        dispose: () => {
          noise.dispose();
          bitCrusher.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const csc = newConfig || DEFAULT_CHIP_SYNTH;
          const env = csc.envelope as Record<string, number>;
          noise.set({
            envelope: {
              attack: env.attack / 1000,
              decay: env.decay / 1000,
              sustain: env.sustain / 100,
              release: env.release / 1000,
            }
          });
          (bitCrusher as any).bits = csc.bitDepth;
        },
        volume: noise.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    // Square/Triangle channels
    const synth = new Tone.PolySynth(Tone.Synth, {

      oscillator: {
        type: oscillatorType,
      },
      envelope: {
        attack: chipConfig.envelope.attack / 1000,
        decay: chipConfig.envelope.decay / 1000,
        sustain: chipConfig.envelope.sustain / 100,
        release: chipConfig.envelope.release / 1000,
      },
      volume: this.getNormalizedVolume('ChipSynth', config.volume),
    });

    // Add bit crusher for 8-bit character
    const bitCrusher = new Tone.BitCrusher(chipConfig.bitDepth);
    bitCrusher.wet.value = 1;
    synth.connect(bitCrusher);

    // Create ArpeggioEngine only if arpeggio is ENABLED (not just configured)
    let arpeggioEngine: InstanceType<typeof ArpeggioEngine> | null = null;
    let lastArpNote: string | null = null;

    if (arpeggioConfig?.enabled) {
      arpeggioEngine = new ArpeggioEngine({
        config: arpeggioConfig,
        onNoteOn: (note: string, velocity: number, duration: number) => {
          // Release last arpeggio note before playing new one
          if (lastArpNote) {
            synth.triggerRelease(lastArpNote);
          }
          synth.triggerAttackRelease(note, duration, undefined, velocity);
          lastArpNote = note;
        },
        onNoteOff: (note: string) => {
          synth.triggerRelease(note);
          if (lastArpNote === note) {
            lastArpNote = null;
          }
        },
      });
    }

    // Wrapper object with arpeggio support
    const chipSynthWrapper = {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        if (arpeggioEngine && arpeggioConfig?.enabled) {
          // Start arpeggiator instead of direct note
          arpeggioEngine.start(note, velocity ?? 1);
          // Schedule stop after duration
          if (duration && typeof duration === 'number') {
            const stopTime = (time ?? Tone.now()) + duration;
            Tone.getTransport().scheduleOnce(() => {
              arpeggioEngine.stop(note);
            }, stopTime);
          }
        } else {
          // Release any existing voice for this note first to prevent voice leak
          try { synth.triggerRelease(note, time); } catch { /* ignore */ }
          synth.triggerAttackRelease(note, duration, time, velocity);
        }
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        if (arpeggioEngine && arpeggioConfig?.enabled) {
          arpeggioEngine.start(note, velocity ?? 1);
        } else {
          // Release any existing voice for this note first to prevent voice leak
          try { synth.triggerRelease(note, time); } catch { /* ignore */ }
          synth.triggerAttack(note, time, velocity);
        }
      },
      triggerRelease: (note: string, time?: number) => {
        if (arpeggioEngine && arpeggioConfig?.enabled) {
          arpeggioEngine.stop(note);
        } else {
          synth.triggerRelease(note, time);
        }
      },
      releaseAll: () => {
        if (arpeggioEngine) {
          arpeggioEngine.stopAll();
        }
        synth.releaseAll();
        lastArpNote = null;
      },
      connect: (dest: Tone.InputNode) => bitCrusher.connect(dest),
      disconnect: () => bitCrusher.disconnect(),
      dispose: () => {
        if (arpeggioEngine) {
          arpeggioEngine.dispose();
        }
        synth.dispose();
        bitCrusher.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const csc = newConfig || DEFAULT_CHIP_SYNTH;
        const env = csc.envelope as Record<string, number>;
        synth.set({
          envelope: {
            attack: env.attack / 1000,
            decay: env.decay / 1000,
            sustain: env.sustain / 100,
            release: env.release / 1000,
          }
        });
        (bitCrusher as any).bits = csc.bitDepth;
      },
      volume: synth.volume,
      // Expose methods for real-time arpeggio updates
      updateArpeggio: (newConfig: typeof arpeggioConfig) => {
        if (arpeggioEngine && newConfig) {
          arpeggioEngine.updateConfig(newConfig);
        }
      },
      getArpeggioEngine: () => arpeggioEngine,
      getCurrentArpeggioStep: () => arpeggioEngine?.getCurrentStep() ?? 0,
      isArpeggioPlaying: () => arpeggioEngine?.getIsPlaying() ?? false,
    };

    return chipSynthWrapper as unknown as Tone.ToneAudioNode;
  }

  private static createFurnace(config: InstrumentConfig): FurnaceSynth {
    if (!config.furnace) {
      throw new Error('Furnace config required for Furnace synth type');
    }
    return new FurnaceSynth(config.furnace);
  }

  private static createBuzzmachine(config: InstrumentConfig): BuzzmachineGenerator {
    // Get machine type from config or default to ArguruDistortion
    const machineTypeStr = config.buzzmachine?.machineType || 'ArguruDistortion';

    // Map string machine type to BuzzmachineType enum
    const machineTypeMap: Record<string, BuzzmachineType> = {
      // Distortion/Saturation
      'ArguruDistortion': BuzzmachineType.ARGURU_DISTORTION,
      'ElakDist2': BuzzmachineType.ELAK_DIST2,
      'JeskolaDistortion': BuzzmachineType.JESKOLA_DISTORTION,
      'GeonikOverdrive': BuzzmachineType.GEONIK_OVERDRIVE,
      'GraueSoftSat': BuzzmachineType.GRAUE_SOFTSAT,
      'WhiteNoiseStereoDist': BuzzmachineType.WHITENOISE_STEREODIST,
      // Filters
      'ElakSVF': BuzzmachineType.ELAK_SVF,
      'CyanPhaseNotch': BuzzmachineType.CYANPHASE_NOTCH,
      'QZfilter': BuzzmachineType.Q_ZFILTER,
      'FSMPhilta': BuzzmachineType.FSM_PHILTA,
      // Delay/Reverb
      'JeskolaDelay': BuzzmachineType.JESKOLA_DELAY,
      'JeskolaCrossDelay': BuzzmachineType.JESKOLA_CROSSDELAY,
      'JeskolaFreeverb': BuzzmachineType.JESKOLA_FREEVERB,
      'FSMPanzerDelay': BuzzmachineType.FSM_PANZERDELAY,
      // Chorus/Modulation
      'FSMChorus': BuzzmachineType.FSM_CHORUS,
      'FSMChorus2': BuzzmachineType.FSM_CHORUS2,
      'WhiteNoiseWhiteChorus': BuzzmachineType.WHITENOISE_WHITECHORUS,
      'BigyoFrequencyShifter': BuzzmachineType.BIGYO_FREQUENCYSHIFTER,
      // Dynamics
      'GeonikCompressor': BuzzmachineType.GEONIK_COMPRESSOR,
      'LdSLimit': BuzzmachineType.LD_SLIMIT,
      'OomekExciter': BuzzmachineType.OOMEK_EXCITER,
      'OomekMasterizer': BuzzmachineType.OOMEK_MASTERIZER,
      'DedaCodeStereoGain': BuzzmachineType.DEDACODE_STEREOGAIN,
      // Generators
      'FSMKick': BuzzmachineType.FSM_KICK,
      'FSMKickXP': BuzzmachineType.FSM_KICKXP,
      'JeskolaTrilok': BuzzmachineType.JESKOLA_TRILOK,
      'JeskolaNoise': BuzzmachineType.JESKOLA_NOISE,
      'OomekAggressor': BuzzmachineType.OOMEK_AGGRESSOR,
      'MadBrain4FM2F': BuzzmachineType.MADBRAIN_4FM2F,
      'MadBrainDynamite6': BuzzmachineType.MADBRAIN_DYNAMITE6,
      'MakkM3': BuzzmachineType.MAKK_M3,
      'CyanPhaseDTMF': BuzzmachineType.CYANPHASE_DTMF,
      'ElenzilFrequencyBomb': BuzzmachineType.ELENZIL_FREQUENCYBOMB,
    };

    const machineType = machineTypeMap[machineTypeStr] ?? BuzzmachineType.ARGURU_DISTORTION;
    const synth = new BuzzmachineGenerator(machineType);
    const normalizedVolume = this.getNormalizedVolume('Buzzmachine', config.volume);
    synth.output.gain.value = Tone.dbToGain(normalizedVolume);
    return synth;
  }


  /**
   * Chip-specific default configs for different Furnace chip types
   * These provide characteristic sounds for each chip family
   */
  private static readonly CHIP_DEFAULTS: Record<number, Partial<import('@typedefs/instrument').FurnaceConfig>> = {
    // FM Chips - use 4-operator FM synthesis
    // FurnaceChipType: OPN2=0, OPM=1, OPL3=2, OPLL=11, etc.
    0: { // OPN2 (Genesis) - punchy bass
      algorithm: 4, feedback: 5,
      operators: [
        { enabled: true, mult: 1, tl: 20, ar: 31, dr: 8, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 30, ar: 31, dr: 12, d2r: 0, sl: 4, rr: 6, dt: 3, am: false },
        { enabled: true, mult: 1, tl: 25, ar: 31, dr: 10, d2r: 0, sl: 3, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 4, tl: 35, ar: 28, dr: 15, d2r: 0, sl: 5, rr: 10, dt: -1, am: false },
      ],
    },
    1: { // OPM (X68000) - bright lead
      algorithm: 5, feedback: 6,
      operators: [
        { enabled: true, mult: 1, tl: 15, ar: 31, dr: 5, d2r: 0, sl: 1, rr: 6, dt: 0, am: false },
        { enabled: true, mult: 3, tl: 40, ar: 31, dr: 8, d2r: 0, sl: 3, rr: 8, dt: 2, am: false },
        { enabled: true, mult: 2, tl: 35, ar: 31, dr: 10, d2r: 0, sl: 4, rr: 8, dt: -2, am: false },
        { enabled: true, mult: 1, tl: 25, ar: 31, dr: 12, d2r: 0, sl: 5, rr: 10, dt: 0, am: true },
      ],
    },
    2: { // OPL3 (AdLib) - organ-like
      algorithm: 0, feedback: 3,
      operators: [
        { enabled: true, mult: 2, tl: 30, ar: 15, dr: 4, d2r: 0, sl: 8, rr: 5, dt: 0, ws: 1, am: false },
        { enabled: true, mult: 1, tl: 0, ar: 15, dr: 2, d2r: 0, sl: 4, rr: 8, dt: 0, ws: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, ws: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, ws: 0, am: false },
      ],
    },
    11: { // OPLL - simple FM
      algorithm: 0, feedback: 2,
      operators: [
        { enabled: true, mult: 4, tl: 35, ar: 15, dr: 5, d2r: 0, sl: 6, rr: 7, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 0, ar: 15, dr: 3, d2r: 0, sl: 3, rr: 6, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    // Console chips - PSG style, use simpler synthesis
    4: { // NES (2A03) - 8-bit pulse
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 0, ar: 31, dr: 0, d2r: 0, sl: 0, rr: 12, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    5: { // Game Boy - lo-fi pulse
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 5, ar: 28, dr: 2, d2r: 0, sl: 2, rr: 10, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    3: { // PSG (SN76489) - square wave
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 8, ar: 31, dr: 4, d2r: 0, sl: 3, rr: 8, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    12: { // AY-3-8910 - buzzy PSG
      algorithm: 7, feedback: 1,
      operators: [
        { enabled: true, mult: 1, tl: 10, ar: 31, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 0, am: false },
        { enabled: true, mult: 3, tl: 50, ar: 31, dr: 8, d2r: 0, sl: 8, rr: 10, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    10: { // C64 SID - gritty
      algorithm: 4, feedback: 4,
      operators: [
        { enabled: true, mult: 1, tl: 15, ar: 25, dr: 8, d2r: 3, sl: 5, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 35, ar: 31, dr: 10, d2r: 0, sl: 6, rr: 10, dt: 1, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    6: { // PCE/TurboGrafx - wavetable style
      algorithm: 6, feedback: 2,
      operators: [
        { enabled: true, mult: 1, tl: 12, ar: 31, dr: 5, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 40, ar: 31, dr: 8, d2r: 0, sl: 4, rr: 10, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    9: { // VRC6 - rich pulse
      algorithm: 5, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 5, ar: 31, dr: 3, d2r: 0, sl: 1, rr: 10, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 30, ar: 31, dr: 6, d2r: 0, sl: 3, rr: 12, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
    8: { // N163 - wavetable
      algorithm: 7, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 8, ar: 31, dr: 4, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
      wavetables: [{ id: 0, data: [8,10,12,14,15,14,12,10,8,6,4,2,1,2,4,6] }],
    },
    15: { // TIA (Atari 2600) - harsh
      algorithm: 7, feedback: 7,
      operators: [
        { enabled: true, mult: 1, tl: 20, ar: 31, dr: 15, d2r: 5, sl: 8, rr: 4, dt: 0, am: false },
        { enabled: true, mult: 5, tl: 45, ar: 31, dr: 20, d2r: 0, sl: 10, rr: 6, dt: 2, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
        { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      ],
    },
  };

  /**
   * Create Furnace synth with specific chip type
   * Used for the individual chip type synths (FurnaceOPN, FurnaceNES, etc.)
   */
  private static createFurnaceWithChip(config: InstrumentConfig, chipType: number): FurnaceSynth {
    // Get chip-specific defaults or fall back to generic FM
    const chipDefaults = this.CHIP_DEFAULTS[chipType] || {
      algorithm: 0, feedback: 0,
      operators: [
        { enabled: true, mult: 1, tl: 0, ar: 31, dr: 0, d2r: 0, sl: 0, rr: 15, dt: 0, am: false },
        { enabled: true, mult: 2, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 20, ar: 31, dr: 15, d2r: 0, sl: 4, rr: 10, dt: 0, am: false },
      ],
    };

    const baseConfig = config.furnace || {
      algorithm: chipDefaults.algorithm ?? 0,
      feedback: chipDefaults.feedback ?? 0,
      operators: chipDefaults.operators || [],
      macros: [],
      opMacros: [],
      wavetables: chipDefaults.wavetables || [],
    };
    // Create new object with overridden chip type (to avoid mutating frozen presets)
    const furnaceConfig = {
      ...baseConfig,
      chipType,
    };
    return new FurnaceSynth(furnaceConfig);
  }
  /**
   * PWMSynth - Pulse width modulation synth
   * Uses square wave with vibrato to simulate PWM effect
   * Note: True PWM would require custom oscillator implementation
   */
  private static createPWMSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const pwmConfig = config.pwmSynth || DEFAULT_PWM_SYNTH;

    // Use square wave (Tone.Synth doesn't support true pulse width control)
    const synth = new Tone.PolySynth(Tone.Synth, {

      oscillator: {
        type: 'square',
      },
      envelope: {
        attack: (pwmConfig.envelope?.attack || 10) / 1000,
        decay: (pwmConfig.envelope?.decay || 200) / 1000,
        sustain: (pwmConfig.envelope?.sustain ?? 70) / 100,
        release: (pwmConfig.envelope?.release || 300) / 1000,
      },
      volume: this.getNormalizedVolume('PWMSynth', config.volume),
    });
    synth.maxPolyphony = 32;

    // Add filter
    const filter = new Tone.Filter({
      type: pwmConfig.filter.type,
      frequency: pwmConfig.filter.cutoff,
      Q: pwmConfig.filter.resonance / 10,
      rolloff: -24,
    });

    // Add chorus to simulate PWM modulation effect (richer than vibrato)
    const chorus = new Tone.Chorus({
      frequency: pwmConfig.pwmRate,
      delayTime: 2,
      depth: pwmConfig.pwmDepth / 100,
      wet: 0.6,
    });
    chorus.start();

    synth.connect(filter);
    filter.connect(chorus);

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => chorus.connect(dest),
      disconnect: () => chorus.disconnect(),
      dispose: () => {
        synth.dispose();
        filter.dispose();
        chorus.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const pc = newConfig || DEFAULT_PWM_SYNTH;
        const env = pc.envelope as Record<string, number>;
        const flt = pc.filter as Record<string, number & string>;
        synth.set({
          envelope: {
            attack: env.attack / 1000,
            decay: env.decay / 1000,
            sustain: env.sustain / 100,
            release: env.release / 1000,
          }
        });
        filter.set({
          type: flt.type,
          frequency: flt.cutoff,
          Q: flt.resonance / 10,
        });
        chorus.set({
          frequency: pc.pwmRate as number,
          depth: (pc.pwmDepth as number) / 100,
        });
      },
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  /**
   * StringMachine - Vintage ensemble strings (Solina-style)
   */
  private static createStringMachine(config: InstrumentConfig): Tone.ToneAudioNode {
    const strConfig = config.stringMachine || DEFAULT_STRING_MACHINE;

    // Create polyphonic sawtooth synth
    const synth = new Tone.PolySynth(Tone.Synth, {

      oscillator: {
        type: 'sawtooth',
      },
      envelope: {
        attack: (strConfig.attack || 100) / 1000,
        decay: 0.2,
        sustain: 0.9,
        release: (strConfig.release || 500) / 1000,
      },
      volume: this.getNormalizedVolume('StringMachine', config.volume),
    });
    synth.maxPolyphony = 32;

    // Rich chorus effect for ensemble character
    const chorus = new Tone.Chorus({
      frequency: strConfig.ensemble.rate,
      delayTime: 3.5,
      depth: strConfig.ensemble.depth / 100,
      wet: 0.8,
    });
    chorus.start();

    // Low-pass filter for warmth
    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2000 + (strConfig.brightness * 80),
      Q: 0.5,
      rolloff: -12,
    });

    synth.connect(filter);
    filter.connect(chorus);

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => chorus.connect(dest),
      disconnect: () => chorus.disconnect(),
      dispose: () => {
        synth.dispose();
        chorus.dispose();
        filter.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const sc = newConfig || DEFAULT_STRING_MACHINE;
        const ens = sc.ensemble as Record<string, number>;
        synth.set({
          envelope: {
            attack: (sc.attack as number) / 1000,
            release: (sc.release as number) / 1000,
          }
        });
        chorus.set({
          frequency: ens.rate,
          depth: ens.depth / 100,
        });
        filter.frequency.rampTo(2000 + ((sc.brightness as number) * 80), 0.1);
      },
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  /**
   * FormantSynth - Vowel synthesis using parallel bandpass filters
   */
  private static createFormantSynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const fmtConfig = config.formantSynth || DEFAULT_FORMANT_SYNTH;
    const formants = VOWEL_FORMANTS[fmtConfig.vowel] || VOWEL_FORMANTS['A'];

    // Create source oscillator
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: fmtConfig.oscillator?.type || 'sawtooth',
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (fmtConfig.envelope?.attack || 10) / 1000,
        decay: (fmtConfig.envelope?.decay || 200) / 1000,
        sustain: (fmtConfig.envelope?.sustain ?? 70) / 100,
        release: (fmtConfig.envelope?.release || 300) / 1000,
      },
      volume: this.getNormalizedVolume('FormantSynth', config.volume),
    });
    synth.maxPolyphony = 32;

    // Create 3 parallel bandpass filters for formants with lower Q for more output
    const f1 = new Tone.Filter({
      type: 'bandpass',
      frequency: formants.f1,
      Q: 3,
    });
    const f2 = new Tone.Filter({
      type: 'bandpass',
      frequency: formants.f2,
      Q: 3,
    });
    const f3 = new Tone.Filter({
      type: 'bandpass',
      frequency: formants.f3,
      Q: 3,
    });

    // Mix formants together with boost
    const output = new Tone.Gain(2);

    synth.connect(f1);
    synth.connect(f2);
    synth.connect(f3);
    f1.connect(output);
    f2.connect(output);
    f3.connect(output);

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => output.connect(dest),
      disconnect: () => output.disconnect(),
      dispose: () => {
        synth.dispose();
        f1.dispose();
        f2.dispose();
        f3.dispose();
        output.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const fc = newConfig || DEFAULT_FORMANT_SYNTH;
        const env = fc.envelope as Record<string, number>;
        const fmts = VOWEL_FORMANTS[fc.vowel as keyof typeof VOWEL_FORMANTS];

        synth.set({
          envelope: {
            attack: env.attack / 1000,
            decay: env.decay / 1000,
            sustain: env.sustain / 100,
            release: env.release / 1000,
          }
        });
        f1.frequency.rampTo(fmts.f1, 0.1);
        f2.frequency.rampTo(fmts.f2, 0.1);
        f3.frequency.rampTo(fmts.f3, 0.1);
      },
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  /**
   * WobbleBass - Dedicated bass synth for dubstep, DnB, jungle
   * Features: dual oscillators, FM, Reese detuning, wobble LFO, distortion, formant growl
   */
  private static createWobbleBass(config: InstrumentConfig): Tone.ToneAudioNode {
    const wbConfig = config.wobbleBass || DEFAULT_WOBBLE_BASS;

    // === OSCILLATOR SECTION ===
    // Create dual oscillators with unison
    const voiceCount = Math.max(1, wbConfig.unison.voices);
    const detuneSpread = wbConfig.unison.detune;

    // Main oscillator 1 (with unison)
    const osc1 = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: wbConfig.osc1.type,
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: wbConfig.envelope.attack / 1000,
        decay: wbConfig.envelope.decay / 1000,
        sustain: wbConfig.envelope.sustain / 100,
        release: wbConfig.envelope.release / 1000,
      },
      volume: -6 + (wbConfig.osc1.level / 100) * 6 - 6,
    });
    osc1.maxPolyphony = 32;

    // Main oscillator 2 (slightly detuned for Reese)
    const osc2 = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: wbConfig.osc2.type,
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: wbConfig.envelope.attack / 1000,
        decay: wbConfig.envelope.decay / 1000,
        sustain: wbConfig.envelope.sustain / 100,
        release: wbConfig.envelope.release / 1000,
      },
      volume: -6 + (wbConfig.osc2.level / 100) * 6 - 6,
    });
    osc2.maxPolyphony = 32;

    // Set octave offsets via detune (1200 cents = 1 octave)
    osc1.set({ detune: wbConfig.osc1.octave * 1200 + wbConfig.osc1.detune });
    osc2.set({ detune: wbConfig.osc2.octave * 1200 + wbConfig.osc2.detune });

    // Sub oscillator (clean sine for solid low end)
    let subOsc: Tone.PolySynth | null = null;
    if (wbConfig.sub.enabled) {
      subOsc = new Tone.PolySynth(Tone.Synth, {
  
        oscillator: { type: 'sine' },
        envelope: {
          attack: wbConfig.envelope.attack / 1000,
          decay: wbConfig.envelope.decay / 1000,
          sustain: wbConfig.envelope.sustain / 100,
          release: wbConfig.envelope.release / 1000,
        },
        volume: -12 + (wbConfig.sub.level / 100) * 12 - 6,
      });
      subOsc.maxPolyphony = 32;
      subOsc.set({ detune: wbConfig.sub.octave * 1200 });
    }

    // === UNISON SPREAD ===
    // Create additional detuned voices for thickness
    const unisonVoices: Tone.PolySynth[] = [];
    const unisonPanners: Tone.Panner[] = [];
    if (voiceCount > 1) {
      for (let i = 1; i < Math.min(voiceCount, 8); i++) {
        const detuneAmount = ((i / voiceCount) - 0.5) * detuneSpread * 2;
        const panAmount = ((i / voiceCount) - 0.5) * (wbConfig.unison.stereoSpread / 50);

        const voice = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: wbConfig.osc1.type } as Partial<Tone.OmniOscillatorOptions>,
          envelope: {
            attack: wbConfig.envelope.attack / 1000,
            decay: wbConfig.envelope.decay / 1000,
            sustain: wbConfig.envelope.sustain / 100,
            release: wbConfig.envelope.release / 1000,
          },
          volume: -12 - (voiceCount * 1.5),
        });
        voice.maxPolyphony = 32;
        voice.set({ detune: wbConfig.osc1.octave * 1200 + detuneAmount });

        const panner = new Tone.Panner(panAmount);
        voice.connect(panner);
        unisonVoices.push(voice);
        unisonPanners.push(panner);
      }
    }

    // === FM SECTION ===
    // Optional FM modulation between oscillators
    let fmSynth: Tone.PolySynth | null = null;
    if (wbConfig.fm.enabled && wbConfig.fm.amount > 0) {
      fmSynth = new Tone.PolySynth(Tone.FMSynth, {
  
        modulationIndex: wbConfig.fm.amount / 10,
        harmonicity: wbConfig.fm.ratio,
        envelope: {
          attack: wbConfig.envelope.attack / 1000,
          decay: wbConfig.envelope.decay / 1000,
          sustain: wbConfig.envelope.sustain / 100,
          release: wbConfig.envelope.release / 1000,
        },
        volume: -6,
      });
      fmSynth.maxPolyphony = 32;
      fmSynth.set({ detune: wbConfig.osc1.octave * 1200 });
    }

    // === MIXER ===
    const oscMixer = new Tone.Gain(1);

    // === FILTER SECTION ===
    const filter = new Tone.Filter({
      type: wbConfig.filter.type,
      frequency: wbConfig.filter.cutoff,
      Q: wbConfig.filter.resonance / 10,
      rolloff: wbConfig.filter.rolloff,
    });

    // Filter drive/saturation
    let filterDrive: Tone.Distortion | null = null;
    if (wbConfig.filter.drive > 0) {
      filterDrive = new Tone.Distortion({
        distortion: wbConfig.filter.drive / 100,
        oversample: '2x',
      });
    }

    // === FILTER ENVELOPE ===
    const filterEnvAmount = wbConfig.filterEnvelope.amount / 100;
    const filterBaseFreq = wbConfig.filter.cutoff;
    const filterEnvOctaves = Math.abs(filterEnvAmount) * 4; // Max 4 octaves sweep

    // Use FrequencyEnvelope for filter envelope modulation
    const filterEnv = new Tone.FrequencyEnvelope({
      baseFrequency: filterBaseFreq,
      octaves: filterEnvOctaves,
      attack: wbConfig.filterEnvelope.attack / 1000,
      decay: wbConfig.filterEnvelope.decay / 1000,
      sustain: wbConfig.filterEnvelope.sustain / 100,
      release: wbConfig.filterEnvelope.release / 1000,
    });

    // Connect filter envelope to filter frequency (only if LFO not taking over)
    if (!wbConfig.wobbleLFO.enabled || wbConfig.filterEnvelope.amount > 0) {
      filterEnv.connect(filter.frequency);
    }

    // === WOBBLE LFO ===
    let wobbleLFO: Tone.LFO | null = null;

    if (wbConfig.wobbleLFO.enabled) {
      // Calculate LFO rate from sync value
      let lfoRate = wbConfig.wobbleLFO.rate;
      if (wbConfig.wobbleLFO.sync !== 'free') {
        // Convert sync division to rate based on current BPM
        const bpm = Tone.getTransport().bpm.value || 120;
        const syncMap: Record<string, number> = {
          '1/1': 1,
          '1/2': 2,
          '1/2T': 3,
          '1/2D': 1.5,
          '1/4': 4,
          '1/4T': 6,
          '1/4D': 3,
          '1/8': 8,
          '1/8T': 12,
          '1/8D': 6,
          '1/16': 16,
          '1/16T': 24,
          '1/16D': 12,
          '1/32': 32,
          '1/32T': 48,
        };
        const divisor = syncMap[wbConfig.wobbleLFO.sync] || 4;
        lfoRate = (bpm / 60) * (divisor / 4);
      }

      // Map shape to Tone.js type
      const shapeMap: Record<string, Tone.ToneOscillatorType> = {
        'sine': 'sine',
        'triangle': 'triangle',
        'saw': 'sawtooth',
        'square': 'square',
        'sample_hold': 'square', // Closest approximation
      };

      // Calculate filter modulation range based on amount
      const filterModRange = filterBaseFreq * 4; // 4 octaves max range
      const minFreq = Math.max(20, filterBaseFreq * 0.1);
      const maxFreq = Math.min(20000, filterBaseFreq + (filterModRange * (wbConfig.wobbleLFO.amount / 100)));

      wobbleLFO = new Tone.LFO({
        frequency: lfoRate,
        type: shapeMap[wbConfig.wobbleLFO.shape] || 'sine',
        min: minFreq,
        max: maxFreq,
        phase: wbConfig.wobbleLFO.phase,
      });

      wobbleLFO.connect(filter.frequency);
      wobbleLFO.start();
    }

    // === DISTORTION SECTION ===
    let distortion: Tone.ToneAudioNode | null = null;
    if (wbConfig.distortion.enabled) {
      switch (wbConfig.distortion.type) {
        case 'soft':
          distortion = new Tone.Distortion({
            distortion: wbConfig.distortion.drive / 100,
            oversample: '2x',
          });
          break;
        case 'hard':
          distortion = new Tone.Chebyshev({
            order: Math.floor(1 + (wbConfig.distortion.drive / 100) * 50),
          });
          break;
        case 'fuzz':
          distortion = new Tone.Distortion({
            distortion: 0.5 + (wbConfig.distortion.drive / 200),
            oversample: '4x',
          });
          break;
        case 'bitcrush':
          distortion = new Tone.BitCrusher({
            bits: Math.max(2, 12 - Math.floor(wbConfig.distortion.drive / 10)),
          });
          break;
      }
    }

    // Post-distortion tone control
    const toneFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 500 + (wbConfig.distortion.tone / 100) * 15000,
      Q: 0.5,
    });

    // === FORMANT SECTION (for growl) ===
    let formantFilters: Tone.Filter[] = [];
    let formantMixer: Tone.Gain | null = null;
    if (wbConfig.formant.enabled) {
      const formants = VOWEL_FORMANTS[wbConfig.formant.vowel];
      formantFilters = [
        new Tone.Filter({ type: 'bandpass', frequency: formants.f1, Q: 5 }),
        new Tone.Filter({ type: 'bandpass', frequency: formants.f2, Q: 5 }),
        new Tone.Filter({ type: 'bandpass', frequency: formants.f3, Q: 5 }),
      ];
      formantMixer = new Tone.Gain(0.5);
    }

    // === OUTPUT ===
    const output = new Tone.Gain(1);
    output.gain.value = Math.pow(10, this.getNormalizedVolume('WobbleBass', config.volume) / 20);

    // === SIGNAL CHAIN ===
    // Route oscillators through mixer
    osc1.connect(oscMixer);
    osc2.connect(oscMixer);
    if (subOsc) subOsc.connect(oscMixer);
    if (fmSynth) fmSynth.connect(oscMixer);
    // Connect unison panners (voices already connected to their panners)
    unisonPanners.forEach(p => p.connect(oscMixer));

    // Route through filter chain
    if (filterDrive) {
      oscMixer.connect(filterDrive);
      filterDrive.connect(filter);
    } else {
      oscMixer.connect(filter);
    }

    // Route through effects
    let currentNode: Tone.ToneAudioNode = filter;

    if (distortion) {
      currentNode.connect(distortion);
      currentNode = distortion;
    }

    currentNode.connect(toneFilter);
    currentNode = toneFilter;

    // Add formant parallel path if enabled
    if (formantMixer && formantFilters.length > 0) {
      formantFilters.forEach(f => {
        currentNode.connect(f);
        f.connect(formantMixer!);
      });
      formantMixer.connect(output);
      currentNode.connect(output); // Mix dry + formant
    } else {
      currentNode.connect(output);
    }

    // Store active notes for release
    const activeNotes = new Set<string>();

    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        const v = velocity ?? 0.8;

        // Release any existing voice for this note first to prevent voice leak
        try { osc1.triggerRelease(note, t); } catch { /* ignore */ }
        try { osc2.triggerRelease(note, t); } catch { /* ignore */ }
        try { if (subOsc) subOsc.triggerRelease(note, t); } catch { /* ignore */ }
        try { if (fmSynth) fmSynth.triggerRelease(note, t); } catch { /* ignore */ }
        try { unisonVoices.forEach(voice => voice.triggerRelease(note, t)); } catch { /* ignore */ }

        // Reset LFO phase on retrigger
        if (wbConfig.wobbleLFO.retrigger && wobbleLFO) {
          wobbleLFO.phase = wbConfig.wobbleLFO.phase;
        }

        // Trigger filter envelope
        filterEnv.triggerAttack(t);

        // Trigger all oscillators
        osc1.triggerAttackRelease(note, duration, t, v);
        osc2.triggerAttackRelease(note, duration, t, v);
        if (subOsc) subOsc.triggerAttackRelease(note, duration, t, v);
        if (fmSynth) fmSynth.triggerAttackRelease(note, duration, t, v);
        unisonVoices.forEach(voice => voice.triggerAttackRelease(note, duration, t, v * 0.6));
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        const t = time ?? Tone.now();
        const v = velocity ?? 0.8;
        activeNotes.add(note);

        // Release any existing voice for this note first to prevent voice leak
        try { osc1.triggerRelease(note, t); } catch { /* ignore */ }
        try { osc2.triggerRelease(note, t); } catch { /* ignore */ }
        try { if (subOsc) subOsc.triggerRelease(note, t); } catch { /* ignore */ }
        try { if (fmSynth) fmSynth.triggerRelease(note, t); } catch { /* ignore */ }
        try { unisonVoices.forEach(voice => voice.triggerRelease(note, t)); } catch { /* ignore */ }

        // Reset LFO phase on retrigger
        if (wbConfig.wobbleLFO.retrigger && wobbleLFO) {
          wobbleLFO.phase = wbConfig.wobbleLFO.phase;
        }

        // Trigger filter envelope
        filterEnv.triggerAttack(t);

        osc1.triggerAttack(note, t, v);
        osc2.triggerAttack(note, t, v);
        if (subOsc) subOsc.triggerAttack(note, t, v);
        if (fmSynth) fmSynth.triggerAttack(note, t, v);
        unisonVoices.forEach(voice => voice.triggerAttack(note, t, v * 0.6));
      },
      triggerRelease: (note: string, time?: number) => {
        const t = time ?? Tone.now();
        activeNotes.delete(note);

        filterEnv.triggerRelease(t);

        osc1.triggerRelease(note, t);
        osc2.triggerRelease(note, t);
        if (subOsc) subOsc.triggerRelease(note, t);
        if (fmSynth) fmSynth.triggerRelease(note, t);
        unisonVoices.forEach(voice => voice.triggerRelease(note, t));
      },
      releaseAll: () => {
        osc1.releaseAll();
        osc2.releaseAll();
        if (subOsc) subOsc.releaseAll();
        if (fmSynth) fmSynth.releaseAll();
        unisonVoices.forEach(voice => voice.releaseAll());
        activeNotes.clear();
      },
      connect: (dest: Tone.InputNode) => output.connect(dest),
      disconnect: () => output.disconnect(),
      dispose: () => {
        osc1.dispose();
        osc2.dispose();
        if (subOsc) subOsc.dispose();
        if (fmSynth) fmSynth.dispose();
        unisonVoices.forEach(v => v.dispose());
        unisonPanners.forEach(p => p.dispose());
        oscMixer.dispose();
        filter.dispose();
        if (filterDrive) filterDrive.dispose();
        filterEnv.dispose();
        if (wobbleLFO) wobbleLFO.dispose();
        if (distortion) distortion.dispose();
        toneFilter.dispose();
        formantFilters.forEach(f => f.dispose());
        if (formantMixer) formantMixer.dispose();
        output.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const wbc = newConfig || DEFAULT_WOBBLE_BASS;
        const wbcEnv = (wbc.envelope || {}) as Record<string, number>;
        const wbcOsc1 = (wbc.osc1 || {}) as Record<string, number>;
        const wbcOsc2 = (wbc.osc2 || {}) as Record<string, number>;
        const wbcSub = (wbc.sub || {}) as Record<string, number>;
        const wbcFilter = (wbc.filter || {}) as Record<string, unknown>;
        const wbcLFO = (wbc.wobbleLFO || {}) as Record<string, number>;
        
        // Update Envelopes
        const envParams = {
          attack: (wbcEnv.attack || 10) / 1000,
          decay: (wbcEnv.decay || 200) / 1000,
          sustain: (wbcEnv.sustain ?? 70) / 100,
          release: (wbcEnv.release || 300) / 1000,
        };
        osc1.set({ envelope: envParams });
        osc2.set({ envelope: envParams });
        if (subOsc) subOsc.set({ envelope: envParams });
        if (fmSynth) fmSynth.set({ envelope: envParams });
        unisonVoices.forEach(v => v.set({ envelope: envParams }));

        // Update Osc Levels & Tuning
        osc1.volume.rampTo(-6 + (wbcOsc1.level / 100) * 6 - 6, 0.1);
        osc2.volume.rampTo(-6 + (wbcOsc2.level / 100) * 6 - 6, 0.1);
        osc1.set({ detune: wbcOsc1.octave * 1200 + wbcOsc1.detune });
        osc2.set({ detune: wbcOsc2.octave * 1200 + wbcOsc2.detune });
        
        if (subOsc) {
          subOsc.volume.rampTo(-12 + (wbcSub.level / 100) * 12 - 6, 0.1);
          subOsc.set({ detune: wbcSub.octave * 1200 });
        }

        // Update Filter
        filter.set({
          type: wbcFilter.type as Tone.FilterOptions['type'],
          frequency: Number(wbcFilter.cutoff) || 500,
          Q: Number(wbcFilter.resonance) / 10,
        });

        // Update LFO
        if (wobbleLFO) {
          wobbleLFO.frequency.rampTo(wbcLFO.rate || 1, 0.1);
        }
      },
      volume: osc1.volume,

      // Expose LFO for external control
      wobbleLFO,
      filter,
    } as unknown as Tone.ToneAudioNode;
  }

  /**
   * Reverse an AudioBuffer by copying samples in reverse order
   */
  // @ts-ignore unused but kept for potential future use
  private static _reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const audioContext = Tone.getContext().rawContext;
    const reversed = audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = reversed.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    return reversed;
  }

  /**
   * Create a DrumKit multi-sample instrument
   */
  private static createDrumKit(config: InstrumentConfig): DrumKitSynth {
    const dkConfig = config.drumKit || DEFAULT_DRUMKIT;
    return new DrumKitSynth(dkConfig);
  }

  // ============================================================================
  // PITCH ENVELOPE UTILITIES
  // ============================================================================

  /**
   * Apply pitch envelope for triggerAttackRelease (full envelope cycle)
   * Modulates synth detune from initial offset back to 0, with decay/sustain/release
   */
  private static applyPitchEnvelope(
    synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
    pitchEnv: PitchEnvelopeConfig,
    time: number,
    duration: number
  ): void {
    const startCents = pitchEnv.amount * 100; // Convert semitones to cents
    const sustainCents = (pitchEnv.sustain / 100) * startCents;
    const attackTime = pitchEnv.attack / 1000;
    const releaseTime = pitchEnv.release / 1000;

    // Cast to access detune param
    const s = synth as { set?: (options: { detune: number }) => void };
    if (!s.set) return;

    // Start at initial offset
    s.set({ detune: startCents });

    // Attack phase: stay at start pitch (or ramp if attack > 0)
    if (attackTime > 0) {
      // For pitch envelope, attack means staying at the offset
      // The actual envelope starts after attack
    }

    // Decay to sustain level
    const decayStart = time + attackTime;
    setTimeout(() => {
      if (s.set) s.set({ detune: sustainCents });
    }, (decayStart - Tone.now()) * 1000);

    // Release back to 0 after note duration
    const releaseStart = time + duration;
    setTimeout(() => {
      if (s.set) s.set({ detune: 0 });
    }, (releaseStart - Tone.now()) * 1000 + releaseTime * 1000);
  }

  /**
   * Trigger pitch envelope attack phase
   * Sets initial pitch offset and schedules decay to sustain
   */
  private static triggerPitchEnvelopeAttack(
    synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
    pitchEnv: PitchEnvelopeConfig,
    time: number
  ): void {
    const startCents = pitchEnv.amount * 100; // Convert semitones to cents
    const sustainCents = (pitchEnv.sustain / 100) * startCents;
    const attackTime = pitchEnv.attack / 1000;
    const decayTime = pitchEnv.decay / 1000;

    const s = synth as { set?: (options: { detune: number }) => void };
    if (!s.set) return;

    // Start at initial pitch offset
    s.set({ detune: startCents });

    // Schedule decay to sustain level relative to the scheduled time
    const delayMs = Math.max(0, (time - Tone.now() + attackTime + decayTime) * 1000);
    setTimeout(() => {
      if (s.set) s.set({ detune: sustainCents });
    }, delayMs);
  }

  private static createDubSiren(config: InstrumentConfig): Tone.ToneAudioNode {
    const dubSirenConfig = config.dubSiren || DEFAULT_DUB_SIREN;
    const synth = new DubSirenSynth(dubSirenConfig);
    
    // Apply initial volume
    synth.volume.value = this.getNormalizedVolume('DubSiren', config.volume);

    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createSpaceLaser(config: InstrumentConfig): Tone.ToneAudioNode {
    const spaceLaserConfig = config.spaceLaser || DEFAULT_SPACE_LASER;
    const synth = new SpaceLaserSynth(spaceLaserConfig);

    synth.volume.value = this.getNormalizedVolume('SpaceLaser', config.volume);
    
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createV2(config: InstrumentConfig): Tone.ToneAudioNode {
    // Check if V2 Speech mode is enabled - use V2SpeechSynth for singing/talking
    if (config.v2Speech || config.synthType === 'V2Speech') {
      const synth = new V2SpeechSynth(config.v2Speech || undefined);

      synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('V2', config.volume));

      return synth as unknown as Tone.ToneAudioNode;
    }

    // Regular V2 synth mode - pass V2 config for initial patch parameters
    const synth = new V2Synth(config.v2 || undefined);

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('V2', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createSam(config: InstrumentConfig): Tone.ToneAudioNode {
    const samConfig = config.sam || DEFAULT_SAM;
    const synth = new SAMSynth(samConfig);

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('Sam', config.volume));
    
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createSynare(config: InstrumentConfig): Tone.ToneAudioNode {
    const synareConfig = config.synare || DEFAULT_SYNARE;
    const synth = new SynareSynth(synareConfig);

    synth.volume.value = this.getNormalizedVolume('Synare', config.volume);

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create Dexed (DX7) FM Synthesizer
   * 16-voice polyphonic FM synthesis with full DX7 compatibility
   */
  private static createDexed(config: InstrumentConfig): Tone.ToneAudioNode {
    const dexedConfig = config.dexed || {};
    const synth = new DexedSynth(dexedConfig);

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('Dexed', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create OB-Xd (Oberheim) Analog Synthesizer
   * 8-voice polyphonic analog-modeled synthesis
   */
  private static createOBXd(config: InstrumentConfig): Tone.ToneAudioNode {
    const obxdConfig = config.obxd || {};
    const synth = new OBXdSynth(obxdConfig);

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('OBXd', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create CZ-101 Phase Distortion Synthesizer
   * 8-voice Phase Distortion synthesis with DCO/DCW/DCA envelopes
   */
  private static createCZ101(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new CZ101Synth();
    void synth.init();

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('CZ101', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create CEM3394 Analog Synthesizer Voice
   * 8-voice analog synthesis with VCO, VCF, VCA (Prophet VS, Matrix-6, ESQ-1)
   */
  private static createCEM3394(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new CEM3394Synth();

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('CEM3394', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create Sega Saturn SCSP (YMF292-F) Sound Processor
   * 32-voice synthesis with ADSR, LFO, and FM capabilities
   */
  private static createSCSP(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new SCSPSynth();

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('SCSP', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create Ensoniq VFX (ES5506) Wavetable Synthesizer
   * 32-voice wavetable synthesis with resonant filters
   */
  private static createVFX(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new VFXSynth();
    void synth.init();

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEVFX', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create Roland D-50 Linear Arithmetic Synthesizer
   * 16-voice LA synthesis (PCM attacks + digital sustain)
   */
  private static createD50(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new D50Synth();
    void synth.init();

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMERSA', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create Roland SA-synthesis Digital Piano (RdPiano WASM)
   * Cycle-accurate MKS-20 / MK-80 emulation with SpaceD chorus
   */
  private static createRdPiano(config: InstrumentConfig): Tone.ToneAudioNode {
    const rdpianoConfig = config.rdpiano || {};
    const synth = new RdPianoSynth(rdpianoConfig);

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMERSA', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  /**
   * Create Yamaha MU-2000 (SWP30) Wavetable Synthesizer
   * 64-voice GM2/XG compatible wavetable synthesis
   */
  private static createMU2000(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new MU2000Synth();
    void synth.init();

    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMESWP30', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  // ─── Buzz3o3DF (Devil Fish variant) ───────────────────────────────

  private static createBuzz3o3DF(config: InstrumentConfig): BuzzmachineGenerator {
    const synth = new BuzzmachineGenerator(BuzzmachineType.OOMEK_AGGRESSOR_DF);

    if (config.tb303) {
      const tb = config.tb303;
      synth.setCutoff(tb.filter.cutoff);
      synth.setResonance(tb.filter.resonance);
      synth.setEnvMod(tb.filterEnvelope.envMod);
      synth.setDecay(tb.filterEnvelope.decay);
      synth.setAccentAmount(tb.accent.amount);
      synth.setWaveform(tb.oscillator.type);
      if (tb.tuning !== undefined) synth.setTuning(tb.tuning);
      if (tb.overdrive) synth.setOverdrive(tb.overdrive.amount);

      if (tb.devilFish) {
        const df = tb.devilFish;
        if (df.enabled) {
          synth.enableDevilFish(true, {
            overdrive: tb.overdrive?.amount,
            muffler: df.muffler as 'off' | 'dark' | 'mid' | 'bright',
          });
        }
        if (df.muffler) synth.setMuffler(df.muffler);
        if (df.highResonance) synth.setHighResonanceEnabled(df.highResonance);
        if (df.filterTracking !== undefined) synth.setFilterTracking(df.filterTracking);
        if (df.normalDecay !== undefined) synth.setNormalDecay(df.normalDecay);
        if (df.accentDecay !== undefined) synth.setAccentDecay(df.accentDecay);
        if (df.vegDecay !== undefined) synth.setVegDecay(df.vegDecay);
        if (df.vegSustain !== undefined) synth.setVegSustain(df.vegSustain);
        if (df.softAttack !== undefined) synth.setSoftAttack(df.softAttack);
        if (df.sweepSpeed !== undefined) synth.setSweepSpeed(df.sweepSpeed);
        if (df.filterFmDepth !== undefined) synth.setFilterFM(df.filterFmDepth);
      }

      const normalizedVolume = this.getNormalizedVolume('Buzz3o3DF', config.volume);
      synth.setVolume(normalizedVolume);
    }

    return synth;
  }

  // ─── MAME Hardware-Accurate Synths ────────────────────────────────

  /** Apply config.parameters to a MAME chip synth via setParam/loadPreset */
  private static applyChipParameters(synth: { setParam: (key: string, value: number) => void; loadPreset?: (index: number) => void }, config: InstrumentConfig): void {
    const params = config.parameters;
    if (!params) return;
    // If _program is set, load built-in WASM preset first (not all chips support it)
    if (typeof params._program === 'number' && typeof synth.loadPreset === 'function') {
      synth.loadPreset(params._program);
    }
    // Apply individual parameter overrides
    for (const [key, value] of Object.entries(params)) {
      if (key === '_program' || typeof value !== 'number') continue;
      synth.setParam(key, value);
    }
  }

  private static createMAMEAICA(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new AICASynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEAICA', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEASC(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new ASCSynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEASC', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEAstrocade(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new AstrocadeSynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEAstrocade', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEC352(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new C352Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEC352', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEES5503(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new ES5503Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEES5503', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEICS2115(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new ICS2115Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEICS2115', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEK054539(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new K054539Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEK054539', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEMEA8000(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new MEA8000Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEMEA8000', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMERF5C400(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new RF5C400Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMERF5C400', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMESN76477(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new SN76477Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMESN76477', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMESNKWave(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new SNKWaveSynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMESNKWave', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMESP0250(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new SP0250Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMESP0250', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMETMS36XX(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new TMS36XXSynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMETMS36XX', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMETMS5220(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new TMS5220Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMETMS5220', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMETR707(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new TR707Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMETR707', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEUPD931(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new UPD931Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEUPD931', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEUPD933(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new UPD933Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEUPD933', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEVotrax(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new VotraxSynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEVotrax', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEYMF271(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new YMF271Synth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEYMF271', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEYMOPQ(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new YMOPQSynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEYMOPQ', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createMAMEVASynth(config: InstrumentConfig): Tone.ToneAudioNode {
    const synth = new VASynthSynth();
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('MAMEVASynth', config.volume));
    this.applyChipParameters(synth, config);
    return synth as unknown as Tone.ToneAudioNode;
  }

  private static createModularSynth(config: InstrumentConfig): DevilboxSynth {
    const patchConfig = config.modularSynth || DEFAULT_MODULAR_PATCH;
    const synth = new ModularSynth(patchConfig);
    synth.output.gain.value = Tone.dbToGain(this.getNormalizedVolume('ModularSynth', config.volume));
    return synth;
  }

  /**
   * Trigger pitch envelope release phase
   * Ramps from sustain level back to 0
   */
  private static triggerPitchEnvelopeRelease(
    synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
    pitchEnv: PitchEnvelopeConfig,
    time: number
  ): void {
    const releaseTime = pitchEnv.release / 1000;
    const s = synth as { set?: (options: { detune: number }) => void };
    if (!s.set) return;

    // Ramp back to 0 over release time, scheduled relative to the note release time
    const delayMs = Math.max(0, (time - Tone.now() + releaseTime) * 1000);
    setTimeout(() => {
      if (s.set) s.set({ detune: 0 });
    }, delayMs);
  }
}

/**
 * Get default furnace config for a given synth type
 * Used when creating new instruments in the modal
 */
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
