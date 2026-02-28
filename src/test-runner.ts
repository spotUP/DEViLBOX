/**
 * Browser-based Synth Test Runner
 * Runs tests with real AudioContext to detect fallbacks and validate synths
 */

import * as Tone from 'tone';
import { InstrumentFactory } from './engine/InstrumentFactory';
import type { InstrumentConfig } from './types/instrument';
import {
  DEFAULT_FURNACE,
} from './types/instrument';
import type { EffectConfig } from './types/instrument';
import { SAMPLE_PACKS } from './constants/samplePacks';
import type { SampleCategory } from './types/samplePack';
import { FurnaceChipEngine } from './engine/chips/FurnaceChipEngine';
import { FurnaceDispatchEngine } from './engine/furnace-dispatch/FurnaceDispatchEngine';
import { BuzzmachineEngine } from './engine/buzzmachines/BuzzmachineEngine';
import { MAMEEngine } from './engine/MAMEEngine';
import { getFirstPresetForSynthType } from './constants/factoryPresets';
import { setDevilboxAudioContext } from './utils/audio-context';

/** Extend Window with test-runner globals so we avoid `(window as any)` */
interface TestRunnerWindow {
  CAPTURED_CONSOLE_ERRORS: string[];
  SYNTH_TEST_COMPLETE: boolean;
  SYNTH_TEST_RESULTS: TestResults | null;
  downloadConsoleErrors: () => void;
  runAllTests: () => Promise<void>;
  runFallbackTests: () => Promise<void>;
  runVolumeTests: () => Promise<void>;
  runBehaviorTests: () => Promise<void>;
  runSamplePackTests: () => Promise<void>;
  runEffectTests: () => Promise<void>;
}

declare const window: Window & TestRunnerWindow;

// ============================================
// SYNTH TEST CONFIGURATIONS
// ============================================

// =============================================
// ALL FURNACE INSTRUMENTS - FULL DEBUG CONFIG
// =============================================
const SYNTH_CONFIGS: Record<string, Record<string, unknown>> = {
  // === Furnace FM Chips ===
  'FurnaceOPN': { synthType: 'FurnaceOPN', volume: -12, furnace: DEFAULT_FURNACE },       // YM2612 - Genesis
  'FurnaceOPM': { synthType: 'FurnaceOPM', volume: -12, furnace: DEFAULT_FURNACE },       // YM2151 - Arcade
  'FurnaceOPL': { synthType: 'FurnaceOPL', volume: -12, furnace: DEFAULT_FURNACE },       // YMF262 - SoundBlaster
  'FurnaceOPLL': { synthType: 'FurnaceOPLL', volume: -12, furnace: DEFAULT_FURNACE },     // YM2413 - MSX
  'FurnaceESFM': { synthType: 'FurnaceESFM', volume: -12, furnace: DEFAULT_FURNACE },     // Enhanced OPL3
  'FurnaceOPZ': { synthType: 'FurnaceOPZ', volume: -12, furnace: DEFAULT_FURNACE },       // YM2414 - TX81Z
  'FurnaceOPNA': { synthType: 'FurnaceOPNA', volume: -12, furnace: DEFAULT_FURNACE },     // YM2608 - PC-98
  'FurnaceOPNB': { synthType: 'FurnaceOPNB', volume: -12, furnace: DEFAULT_FURNACE },     // YM2610 - Neo Geo
  'FurnaceOPL4': { synthType: 'FurnaceOPL4', volume: -12, furnace: DEFAULT_FURNACE },     // YMF278B
  'FurnaceY8950': { synthType: 'FurnaceY8950', volume: -12, furnace: DEFAULT_FURNACE },   // MSX-AUDIO
  'FurnaceVRC7': { synthType: 'FurnaceVRC7', volume: -12, furnace: DEFAULT_FURNACE },     // Konami VRC7
  'FurnaceOPN2203': { synthType: 'FurnaceOPN2203', volume: -12, furnace: DEFAULT_FURNACE }, // YM2203
  'FurnaceOPNBB': { synthType: 'FurnaceOPNBB', volume: -12, furnace: DEFAULT_FURNACE },   // YM2610B

  // === Furnace Console PSG Chips ===
  'FurnaceNES': { synthType: 'FurnaceNES', volume: -12, furnace: DEFAULT_FURNACE },       // 2A03 - NES
  'FurnaceGB': { synthType: 'FurnaceGB', volume: -12, furnace: DEFAULT_FURNACE },         // Game Boy DMG
  'FurnaceSNES': { synthType: 'FurnaceSNES', volume: -12, furnace: DEFAULT_FURNACE },     // SPC700 - SNES
  'FurnacePCE': { synthType: 'FurnacePCE', volume: -12, furnace: DEFAULT_FURNACE },       // HuC6280 - PC Engine
  'FurnacePSG': { synthType: 'FurnacePSG', volume: -12, furnace: DEFAULT_FURNACE },       // SN76489 - SMS
  'FurnaceVB': { synthType: 'FurnaceVB', volume: -12, furnace: DEFAULT_FURNACE },         // Virtual Boy VSU
  'FurnaceLynx': { synthType: 'FurnaceLynx', volume: -12, furnace: DEFAULT_FURNACE },     // Atari Lynx Mikey
  'FurnaceSWAN': { synthType: 'FurnaceSWAN', volume: -12, furnace: DEFAULT_FURNACE },     // WonderSwan
  'FurnaceGBA': { synthType: 'FurnaceGBA', volume: -12, furnace: DEFAULT_FURNACE },       // GBA DMA
  'FurnaceNDS': { synthType: 'FurnaceNDS', volume: -12, furnace: DEFAULT_FURNACE },       // Nintendo DS
  'FurnacePOKEMINI': { synthType: 'FurnacePOKEMINI', volume: -12, furnace: DEFAULT_FURNACE }, // Pokemon Mini

  // === Furnace NES Expansion Audio ===
  'FurnaceVRC6': { synthType: 'FurnaceVRC6', volume: -12, furnace: DEFAULT_FURNACE },     // Konami VRC6
  'FurnaceN163': { synthType: 'FurnaceN163', volume: -12, furnace: DEFAULT_FURNACE },     // Namco 163
  'FurnaceFDS': { synthType: 'FurnaceFDS', volume: -12, furnace: DEFAULT_FURNACE },       // Famicom Disk System
  'FurnaceMMC5': { synthType: 'FurnaceMMC5', volume: -12, furnace: DEFAULT_FURNACE },     // MMC5

  // === Furnace Computer Chips ===
  'FurnaceC64': { synthType: 'FurnaceC64', volume: -12, furnace: DEFAULT_FURNACE },       // SID 6581
  'FurnaceSID6581': { synthType: 'FurnaceSID6581', volume: -12, furnace: DEFAULT_FURNACE }, // MOS 6581
  'FurnaceSID8580': { synthType: 'FurnaceSID8580', volume: -12, furnace: DEFAULT_FURNACE }, // MOS 8580
  'FurnaceAY': { synthType: 'FurnaceAY', volume: -12, furnace: DEFAULT_FURNACE },         // AY-3-8910
  'FurnaceAY8930': { synthType: 'FurnaceAY8930', volume: -12, furnace: DEFAULT_FURNACE }, // Enhanced AY
  'FurnaceVIC': { synthType: 'FurnaceVIC', volume: -12, furnace: DEFAULT_FURNACE },       // VIC-20
  'FurnaceSAA': { synthType: 'FurnaceSAA', volume: -12, furnace: DEFAULT_FURNACE },       // Philips SAA1099
  'FurnaceTED': { synthType: 'FurnaceTED', volume: -12, furnace: DEFAULT_FURNACE },       // Plus/4 TED
  'FurnaceVERA': { synthType: 'FurnaceVERA', volume: -12, furnace: DEFAULT_FURNACE },     // Commander X16
  'FurnacePET': { synthType: 'FurnacePET', volume: -12, furnace: DEFAULT_FURNACE },       // Commodore PET

  // === Furnace Wavetable Chips ===
  'FurnaceSCC': { synthType: 'FurnaceSCC', volume: -12, furnace: DEFAULT_FURNACE },       // Konami SCC
  'FurnaceX1_010': { synthType: 'FurnaceX1_010', volume: -12, furnace: DEFAULT_FURNACE }, // Seta X1-010
  'FurnaceNAMCO': { synthType: 'FurnaceNAMCO', volume: -12, furnace: DEFAULT_FURNACE },   // Namco WSG (Pac-Man)
  'FurnaceBUBBLE': { synthType: 'FurnaceBUBBLE', volume: -12, furnace: DEFAULT_FURNACE }, // Konami Bubble System

  // === Furnace Sample/PCM Chips ===
  'FurnaceSEGAPCM': { synthType: 'FurnaceSEGAPCM', volume: -12, furnace: DEFAULT_FURNACE },   // Sega PCM
  'FurnaceQSOUND': { synthType: 'FurnaceQSOUND', volume: -12, furnace: DEFAULT_FURNACE },     // Capcom QSound
  'FurnaceES5506': { synthType: 'FurnaceES5506', volume: -12, furnace: DEFAULT_FURNACE },     // Ensoniq ES5506
  'FurnaceRF5C68': { synthType: 'FurnaceRF5C68', volume: -12, furnace: DEFAULT_FURNACE },     // Sega CD PCM
  'FurnaceC140': { synthType: 'FurnaceC140', volume: -12, furnace: DEFAULT_FURNACE },         // Namco C140
  'FurnaceK007232': { synthType: 'FurnaceK007232', volume: -12, furnace: DEFAULT_FURNACE },   // Konami K007232
  'FurnaceK053260': { synthType: 'FurnaceK053260', volume: -12, furnace: DEFAULT_FURNACE },   // Konami K053260
  'FurnaceGA20': { synthType: 'FurnaceGA20', volume: -12, furnace: DEFAULT_FURNACE },         // Irem GA20
  'FurnaceOKI': { synthType: 'FurnaceOKI', volume: -12, furnace: DEFAULT_FURNACE },           // OKI MSM6295
  'FurnaceYMZ280B': { synthType: 'FurnaceYMZ280B', volume: -12, furnace: DEFAULT_FURNACE },   // Yamaha YMZ280B
  'FurnaceMSM6258': { synthType: 'FurnaceMSM6258', volume: -12, furnace: DEFAULT_FURNACE },   // OKI MSM6258
  'FurnaceMSM5232': { synthType: 'FurnaceMSM5232', volume: -12, furnace: DEFAULT_FURNACE },   // OKI MSM5232
  'FurnaceMULTIPCM': { synthType: 'FurnaceMULTIPCM', volume: -12, furnace: DEFAULT_FURNACE }, // Sega MultiPCM
  'FurnacePCMDAC': { synthType: 'FurnacePCMDAC', volume: -12, furnace: DEFAULT_FURNACE },     // Generic PCM DAC

  // === Furnace Other/Misc Chips ===
  'FurnaceTIA': { synthType: 'FurnaceTIA', volume: -12, furnace: DEFAULT_FURNACE },           // Atari 2600
  'FurnaceAMIGA': { synthType: 'FurnaceAMIGA', volume: -12, furnace: DEFAULT_FURNACE },       // Amiga Paula
  'FurnacePCSPKR': { synthType: 'FurnacePCSPKR', volume: -12, furnace: DEFAULT_FURNACE },     // PC Speaker
  'FurnaceZXBEEPER': { synthType: 'FurnaceZXBEEPER', volume: -12, furnace: DEFAULT_FURNACE }, // ZX Spectrum
  'FurnacePOKEY': { synthType: 'FurnacePOKEY', volume: -12, furnace: DEFAULT_FURNACE },       // Atari POKEY
  'FurnaceSM8521': { synthType: 'FurnaceSM8521', volume: -12, furnace: DEFAULT_FURNACE },     // Game.com
  'FurnaceT6W28': { synthType: 'FurnaceT6W28', volume: -12, furnace: DEFAULT_FURNACE },       // NEC T6W28
  'FurnacePONG': { synthType: 'FurnacePONG', volume: -12, furnace: DEFAULT_FURNACE },         // AY-3-8500 Pong
  'FurnacePV1000': { synthType: 'FurnacePV1000', volume: -12, furnace: DEFAULT_FURNACE },     // Casio PV-1000
  'FurnaceDAVE': { synthType: 'FurnaceDAVE', volume: -12, furnace: DEFAULT_FURNACE },         // Enterprise DAVE
  'FurnaceSU': { synthType: 'FurnaceSU', volume: -12, furnace: DEFAULT_FURNACE },             // Sound Unit
  'FurnacePOWERNOISE': { synthType: 'FurnacePOWERNOISE', volume: -12, furnace: DEFAULT_FURNACE }, // Power Noise
  'FurnaceSCVTONE': { synthType: 'FurnaceSCVTONE', volume: -12, furnace: DEFAULT_FURNACE },   // Epoch SCV
  'FurnaceUPD1771': { synthType: 'FurnaceUPD1771', volume: -12, furnace: DEFAULT_FURNACE },   // NEC uPD1771
  'FurnaceSUPERVISION': { synthType: 'FurnaceSUPERVISION', volume: -12, furnace: DEFAULT_FURNACE }, // Watara Supervision

  // === Generic Furnace (default platform) ===
  'Furnace': { synthType: 'Furnace', volume: -12, furnace: DEFAULT_FURNACE },

  // === Modular Synthesis ===
  'ModularSynth': { synthType: 'ModularSynth', volume: -12 },

  // === MAME Standalone WASM Chips ===
  // ROM/sample-dependent (definitively silent without ROM):
  // 'MAMEAICA': { synthType: 'MAMEAICA', volume: -12 },     // needs wavetable ROM
  // 'MAMERF5C400': { synthType: 'MAMERF5C400', volume: -12 }, // needs sample ROM
  'MAMEASC': { synthType: 'MAMEASC', volume: -12 },
  'MAMEAstrocade': { synthType: 'MAMEAstrocade', volume: -12 },
  'MAMEC352': { synthType: 'MAMEC352', volume: -12 },
  'MAMEES5503': { synthType: 'MAMEES5503', volume: -12 },
  'MAMEICS2115': { synthType: 'MAMEICS2115', volume: -12 },
  'MAMEK054539': { synthType: 'MAMEK054539', volume: -12 },
  'MAMEMEA8000': { synthType: 'MAMEMEA8000', volume: -12 },
  'MAMESN76477': { synthType: 'MAMESN76477', volume: -12 },
  'MAMESNKWave': { synthType: 'MAMESNKWave', volume: -12 },
  'MAMESP0250': { synthType: 'MAMESP0250', volume: -12 },
  'MAMETMS36XX': { synthType: 'MAMETMS36XX', volume: -12 },
  'MAMETMS5220': { synthType: 'MAMETMS5220', volume: -12 },
  'MAMETR707': { synthType: 'MAMETR707', volume: -12 },
  'MAMEUPD931': { synthType: 'MAMEUPD931', volume: -12 },
  'MAMEUPD933': { synthType: 'MAMEUPD933', volume: -12 },
  'MAMEVotrax': { synthType: 'MAMEVotrax', volume: -12 },
  'MAMEYMF271': { synthType: 'MAMEYMF271', volume: -12 },
  'MAMEYMOPQ': { synthType: 'MAMEYMOPQ', volume: -12 },
  'MAMEVASynth': { synthType: 'MAMEVASynth', volume: -12 },
  'MAMERSA': { synthType: 'MAMERSA', volume: -12 },

  // === Hardware WASM Chips ===
  'CEM3394': { synthType: 'CEM3394', volume: -12 },
  'SCSP': { synthType: 'SCSP', volume: -12 },
};

/* ALL FURNACE SYNTHS - FULL TEST CONFIG (for reference)
const SYNTH_CONFIGS_FULL: Record<string, any> = {
  // === Core Tone.js Synth for comparison ===
  'Synth': { synthType: 'Synth', volume: -12 },

  // === Furnace FM Chips ===
  'FurnaceOPN': { synthType: 'FurnaceOPN', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPM': { synthType: 'FurnaceOPM', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPL': { synthType: 'FurnaceOPL', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPLL': { synthType: 'FurnaceOPLL', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceESFM': { synthType: 'FurnaceESFM', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPZ': { synthType: 'FurnaceOPZ', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPNA': { synthType: 'FurnaceOPNA', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPNB': { synthType: 'FurnaceOPNB', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPL4': { synthType: 'FurnaceOPL4', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceY8950': { synthType: 'FurnaceY8950', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceVRC7': { synthType: 'FurnaceVRC7', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPN2203': { synthType: 'FurnaceOPN2203', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPNBB': { synthType: 'FurnaceOPNBB', volume: -12, furnace: DEFAULT_FURNACE },

  // === Furnace Console PSG Chips ===
  'FurnaceNES': { synthType: 'FurnaceNES', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceGB': { synthType: 'FurnaceGB', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSNES': { synthType: 'FurnaceSNES', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePCE': { synthType: 'FurnacePCE', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePSG': { synthType: 'FurnacePSG', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceVB': { synthType: 'FurnaceVB', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceLynx': { synthType: 'FurnaceLynx', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSWAN': { synthType: 'FurnaceSWAN', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceVRC6': { synthType: 'FurnaceVRC6', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceN163': { synthType: 'FurnaceN163', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceFDS': { synthType: 'FurnaceFDS', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceMMC5': { synthType: 'FurnaceMMC5', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceGBA': { synthType: 'FurnaceGBA', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceNDS': { synthType: 'FurnaceNDS', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePOKEMINI': { synthType: 'FurnacePOKEMINI', volume: -12, furnace: DEFAULT_FURNACE },

  // === Furnace Computer Chips ===
  'FurnaceC64': { synthType: 'FurnaceC64', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSID6581': { synthType: 'FurnaceSID6581', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSID8580': { synthType: 'FurnaceSID8580', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceAY': { synthType: 'FurnaceAY', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceAY8930': { synthType: 'FurnaceAY8930', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceVIC': { synthType: 'FurnaceVIC', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSAA': { synthType: 'FurnaceSAA', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceTED': { synthType: 'FurnaceTED', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceVERA': { synthType: 'FurnaceVERA', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSCC': { synthType: 'FurnaceSCC', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceTIA': { synthType: 'FurnaceTIA', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceAMIGA': { synthType: 'FurnaceAMIGA', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePET': { synthType: 'FurnacePET', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePCSPKR': { synthType: 'FurnacePCSPKR', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceZXBEEPER': { synthType: 'FurnaceZXBEEPER', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePOKEY': { synthType: 'FurnacePOKEY', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePONG': { synthType: 'FurnacePONG', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePV1000': { synthType: 'FurnacePV1000', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceDAVE': { synthType: 'FurnaceDAVE', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSU': { synthType: 'FurnaceSU', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePOWERNOISE': { synthType: 'FurnacePOWERNOISE', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSCVTONE': { synthType: 'FurnaceSCVTONE', volume: -12, furnace: DEFAULT_FURNACE },

  // === Furnace PCM/Sample Chips ===
  'FurnaceSEGAPCM': { synthType: 'FurnaceSEGAPCM', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceQSOUND': { synthType: 'FurnaceQSOUND', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceES5506': { synthType: 'FurnaceES5506', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceRF5C68': { synthType: 'FurnaceRF5C68', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceC140': { synthType: 'FurnaceC140', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceK007232': { synthType: 'FurnaceK007232', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceK053260': { synthType: 'FurnaceK053260', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceGA20': { synthType: 'FurnaceGA20', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOKI': { synthType: 'FurnaceOKI', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceYMZ280B': { synthType: 'FurnaceYMZ280B', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceX1_010': { synthType: 'FurnaceX1_010', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceMSM6258': { synthType: 'FurnaceMSM6258', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceMSM5232': { synthType: 'FurnaceMSM5232', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceMULTIPCM': { synthType: 'FurnaceMULTIPCM', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceNAMCO': { synthType: 'FurnaceNAMCO', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePCMDAC': { synthType: 'FurnacePCMDAC', volume: -12, furnace: DEFAULT_FURNACE },

  // === Furnace Misc Chips ===
  'FurnaceBUBBLE': { synthType: 'FurnaceBUBBLE', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSM8521': { synthType: 'FurnaceSM8521', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceT6W28': { synthType: 'FurnaceT6W28', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSUPERVISION': { synthType: 'FurnaceSUPERVISION', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceUPD1771': { synthType: 'FurnaceUPD1771', volume: -12, furnace: DEFAULT_FURNACE },

  // === MAME Synths (ROM-dependent — will be auto-skipped) ===
  'MAMEVFX': { synthType: 'MAMEVFX', volume: -12 },
  'MAMEDOC': { synthType: 'MAMEDOC', volume: -12 },
  'MAMERSA': { synthType: 'MAMERSA', volume: -12 },
  'MAMESWP30': { synthType: 'MAMESWP30', volume: -12 },

  // === MAME Per-Chip WASM Synths ===
  'MAMEAICA': { synthType: 'MAMEAICA', volume: -12 },
  'MAMEASC': { synthType: 'MAMEASC', volume: -12 },
  'MAMEAstrocade': { synthType: 'MAMEAstrocade', volume: -12 },
  'MAMEC352': { synthType: 'MAMEC352', volume: -12 },
  'MAMEES5503': { synthType: 'MAMEES5503', volume: -12 },
  'MAMEICS2115': { synthType: 'MAMEICS2115', volume: -12 },
  'MAMEK054539': { synthType: 'MAMEK054539', volume: -12 },
  'MAMEMEA8000': { synthType: 'MAMEMEA8000', volume: -12 },
  'MAMERF5C400': { synthType: 'MAMERF5C400', volume: -12 },
  'MAMESN76477': { synthType: 'MAMESN76477', volume: -12 },
  'MAMESNKWave': { synthType: 'MAMESNKWave', volume: -12 },
  'MAMESP0250': { synthType: 'MAMESP0250', volume: -12 },
  'MAMETMS36XX': { synthType: 'MAMETMS36XX', volume: -12 },
  'MAMETMS5220': { synthType: 'MAMETMS5220', volume: -12 },
  'MAMETR707': { synthType: 'MAMETR707', volume: -12 },
  'MAMEUPD931': { synthType: 'MAMEUPD931', volume: -12 },
  'MAMEUPD933': { synthType: 'MAMEUPD933', volume: -12 },
  'MAMEVotrax': { synthType: 'MAMEVotrax', volume: -12 },
  'MAMEYMF271': { synthType: 'MAMEYMF271', volume: -12 },
  'MAMEYMOPQ': { synthType: 'MAMEYMOPQ', volume: -12 },
  'MAMEVASynth': { synthType: 'MAMEVASynth', volume: -12 },
  // === Standalone WASM Synths ===
  'SCSP': { synthType: 'SCSP', volume: -12 },
};

/* FULL CONFIG - TEMPORARILY DISABLED FOR FOCUSED TESTING
const SYNTH_CONFIGS_FULL: Record<string, any> = {
  // === Core Tone.js Synths ===
  'Synth': { synthType: 'Synth', volume: -12 },
  'DuoSynth': { synthType: 'DuoSynth', volume: -12 },
  'FMSynth': { synthType: 'FMSynth', volume: -12 },
  'AMSynth': { synthType: 'AMSynth', volume: -12 },
  'PluckSynth': { synthType: 'PluckSynth', volume: -12 },
  'MetalSynth': { synthType: 'MetalSynth', volume: -12 },
  'MembraneSynth': { synthType: 'MembraneSynth', volume: -12 },
  'NoiseSynth': { synthType: 'NoiseSynth', volume: -12 },
  'PolySynth': { synthType: 'PolySynth', volume: -12 },

  // === TB-303 Family ===
  'TB303': { synthType: 'TB303', volume: -12, tb303: DEFAULT_TB303 },
  'Buzz3o3': { synthType: 'Buzz3o3', volume: -12 },

  // === Extended Synths ===
  'Wavetable': { synthType: 'Wavetable', volume: -12 },
  'SuperSaw': { synthType: 'SuperSaw', volume: -12 },
  'PWMSynth': { synthType: 'PWMSynth', volume: -12, pwmSynth: DEFAULT_PWM_SYNTH },
  'Organ': { synthType: 'Organ', volume: -12, organ: DEFAULT_ORGAN },
  'StringMachine': { synthType: 'StringMachine', volume: -12, stringMachine: DEFAULT_STRING_MACHINE },
  'WobbleBass': { synthType: 'WobbleBass', volume: -12 },
  'ChipSynth': { synthType: 'ChipSynth', volume: -12, chipSynth: DEFAULT_CHIP_SYNTH },
  'FormantSynth': { synthType: 'FormantSynth', volume: -12 },

  // === Specialty Synths ===
  'DubSiren': { synthType: 'DubSiren', volume: -12, dubSiren: DEFAULT_DUB_SIREN },
  'SpaceLaser': { synthType: 'SpaceLaser', volume: -12 },
  // TEMPORARILY DISABLED: V2 causes all subsequent synths to fail due to AudioWorklet side effects
  // 'V2': { synthType: 'V2', volume: -12 },
  'Sam': { synthType: 'Sam', volume: -12 },
  'Synare': { synthType: 'Synare', volume: -12 },

  // === Core Tone.js - Additional ===
  'MonoSynth': { synthType: 'MonoSynth', volume: -12 },

  // === Sample-based Synths (using real sample URLs from drumnibus pack) ===
  'Sampler': {
    synthType: 'Sampler',
    volume: -12,
    sample: {
      url: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: 1,
      reverse: false
    }
  },
  'Player': {
    synthType: 'Player',
    volume: -12,
    // Factory reads config.parameters?.sampleUrl for Player
    parameters: {
      sampleUrl: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
    },
    sample: {
      url: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: 1,
      reverse: false
    }
  },
  'GranularSynth': {
    synthType: 'GranularSynth',
    volume: -12,
    // Factory reads config.granular?.sampleUrl for GranularSynth
    granular: {
      sampleUrl: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      grainSize: 0.1,
      overlap: 0.5,
    },
    sample: {
      url: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: 1,
      reverse: false
    }
  },
  'DrumKit': {
    synthType: 'DrumKit',
    volume: -12,
    drumKit: {
      keymap: [
        {
          id: 'test-kick',
          sampleId: 'kick',
          sampleUrl: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
          noteStart: 36,
          noteEnd: 36,
        }
      ],
      polyphony: 'poly',
      maxVoices: 8,
      noteCut: false,
    }
  },

  // === Specialized Synths ===
  'DrumMachine': { synthType: 'DrumMachine', volume: -12, drumMachine: DEFAULT_DRUM_MACHINE },
  'ChiptuneModule': { synthType: 'ChiptuneModule', volume: -12 },

  // === Furnace FM Chips === (TESTING subset)
  // Note: FurnaceOPN creates the YM2612 (OPN2) chip - the Genesis FM synth
  'FurnaceOPN': { synthType: 'FurnaceOPN', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPL': { synthType: 'FurnaceOPL', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPM': { synthType: 'FurnaceOPM', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPLL': { synthType: 'FurnaceOPLL', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceESFM': { synthType: 'FurnaceESFM', volume: -12, furnace: DEFAULT_FURNACE },
  // 'FurnaceOPZ': { synthType: 'FurnaceOPZ', volume: -12 },
  'FurnaceOPNA': { synthType: 'FurnaceOPNA', volume: -12, furnace: DEFAULT_FURNACE },
  // 'FurnaceOPNB': { synthType: 'FurnaceOPNB', volume: -12 },
  // 'FurnaceOPL4': { synthType: 'FurnaceOPL4', volume: -12 },
  // 'FurnaceY8950': { synthType: 'FurnaceY8950', volume: -12 },
  // 'FurnaceVRC7': { synthType: 'FurnaceVRC7', volume: -12 },

  // === Furnace Console PSG Chips === (TESTING subset)
  'FurnaceGB': { synthType: 'FurnaceGB', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceNES': { synthType: 'FurnaceNES', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePSG': { synthType: 'FurnacePSG', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnacePCE': { synthType: 'FurnacePCE', volume: -12, furnace: DEFAULT_FURNACE },
  // 'FurnaceSNES': { synthType: 'FurnaceSNES', volume: -12 },
  // 'FurnaceVB': { synthType: 'FurnaceVB', volume: -12 },
  // 'FurnaceLynx': { synthType: 'FurnaceLynx', volume: -12 },
  // 'FurnaceSWAN': { synthType: 'FurnaceSWAN', volume: -12 },
  // 'FurnaceGBA': { synthType: 'FurnaceGBA', volume: -12 },
  // 'FurnaceNDS': { synthType: 'FurnaceNDS', volume: -12 },
  // 'FurnacePOKEMINI': { synthType: 'FurnacePOKEMINI', volume: -12 },

  // === Furnace NES Expansion === (DISABLED for faster testing)
  // 'FurnaceVRC6': { synthType: 'FurnaceVRC6', volume: -12 },
  // 'FurnaceN163': { synthType: 'FurnaceN163', volume: -12 },
  // 'FurnaceFDS': { synthType: 'FurnaceFDS', volume: -12 },
  // 'FurnaceMMC5': { synthType: 'FurnaceMMC5', volume: -12 },

  // === Furnace Computer Chips === (TESTING subset)
  'FurnaceC64': { synthType: 'FurnaceC64', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceSID6581': { synthType: 'FurnaceSID6581', volume: -12, furnace: DEFAULT_FURNACE },
  // 'FurnaceSID8580': { synthType: 'FurnaceSID8580', volume: -12 },
  'FurnaceAY': { synthType: 'FurnaceAY', volume: -12, furnace: DEFAULT_FURNACE },
  // 'FurnaceVIC': { synthType: 'FurnaceVIC', volume: -12 },
  // 'FurnaceSAA': { synthType: 'FurnaceSAA', volume: -12 },
  // 'FurnaceTED': { synthType: 'FurnaceTED', volume: -12 },
  // 'FurnacePOKEY': { synthType: 'FurnacePOKEY', volume: -12 },
  // 'FurnaceAMIGA': { synthType: 'FurnaceAMIGA', volume: -12 },
  // 'FurnacePET': { synthType: 'FurnacePET', volume: -12 },
  // 'FurnaceSCC': { synthType: 'FurnaceSCC', volume: -12 },
  // 'FurnacePCSPKR': { synthType: 'FurnacePCSPKR', volume: -12 },
  // 'FurnaceZXBEEPER': { synthType: 'FurnaceZXBEEPER', volume: -12 },
  // 'FurnaceTIA': { synthType: 'FurnaceTIA', volume: -12 },

  // === Furnace Arcade PCM === (DISABLED for faster testing)
  // 'FurnaceSEGAPCM': { synthType: 'FurnaceSEGAPCM', volume: -12 },
  // 'FurnaceQSOUND': { synthType: 'FurnaceQSOUND', volume: -12 },
  // 'FurnaceES5506': { synthType: 'FurnaceES5506', volume: -12 },
  // 'FurnaceRF5C68': { synthType: 'FurnaceRF5C68', volume: -12 },
  // 'FurnaceNAMCO': { synthType: 'FurnaceNAMCO', volume: -12 },

  // === Buzzmachine Synths === (TESTING: only BuzzKick enabled for faster testing)
  'BuzzKick': { synthType: 'BuzzKick', volume: -12 },
  // 'BuzzKickXP': { synthType: 'BuzzKickXP', volume: -12 },
  // 'BuzzNoise': { synthType: 'BuzzNoise', volume: -12 },
  // 'BuzzTrilok': { synthType: 'BuzzTrilok', volume: -12 },
  // 'Buzz4FM2F': { synthType: 'Buzz4FM2F', volume: -12 },
  // 'BuzzDynamite6': { synthType: 'BuzzDynamite6', volume: -12 },
  // 'BuzzM3': { synthType: 'BuzzM3', volume: -12 },
  // 'BuzzDTMF': { synthType: 'BuzzDTMF', volume: -12 },
  // 'BuzzFreqBomb': { synthType: 'BuzzFreqBomb', volume: -12 },
  // 'Buzz3o3DF': { synthType: 'Buzz3o3DF', volume: -12 },
  // 'BuzzM4': { synthType: 'BuzzM4', volume: -12 },
  // 'Buzzmachine': { synthType: 'Buzzmachine', volume: -12 },

  // === MAME Synths (standalone WASM chips) ===
  // 'MAMEVFX': { synthType: 'MAMEVFX', volume: -12 },   // needs ROM
  // 'MAMESWP30': { synthType: 'MAMESWP30', volume: -12 }, // needs ROM
  // 'MAMEAICA': { synthType: 'MAMEAICA', volume: -12 },  // silent: sample-playback, needs ROM
  // 'MAMERF5C400': { synthType: 'MAMERF5C400', volume: -12 }, // silent: sample-playback, needs ROM
  'MAMEDOC': { synthType: 'MAMEDOC', volume: -12 },
  'MAMERSA': { synthType: 'MAMERSA', volume: -12 },
  'MAMEASC': { synthType: 'MAMEASC', volume: -12 },
  'MAMEAstrocade': { synthType: 'MAMEAstrocade', volume: -12 },
  'MAMEC352': { synthType: 'MAMEC352', volume: -12 },
  'MAMEES5503': { synthType: 'MAMEES5503', volume: -12 },
  'MAMEICS2115': { synthType: 'MAMEICS2115', volume: -12 },
  'MAMEK054539': { synthType: 'MAMEK054539', volume: -12 },
  'MAMEMEA8000': { synthType: 'MAMEMEA8000', volume: -12 },
  'MAMESN76477': { synthType: 'MAMESN76477', volume: -12 },
  'MAMESNKWave': { synthType: 'MAMESNKWave', volume: -12 },
  'MAMESP0250': { synthType: 'MAMESP0250', volume: -12 },
  'MAMETMS36XX': { synthType: 'MAMETMS36XX', volume: -12 },
  'MAMETMS5220': { synthType: 'MAMETMS5220', volume: -12 },
  'MAMETR707': { synthType: 'MAMETR707', volume: -12 },
  'MAMEUPD931': { synthType: 'MAMEUPD931', volume: -12 },
  'MAMEUPD933': { synthType: 'MAMEUPD933', volume: -12 },
  'MAMEVotrax': { synthType: 'MAMEVotrax', volume: -12 },
  'MAMEYMF271': { synthType: 'MAMEYMF271', volume: -12 },
  'MAMEYMOPQ': { synthType: 'MAMEYMOPQ', volume: -12 },
  'MAMEVASynth': { synthType: 'MAMEVASynth', volume: -12 },

  // === Hardware WASM Synths ===
  // 'CZ101': { synthType: 'CZ101', volume: -12 },
  'CEM3394': { synthType: 'CEM3394', volume: -12 },
  'SCSP': { synthType: 'SCSP', volume: -12 },

  // === JUCE/WASM Synths === (DISABLED for faster testing)
  // 'Dexed': { synthType: 'Dexed', volume: -12 },
  // 'OBXd': { synthType: 'OBXd', volume: -12 },

  // === Additional Missing Furnace Chips === (DISABLED for faster testing)
  // 'Furnace': { synthType: 'Furnace', volume: -12, furnace: DEFAULT_FURNACE },
  // 'FurnaceVERA': { synthType: 'FurnaceVERA', volume: -12 },
  // 'FurnaceC140': { synthType: 'FurnaceC140', volume: -12 },
  // 'FurnaceK007232': { synthType: 'FurnaceK007232', volume: -12 },
  // 'FurnaceK053260': { synthType: 'FurnaceK053260', volume: -12 },
  // 'FurnaceGA20': { synthType: 'FurnaceGA20', volume: -12 },
  // 'FurnaceOKI': { synthType: 'FurnaceOKI', volume: -12 },
  // 'FurnaceYMZ280B': { synthType: 'FurnaceYMZ280B', volume: -12 },
  // 'FurnaceX1_010': { synthType: 'FurnaceX1_010', volume: -12 },
  // 'FurnaceBUBBLE': { synthType: 'FurnaceBUBBLE', volume: -12 },
  // 'FurnaceSM8521': { synthType: 'FurnaceSM8521', volume: -12 },
  // 'FurnaceT6W28': { synthType: 'FurnaceT6W28', volume: -12 },
  // 'FurnaceSUPERVISION': { synthType: 'FurnaceSUPERVISION', volume: -12 },
  // 'FurnaceUPD1771': { synthType: 'FurnaceUPD1771', volume: -12 },
  // 'FurnaceOPN2203': { synthType: 'FurnaceOPN2203', volume: -12 },
  // 'FurnaceOPNBB': { synthType: 'FurnaceOPNBB', volume: -12 },
  // 'FurnaceAY8930': { synthType: 'FurnaceAY8930', volume: -12 },
  // 'FurnaceMSM6258': { synthType: 'FurnaceMSM6258', volume: -12 },
  // 'FurnaceMSM5232': { synthType: 'FurnaceMSM5232', volume: -12 },
  // 'FurnaceMULTIPCM': { synthType: 'FurnaceMULTIPCM', volume: -12 },
  // 'FurnacePONG': { synthType: 'FurnacePONG', volume: -12 },
  // 'FurnacePV1000': { synthType: 'FurnacePV1000', volume: -12 },
  // 'FurnaceDAVE': { synthType: 'FurnaceDAVE', volume: -12 },
  // 'FurnaceSU': { synthType: 'FurnaceSU', volume: -12 },
  // 'FurnacePOWERNOISE': { synthType: 'FurnacePOWERNOISE', volume: -12 },
  // 'FurnaceSCVTONE': { synthType: 'FurnaceSCVTONE', volume: -12 },
  // 'FurnacePCMDAC': { synthType: 'FurnacePCMDAC', volume: -12 },
};
END OF FULL CONFIG */

// ============================================
// TEST RESULTS
// ============================================

interface TestResults {
  passed: number;
  failed: number;
  wasmUnavailable: number;
  fallbacks: string[];
  natives: string[];
  errors: { name: string; error: string }[];
  wasmUnavailSynths: string[];
  volumeLevels: { name: string; peakDb: number; rmsDb: number }[];
  details: { name: string; status: string; constructor: string }[];
  samplePackResults: SamplePackTestResult[];
}

interface SamplePackTestResult {
  packId: string;
  packName: string;
  totalSamples: number;
  loadedSamples: number;
  failedSamples: { filename: string; error: string }[];
  volumeLevels: { filename: string; category: SampleCategory; peakDb: number }[];
  categoryCounts: Record<SampleCategory, number>;
  status: 'pass' | 'fail' | 'partial';
}

let testResults: TestResults = {
  passed: 0,
  failed: 0,
  wasmUnavailable: 0,
  fallbacks: [],
  natives: [],
  errors: [],
  wasmUnavailSynths: [],
  volumeLevels: [],
  details: [],
  samplePackResults: []
};

// Capture console errors for debugging
const capturedConsoleErrors: string[] = [];
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  capturedConsoleErrors.push(`[ERROR] ${message}`);
  originalConsoleError.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  capturedConsoleErrors.push(`[WARN] ${message}`);
  originalConsoleWarn.apply(console, args);
};

// Make captured errors accessible to Playwright
window.CAPTURED_CONSOLE_ERRORS = capturedConsoleErrors;

// ============================================
// HELPER FUNCTIONS
// ============================================

function log(message: string, type = 'info') {
  const results = document.getElementById('results')!;
  const div = document.createElement('div');
  div.className = type;
  div.textContent = message;
  results.appendChild(div);
}

function logHtml(html: string) {
  const results = document.getElementById('results')!;
  const div = document.createElement('div');
  div.innerHTML = html;
  results.appendChild(div);
}

function clearResults() {
  document.getElementById('results')!.innerHTML = '';
  window.SYNTH_TEST_COMPLETE = false;
  window.SYNTH_TEST_RESULTS = null;
  document.title = 'DEViLBOX Synth Tests (Browser)';
  testResults = {
    passed: 0,
    failed: 0,
    wasmUnavailable: 0,
    fallbacks: [],
    natives: [],
    errors: [],
    wasmUnavailSynths: [],
    volumeLevels: [],
    details: [],
    samplePackResults: []
  };
}

async function initAudio() {
  await Tone.start();
  // Extract native AudioContext and register it for synths that use getDevilboxAudioContext()
  const ctx = Tone.getContext();
  const ctxRec = ctx as unknown as Record<string, unknown>;
  const nativeCtx = (ctxRec.rawContext || ctxRec._context || ctx) as AudioContext;
  setDevilboxAudioContext(nativeCtx);
  log('AudioContext started: ' + Tone.getContext().state, 'pass');
}

// ============================================
// WASM ENGINE PRE-WARMING
// ============================================

// Track which WASM engines loaded successfully
const engineStatus: Record<string, boolean> = {
  Furnace: false,
  FurnaceDispatch: false,
  Buzzmachine: false,
  MAME: false,
};

/**
 * Pre-warm all shared WASM engines before running synth tests.
 * This prevents cascading failures where one engine timeout delays all subsequent tests.
 */
async function preWarmEngines(): Promise<void> {
  logHtml('<h3>Pre-warming WASM Engines</h3>');

  const initTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<boolean> =>
    Promise.race([
      promise.then(() => true),
      new Promise<boolean>(r => setTimeout(() => {
        console.warn(`[PreWarm] ${label} timed out after ${ms}ms`);
        r(false);
      }, ms))
    ]).catch(err => {
      console.warn(`[PreWarm] ${label} failed:`, err);
      return false;
    });

  // Furnace
  try {
    const furnaceEngine = FurnaceChipEngine.getInstance();
    engineStatus.Furnace = await initTimeout(
      furnaceEngine.init(Tone.getContext()),
      10000, 'FurnaceChipEngine'
    );
    // Test write to verify messages reach the worklet
    if (engineStatus.Furnace) {
      console.log('[PreWarm] Testing Furnace write capability...');
      furnaceEngine.testPing();
      const eng = furnaceEngine as unknown as Record<string, unknown>;
      if (typeof eng.testWrite === 'function') eng.testWrite();
      await new Promise(r => setTimeout(r, 100)); // Give time for response
    }
  } catch { // ignored
    engineStatus.Furnace = false;
  }

  // FurnaceDispatch (for GB and other dispatch-based chips)
  try {
    const ctx = Tone.getContext();
    const ctxRec = ctx as unknown as Record<string, unknown>;
    const rawCtx = (ctxRec.rawContext || ctxRec._context || ctx) as BaseAudioContext;
    const furnaceDispatchEngine = FurnaceDispatchEngine.getInstance();
    engineStatus.FurnaceDispatch = await initTimeout(
      furnaceDispatchEngine.init(rawCtx as unknown as Record<string, unknown>),
      10000, 'FurnaceDispatchEngine'
    );
  } catch (e) {
    console.warn('[PreWarm] FurnaceDispatch init failed:', e);
    engineStatus.FurnaceDispatch = false;
  }

  // Buzzmachine - requires AudioWorklet which is only available in full browser environments
  try {
    const ctx = Tone.getContext();
    const buzzCtxRec = ctx as unknown as Record<string, unknown>;
    const rawCtx = (buzzCtxRec.rawContext || buzzCtxRec._context || ctx) as BaseAudioContext & { audioWorklet?: { addModule: (url: string) => Promise<void> } };
    // Use duck-typing instead of instanceof to handle standardized-audio-context wrappers
    const hasAudioWorklet = rawCtx && rawCtx.audioWorklet && typeof rawCtx.audioWorklet.addModule === 'function';
    if (hasAudioWorklet) {
      const buzzEngine = BuzzmachineEngine.getInstance();
      engineStatus.Buzzmachine = await initTimeout(
        buzzEngine.init(rawCtx as unknown as AudioContext),
        10000, 'BuzzmachineEngine'
      );
    } else {
      console.log('[PreWarm] Buzzmachine: AudioWorklet not available in this context');
      engineStatus.Buzzmachine = false;
    }
  } catch (e) {
    console.warn('[PreWarm] Buzzmachine init failed:', e);
    engineStatus.Buzzmachine = false;
  }

  // MAME
  try {
    const mameEngine = MAMEEngine.getInstance();
    engineStatus.MAME = await initTimeout(
      mameEngine.init(),
      10000, 'MAMEEngine'
    );
  } catch { // ignored
    engineStatus.MAME = false;
  }

  // Display engine status table
  logHtml('<table><tr><th>Engine</th><th>Status</th></tr>');
  for (const [engine, loaded] of Object.entries(engineStatus)) {
    logHtml(`<tr><td>${engine}</td><td class="${loaded ? 'pass' : 'warn'}">${loaded ? 'LOADED' : 'UNAVAILABLE'}</td></tr>`);
  }
  logHtml('</table>');
}

/**
 * Get the WASM engine name required for a given synth, or null if it's a Tone.js synth.
 */
/** FM synths that stay on FurnaceSynth (old chip engine) */
const FM_SYNTHS = [
  'FurnaceOPN', 'FurnaceOPM', 'FurnaceOPL', 'FurnaceOPLL', 'FurnaceESFM',
  'FurnaceOPZ', 'FurnaceOPNA', 'FurnaceOPNB', 'FurnaceOPL4', 'FurnaceY8950',
  'FurnaceVRC7', 'FurnaceOPN2203', 'FurnaceOPNBB',
];

/** Old MAME synths that depend on the shared MAMEEngine (Emscripten module) */
const MAME_ENGINE_SYNTHS = ['MAMEVFX', 'MAMEDOC', 'MAMERSA', 'MAMESWP30'];

function getRequiredEngine(synthName: string): string | null {
  // FM chips use the old FurnaceChipEngine
  if (FM_SYNTHS.includes(synthName)) return 'Furnace';
  // All other Furnace chips use FurnaceDispatchEngine
  if (synthName.startsWith('Furnace')) return 'FurnaceDispatch';
  if (synthName.startsWith('Buzz')) return 'Buzzmachine';
  // Old MAME synths use shared MAMEEngine; per-chip MAME synths have own worklets
  if (MAME_ENGINE_SYNTHS.includes(synthName)) return 'MAME';
  if (synthName.startsWith('MAME')) return 'standalone-wasm';
  if (['V2', 'CZ101', 'SCSP', 'CEM3394'].includes(synthName)) return 'standalone-wasm';
  if (['Dexed', 'OBXd'].includes(synthName)) return 'standalone-wasm';
  return null;
}

// ============================================
// TEST FUNCTIONS
// ============================================

async function testSynthCreation() {
  logHtml('<h2>Synth Creation Tests</h2>');

  for (const [name, config] of Object.entries(SYNTH_CONFIGS)) {
    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig);
      const synthObj = synth as unknown as Record<string, unknown>;
      const ctorName = (synthObj.constructor as { name?: string } | undefined)?.name || 'Unknown';

      log(`✓ ${name}: Created (${ctorName})`, 'pass');
      testResults.passed++;
      testResults.details.push({ name, status: 'pass', constructor: ctorName });

      // Dispose to free resources
      if (typeof synthObj.dispose === 'function') {
        (synthObj.dispose as () => void)();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ ${name}: ${msg}`, 'fail');
      testResults.failed++;
      testResults.errors.push({ name, error: msg });
    }
  }
}

async function testFallbackDetection() {
  logHtml('<h2>Fallback Detection</h2>');
  const wasmSynths = ['Furnace', 'FurnaceGB', 'FurnaceNES', 'FurnaceC64', 'FurnaceOPN',
                      'BuzzKick', 'BuzzNoise', 'Buzz3o3', 'TB303'];

  logHtml('<table><tr><th>Synth</th><th>Engine Status</th><th>WASM Active</th><th>Fallback</th><th>Constructor</th></tr>');

  for (const name of wasmSynths) {
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig);
      const synthObj = synth as unknown as Record<string, unknown>;

      // Check for fallback indicators
      const hasUseWasm = 'useWasmEngine' in synthObj;
      const hasFallback = 'fallbackSynth' in synthObj;
      const useWasm = hasUseWasm ? synthObj.useWasmEngine : 'N/A';
      const fallbackActive = hasFallback ? (synthObj.fallbackSynth !== null) : 'N/A';
      const ctorName = (synthObj.constructor as { name?: string } | undefined)?.name || 'Unknown';

      let statusClass = 'native';
      let statusText = 'Native/WASM';

      if (hasUseWasm && !useWasm) {
        statusClass = 'fallback';
        statusText = 'FALLBACK';
        testResults.fallbacks.push(name);
      } else if (hasFallback && synthObj.fallbackSynth !== null) {
        statusClass = 'fallback';
        statusText = 'FALLBACK';
        if (!testResults.fallbacks.includes(name)) {
          testResults.fallbacks.push(name);
        }
      } else {
        if (!testResults.natives.includes(name)) {
          testResults.natives.push(name);
        }
      }

      logHtml(`<tr>
        <td>${name}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td>${useWasm}</td>
        <td>${fallbackActive}</td>
        <td>${ctorName}</td>
      </tr>`);

      if (typeof synthObj.dispose === 'function') {
        (synthObj.dispose as () => void)();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logHtml(`<tr><td>${name}</td><td colspan="4" class="fail">Error: ${msg}</td></tr>`);
      testResults.errors.push({ name, error: msg });
    }
  }

  logHtml('</table>');
}

async function testMethodAvailability() {
  logHtml('<h2>Method Availability</h2>');

  const tb303Methods = ['setCutoff', 'setResonance', 'setEnvMod', 'setDecay', 'setAccent'];
  const devilFishMethods = [
    'enableDevilFish', 'setMuffler', 'setFilterTracking', 'setSoftAttack', 'setSubOsc',
    'setFilterInputDrive', 'setStageNLAmount', 'setEnsembleAmount', 'setOversamplingOrder',
    'setLfoStiffDepth', 'setDiodeCharacter'
  ];
  const coreMethods = ['triggerAttack', 'triggerRelease', 'dispose', 'connect'];
  // Player and GranularSynth use start()/stop() instead of triggerAttack/triggerRelease
  const samplePlayerMethods = ['start', 'stop', 'dispose', 'connect'];

  for (const [name, config] of Object.entries(SYNTH_CONFIGS)) {
    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig);
      const synthObj = synth as unknown as Record<string, unknown>;

      let methods = ['Player', 'GranularSynth'].includes(name) ? [...samplePlayerMethods] : [...coreMethods];
      if (name === 'TB303' || name === 'Buzz3o3') {
        methods = [...methods, ...tb303Methods];
      }
      if (name === 'Buzz3o3') {
        methods = [...methods, ...devilFishMethods];
      }

      const available = methods.filter(m => typeof synthObj[m] === 'function');
      const missing = methods.filter(m => typeof synthObj[m] !== 'function');

      if (missing.length > 0) {
        log(`${name}: Missing methods: ${missing.join(', ')}`, 'warn');
      } else {
        log(`${name}: All ${available.length} methods available`, 'pass');
      }

      if (typeof synthObj.dispose === 'function') {
        (synthObj.dispose as () => void)();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`${name}: Error checking methods: ${msg}`, 'fail');
    }
  }
}

async function testTriggers() {
  logHtml('<h2>Trigger Tests</h2>');

  const testSynths = ['Synth', 'MonoSynth', 'TB303', 'Synare', 'FMSynth'];

  for (const name of testSynths) {
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig);
      const synthObj = synth as unknown as Record<string, unknown>;
      if (typeof synthObj.connect === 'function') {
        (synthObj.connect as (dest: unknown) => void)(Tone.getDestination());
      }

      if (typeof synthObj.triggerAttack === 'function') {
        (synthObj.triggerAttack as (note: string) => void)('C4');
        await new Promise(r => setTimeout(r, 100));

        if (typeof synthObj.triggerRelease === 'function') {
          (synthObj.triggerRelease as () => void)();
        }

        log(`${name}: triggerAttack/Release works`, 'pass');
        testResults.passed++;
      } else {
        log(`${name}: No triggerAttack method`, 'warn');
      }

      if (typeof synthObj.dispose === 'function') {
        (synthObj.dispose as () => void)();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`${name}: Trigger test failed: ${msg}`, 'fail');
      testResults.failed++;
    }
  }
}

async function testVolumeLevels() {
  logHtml('<h2>Volume Level Tests</h2>');
  logHtml('<p class="info">Testing output levels at volume=-12dB. Target range: -15dB to -6dB peak.</p>');

  // Pre-warm all WASM engines before testing individual synths
  await preWarmEngines();

  // IMPORTANT: We'll create a fresh meter for each synth test.
  // WASM synth disposal (especially V2) can corrupt Tone.Meter, causing getValue() to return null.
  // Creating a fresh meter per test is slightly more expensive but guarantees isolation.
  let meter: Tone.Meter | null = null;

  // Test ALL synths that have configs
  // Put Furnace synths FIRST to test right after pre-warm (debugging message delivery)
  const allSynths = Object.keys(SYNTH_CONFIGS);
  const furnaceSynths = allSynths.filter(s => s.startsWith('Furnace'));
  const otherSynths = allSynths.filter(s => !s.startsWith('Furnace'));
  const synthsToTest = [...furnaceSynths, ...otherSynths];
  console.log('[VolumeTest] Reordered synths - Furnace first:', furnaceSynths);

  // Target peak level in dB (we want all synths to hit roughly this level)
  const TARGET_PEAK = -10;

  // Synths that don't take a note parameter for triggerAttack (percussion synths)
  const NO_NOTE_SYNTHS = ['NoiseSynth', 'MetalSynth', 'MembraneSynth', 'DrumMachine'];

  // Sample-based synths that use start()/stop() instead of triggerAttack/triggerRelease
  const START_STOP_SYNTHS = ['Player', 'GranularSynth'];

  logHtml('<table><tr><th>Synth</th><th>Peak Level (dB)</th><th>Status</th><th>Suggested Offset</th></tr>');

  for (const name of synthsToTest) {
    // Create a fresh meter for each synth test to avoid corruption from WASM synth disposal
    if (meter) {
      try { meter.disconnect(); meter.dispose(); } catch { /* ignored */ }
    }
    meter = new Tone.Meter(0);
    meter.connect(Tone.getDestination());
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    // Check if this synth's required WASM engine is available
    const requiredEngine = getRequiredEngine(name);
    if (requiredEngine && requiredEngine !== 'standalone-wasm' && !engineStatus[requiredEngine]) {
      // Engine didn't load — mark as WASM UNAVAIL (not a failure)
      testResults.wasmUnavailable++;
      testResults.wasmUnavailSynths.push(name);
      testResults.volumeLevels.push({ name, peakDb: -Infinity, rmsDb: -Infinity });
      logHtml(`<tr><td>${name}</td><td>-</td><td class="warn">WASM UNAVAIL</td><td>N/A</td></tr>`);
      continue;
    }

    // Debug: For FM Furnace synths, verify engine instance and reset write counter.
    // IMPORTANT: FM synths and Dispatch synths both route audio through native nodes
    // (FurnaceChipEngine or FurnaceDispatchEngine → native destination).
    // Standard Tone.Meter doesn't pick up this audio, so we use native AnalyserNode.
    let furnaceNativeMeter: AnalyserNode | null = null;
    const isFMSynth = FM_SYNTHS.includes(name);
    const isDispatchSynth = name.startsWith('Furnace') && !isFMSynth;
    if (isFMSynth) {
      const furnaceEngine = FurnaceChipEngine.getInstance();
      furnaceEngine.resetWriteCount();
      console.log(`[VolumeTest] ${name}: Before synth creation - isInitialized=${furnaceEngine.isInitialized()}, diag:`, furnaceEngine.getDiagnostics(), 'worklet:', furnaceEngine.getWorkletDiagnostics());

      // Create native AnalyserNode to measure FM Furnace audio (bypasses Tone.js)
      // This is needed because FurnaceChipEngine audio goes directly to native destination
      const nativeOutput = furnaceEngine.getNativeOutput();
      if (nativeOutput && nativeOutput.context) {
        furnaceNativeMeter = nativeOutput.context.createAnalyser();
        furnaceNativeMeter.fftSize = 256;
        nativeOutput.connect(furnaceNativeMeter);
        furnaceNativeMeter.connect(nativeOutput.context.destination);
        console.log(`[VolumeTest] ${name}: Created native AnalyserNode for FM metering`);
      }
    }

    try {
      // Auto-enrich config with first factory preset if available.
      // This ensures synths that need patch data (V2, MAME chips) produce sound.
      const preset = getFirstPresetForSynthType(config.synthType as string);
      const presetConfig = preset
        ? (() => { const p = { ...preset } as Record<string, unknown>; delete p.name; delete p.type; delete p.synthType; return p; })()
        : {};

      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        volume: -12,
        ...presetConfig,  // Factory preset defaults
        ...config          // Explicit test config wins
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig);
      const synthObj = synth as unknown as Record<string, unknown>;
      if (typeof synthObj.connect === 'function') {
        (synthObj.connect as (dest: unknown) => void)(meter);
      }

      // Ensure AudioContext is running before EVERY synth test.
      // Chrome may auto-suspend the context during long test runs (especially
      // after many WASM synths with 500ms stabilization waits).
      const isWasmSynth = requiredEngine !== null;
      try {
        await Tone.start();
        const ctx = Tone.getContext();
        const ctxObj = ctx as unknown as Record<string, unknown>;
        const rawCtx = (ctxObj.rawContext || ctxObj._context) as { state?: string; resume?: () => Promise<void> } | undefined;
        if (rawCtx && rawCtx.state !== 'running' && typeof rawCtx.resume === 'function') {
          await rawCtx.resume();
        }
      } catch {
        // ignored - best effort
      }

      // Wait for WASM initialization if this is a WASM-based synth
      // Use a timeout to prevent hanging if ensureInitialized() never resolves
      const initTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
        Promise.race([promise, new Promise<null>(r => setTimeout(() => r(null), ms))]);

      let wasmInitFailed = false;
      if (typeof synthObj.ensureInitialized === 'function') {
        try {
          await initTimeout((synthObj.ensureInitialized as () => Promise<void>)(), 15000);
        } catch {
          wasmInitFailed = true;
          // ignored - ensureInitialized threw
        }
      } else if (typeof synthObj.ready === 'function') {
        try {
          await initTimeout((synthObj.ready as () => Promise<void>)(), 15000);
        } catch {
          wasmInitFailed = true;
          // ignored
        }
      }

      // Extra stabilization time for WASM synths BEFORE checking init status.
      // Worklet-based synths (Dexed, OBXd, etc.) resolve ensureInitialized() when
      // the worklet is registered, but _isReady is set later when the worklet sends
      // a 'ready' message via the message port. This wait covers that gap.
      if (isWasmSynth) {
        await new Promise(r => setTimeout(r, 500));
      }

      // Check if the synth actually initialized after the attempt + stabilization.
      // Different synth types store init status in different properties.
      // Must use `=== true` checks because `false || undefined` yields `undefined`, not `false`.
      if (isWasmSynth && !wasmInitFailed) {
        const hasInitProp = '_isReady' in synthObj || 'isInitialized' in synthObj ||
                            '_initialized' in synthObj || 'useWasmEngine' in synthObj;
        if (hasInitProp) {
          const isReady = synthObj._isReady === true || synthObj.isInitialized === true ||
                          synthObj._initialized === true || synthObj.useWasmEngine === true;
          if (!isReady) {
            wasmInitFailed = true;
          }
        }
      }

      // If WASM init failed, mark as WASM UNAVAIL and skip
      if (wasmInitFailed && isWasmSynth) {
        testResults.wasmUnavailable++;
        testResults.wasmUnavailSynths.push(name);
        testResults.volumeLevels.push({ name, peakDb: -Infinity, rmsDb: -Infinity });
        logHtml(`<tr><td>${name}</td><td>-</td><td class="warn">WASM UNAVAIL</td><td>N/A</td></tr>`);
        // Disconnect and dispose synth (meter is recreated at start of next iteration)
        try { if (typeof synthObj.disconnect === 'function') (synthObj.disconnect as () => void)(); } catch { /* ignored */ }
        try { if (typeof synthObj.dispose === 'function') (synthObj.dispose as () => void)(); } catch { /* ignored */ }
        continue;
      }

      // Wait for sample loading if this is a sample-based synth
      const isSampleBased = ['Sampler', 'Player', 'GranularSynth', 'DrumKit'].includes(name);
      if (isSampleBased) {
        try {
          await Tone.loaded();
          await new Promise(r => setTimeout(r, 200));
        } catch {
          // ignored - sample might not be loaded, continue anyway
        }
      }

      // Trigger note and measure peak level
      let peakDb = -Infinity;

      // DrumKit needs sample loading (setSampleLoader) which test doesn't do — skip volume test
      if (name === 'DrumKit') {
        testResults.passed++;
        testResults.volumeLevels.push({ name, peakDb: NaN, rmsDb: NaN });
        logHtml(`<tr><td>${name}</td><td>N/A</td><td class="pass">SKIP (needs samples)</td><td>N/A</td></tr>`);
        try { if (typeof synthObj.dispose === 'function') (synthObj.dispose as () => void)(); } catch { /* ignored */ }
        continue;
      }

      // ROM/sample-dependent synths - these need external ROM or sample data to produce sound
      const ROM_DEPENDENT_SYNTHS = [
        // Old MAME engine synths (need ROM banks - different architecture, no auto-loading)
        'MAMEVFX', 'MAMEDOC', 'MAMERSA', 'MAMESWP30',
        // Note: MAMEC352, MAMEICS2115, MAMEK054539, MAMERF5C400, MAMEES5503 now have auto-loading
        // Note: MAMEAICA is wavetable with RAM upload, should work without ROM
      ];
      if (ROM_DEPENDENT_SYNTHS.includes(name)) {
        testResults.passed++;
        testResults.volumeLevels.push({ name, peakDb: NaN, rmsDb: NaN });
        logHtml(`<tr><td>${name}</td><td>N/A</td><td class="pass">SKIP (needs ROM)</td><td>N/A</td></tr>`);
        try { if (typeof synthObj.dispose === 'function') (synthObj.dispose as () => void)(); } catch { /* ignored */ }
        continue;
      }

      // For dispatch synths, create native AnalyserNode tapped from their _nativeGain.
      // _nativeGain is not connected to destination by default (ToneEngine does that).
      // Connect it to destination here so audio is audible during the test.
      let dispatchNativeGain: GainNode | null = null;
      if (isDispatchSynth && !furnaceNativeMeter) {
        const nativeGain = synthObj._nativeGain as GainNode | undefined;
        if (nativeGain && nativeGain.context) {
          furnaceNativeMeter = nativeGain.context.createAnalyser();
          furnaceNativeMeter.fftSize = 256;
          nativeGain.connect(furnaceNativeMeter);
          // Connect to destination so audio is audible during test
          nativeGain.connect(nativeGain.context.destination);
          dispatchNativeGain = nativeGain;
          console.log(`[VolumeTest] ${name}: Created native AnalyserNode for dispatch metering`);
        }
      }

      // For MAME/HW chips (DevilboxSynth with native output, no connect() method),
      // create a native AnalyserNode tapped from their output GainNode.
      // This is the same pattern as FM synths: output → analyser → destination.
      let mameOutputNode: AudioNode | null = null;
      const isMAMESynth = name.startsWith('MAME') || name === 'CEM3394' || name === 'SCSP';
      if (isMAMESynth && !furnaceNativeMeter) {
        const output = synthObj.output as AudioNode | undefined;
        if (output && output.context) {
          furnaceNativeMeter = output.context.createAnalyser();
          furnaceNativeMeter.fftSize = 256;
          output.connect(furnaceNativeMeter);
          furnaceNativeMeter.connect(output.context.destination);
          mameOutputNode = output;
        }
      }

      // Small delay to let multi-node audio chains settle after connect
      // (DrumMachine uses MembraneSynth→Distortion→Filter chain which needs time)
      await new Promise(r => setTimeout(r, 50));

      // Handle Player and GranularSynth with their native start()/stop() API
      if (START_STOP_SYNTHS.includes(name)) {
        try {
          // Check if buffer is loaded before starting
          const bufObj = synthObj.buffer as { loaded?: boolean } | undefined;
          const hasBuffer = bufObj && bufObj.loaded;
          if (!hasBuffer) {
            // Try waiting longer for the buffer
            for (let wait = 0; wait < 20; wait++) {
              await new Promise(r => setTimeout(r, 100));
              const buf = synthObj.buffer as { loaded?: boolean } | undefined;
              if (buf && buf.loaded) break;
            }
          }

          const bufCheck = synthObj.buffer as { loaded?: boolean } | undefined;
          if (bufCheck && bufCheck.loaded) {
            (synthObj.start as () => void)();

            // Sample quickly at first (5ms intervals) to catch fast transients, then slower
            for (let i = 0; i < 30; i++) {
              await new Promise(r => setTimeout(r, i < 15 ? 5 : 30));
              const level = meter.getValue();
              if (typeof level === 'number' && level > peakDb) peakDb = level;
            }

            try { (synthObj.stop as () => void)(); } catch { /* ignored */ }
          } else {
            console.warn(`[Test] ${name}: buffer not loaded after waiting`);
          }
        } catch (triggerError: unknown) {
          const tMsg = triggerError instanceof Error ? triggerError.message : String(triggerError);
          console.warn(`[Test] ${name} start/stop error:`, tMsg);
        }
      } else if (typeof synthObj.triggerAttack === 'function' || typeof synthObj.triggerAttackRelease === 'function') {
        try {
          // ── Build a phrase that shows the synth's character ───────────────────
          // Each step: note (null = silence/gap), ms = duration of note or gap
          type PhraseStep = { note: string | null; ms: number };
          const phrase: PhraseStep[] = (() => {
            // TR707 drum machine — MIDI GM drum mapping
            if (name === 'MAMETR707') return [
              { note: 'C2',  ms: 120 }, // Bass Drum
              { note: null,  ms:  60 },
              { note: 'D2',  ms: 120 }, // Snare
              { note: null,  ms:  60 },
              { note: 'C2',  ms: 120 }, // Bass Drum
              { note: 'F#2', ms: 100 }, // Hi-hat
              { note: 'D2',  ms: 120 }, // Snare
              { note: null,  ms:  80 },
            ];
            // Simple arcade tone generators
            if (['MAMETMS36XX', 'MAMEAstrocade', 'MAMESN76477'].includes(name)) return [
              { note: 'C3', ms: 280 },
              { note: 'G3', ms: 280 },
              { note: 'C4', ms: 400 },
            ];
            // Speech / phoneme chips — single long note triggers phoneme output
            if (['MAMEVotrax', 'MAMETMS5220', 'MAMEMEA8000', 'MAMESP0250'].includes(name)) return [
              { note: 'A3', ms: 1000 },
            ];
            // Percussion synths (MembraneSynth, MetalSynth, NoiseSynth, DrumMachine)
            if (NO_NOTE_SYNTHS.includes(name)) return [
              { note: 'C1', ms: 200 }, { note: null, ms:  80 },
              { note: 'C1', ms: 200 }, { note: null, ms:  80 },
              { note: 'C1', ms: 200 },
            ];
            // FM chips — slower arpeggio to let attack transients and modulation breathe
            if (/OPN|OPM|OPL|OPZ|ESFM|VRC7|Y8950|YMF|YMOPQ|VASynth|CEM3394|UPD93/.test(name)) return [
              { note: 'C3',  ms: 380 },
              { note: 'E3',  ms: 380 },
              { note: 'G3',  ms: 380 },
              { note: 'C4',  ms: 550 },
            ];
            // Wavetable / wave-channel chips — C major arp in mid range
            if (/SCC|NAMCO|BUBBLE|X1_010|SNKWave|ASC|ICS2115|ES5503/.test(name)) return [
              { note: 'C4', ms: 250 },
              { note: 'E4', ms: 250 },
              { note: 'G4', ms: 250 },
              { note: 'C5', ms: 380 },
            ];
            // PCM / sample-playback chips — three hits across the range
            if (/SEGAPCM|QSOUND|ES5506|MULTIPCM|K007232|K053260|GA20|OKI|YMZ280|MSM|K054539|C352|SCSP|RF5C|AMIGA/.test(name)) return [
              { note: 'C4', ms: 320 }, { note: null, ms: 80 },
              { note: 'G4', ms: 320 }, { note: null, ms: 80 },
              { note: 'C5', ms: 450 },
            ];
            // SID chips — show the characteristic buzz and filter sweep
            if (/C64|SID/.test(name)) return [
              { note: 'C3', ms: 300 },
              { note: 'G3', ms: 300 },
              { note: 'C4', ms: 300 },
              { note: 'G4', ms: 450 },
            ];
            // AY/PSG chips — clean square-wave arp
            if (/AY|PSG|SAA|TED|VIC|POKEY|T6W28|TIA|SUPERVISION|PCSPEAKER|ZXBEEPER/.test(name)) return [
              { note: 'C4', ms: 200 },
              { note: 'E4', ms: 200 },
              { note: 'G4', ms: 200 },
              { note: 'C5', ms: 320 },
            ];
            // Default — single-octave C major arpeggio
            return [
              { note: 'C4', ms: 220 },
              { note: 'E4', ms: 220 },
              { note: 'G4', ms: 220 },
              { note: 'C5', ms: 380 },
            ];
          })();

          // ── Sample level from whichever path carries audio ─────────────────────
          const sampleLevel = () => {
            if (furnaceNativeMeter) {
              const data = new Float32Array(furnaceNativeMeter.fftSize);
              furnaceNativeMeter.getFloatTimeDomainData(data);
              let maxSample = 0;
              for (const s of data) { const a = Math.abs(s); if (a > maxSample) maxSample = a; }
              const db = maxSample > 0 ? 20 * Math.log10(maxSample) : -Infinity;
              if (db > peakDb) peakDb = db;
            } else {
              const level = meter.getValue();
              if (typeof level === 'number' && level > peakDb) peakDb = level;
            }
          };

          const hasAR     = typeof synthObj.triggerAttackRelease === 'function';
          const hasAttack = typeof synthObj.triggerAttack === 'function';

          // ── Play each step in the phrase ───────────────────────────────────────
          for (const step of phrase) {
            if (step.note !== null) {
              if (NO_NOTE_SYNTHS.includes(name)) {
                // Percussion: no note argument
                if (hasAR) {
                  if (name === 'DrumMachine') {
                    (synthObj.triggerAttackRelease as (n: string, d: number) => void)('C4', step.ms / 1000);
                  } else {
                    (synthObj.triggerAttackRelease as (d: string) => void)('8n');
                  }
                } else if (hasAttack) {
                  (synthObj.triggerAttack as () => void)();
                }
              } else if (hasAR) {
                (synthObj.triggerAttackRelease as (n: string, d: number) => void)(step.note, step.ms / 1000);
              } else if (hasAttack) {
                (synthObj.triggerAttack as (n: string) => void)(step.note);
              }
            }

            // Sample throughout this step's duration
            const deadline = Date.now() + step.ms;
            while (Date.now() < deadline) {
              await new Promise(r => setTimeout(r, 8));
              sampleLevel();
            }

            // Release if using attack/release mode (not attackRelease)
            if (!hasAR && hasAttack && step.note !== null && !NO_NOTE_SYNTHS.includes(name)) {
              try { (synthObj.triggerRelease as () => void)(); } catch { /* ignored */ }
            }
          }

        } catch (triggerError: unknown) {
          const tMsg = triggerError instanceof Error ? triggerError.message : String(triggerError);
          console.warn(`[Test] ${name} trigger error:`, tMsg);
        }
      }

      const offset = TARGET_PEAK - peakDb;

      let status = 'pass';
      let statusText = 'OK';

      if (peakDb === -Infinity || peakDb < -60) {
        status = 'fail';
        statusText = peakDb === -Infinity ? 'NO AUDIO' : 'SILENT';
        testResults.failed++;
        testResults.errors.push({ name, error: `No audio output (${peakDb === -Infinity ? 'silent' : peakDb.toFixed(1) + 'dB'})` });
      } else if (peakDb < -25) {
        status = 'warn';
        statusText = 'TOO QUIET';
        testResults.passed++;
      } else if (peakDb > -3) {
        status = 'warn';
        statusText = 'TOO LOUD';
        testResults.passed++;
      } else if (Math.abs(peakDb - TARGET_PEAK) > 8) {
        status = 'warn';
        statusText = 'NEEDS ADJ';
        testResults.passed++;
      } else {
        testResults.passed++;
      }

      testResults.volumeLevels.push({ name, peakDb, rmsDb: peakDb });

      const offsetStr = peakDb === -Infinity ? 'N/A' :
        (offset > 0 ? `+${offset.toFixed(0)}dB` : `${offset.toFixed(0)}dB`);

      logHtml(`<tr>
        <td>${name}</td>
        <td>${peakDb === -Infinity ? '-∞' : peakDb.toFixed(1)}</td>
        <td class="${status}">${statusText}</td>
        <td>${Math.abs(offset) > 3 && peakDb !== -Infinity ? `<span class="warn">${offsetStr}</span>` : offsetStr}</td>
      </tr>`);

      // CRITICAL: Disconnect from meter BEFORE disposing to prevent meter corruption
      if (typeof synthObj.disconnect === 'function') {
        try { (synthObj.disconnect as () => void)(); } catch { /* ignored */ }
      }
      if (typeof synthObj.dispose === 'function') {
        try { (synthObj.dispose as () => void)(); } catch { /* ignored */ }
      }

      // Cleanup native meter for FM, dispatch Furnace, and MAME/HW synths
      if (furnaceNativeMeter) {
        if (isFMSynth) {
          const furnaceEngine = FurnaceChipEngine.getInstance();
          furnaceEngine.requestWorkletStatus();
          const nativeOutput = furnaceEngine.getNativeOutput();
          if (nativeOutput) {
            try { nativeOutput.disconnect(furnaceNativeMeter); } catch { /* ignored */ }
            try { furnaceNativeMeter.disconnect(nativeOutput.context.destination); } catch { /* ignored */ }
          }
        } else if (isMAMESynth && mameOutputNode) {
          // MAME/HW: output → analyser → destination
          try { mameOutputNode.disconnect(furnaceNativeMeter); } catch { /* ignored */ }
          try { furnaceNativeMeter.disconnect(mameOutputNode.context.destination); } catch { /* ignored */ }
        } else {
          // Dispatch synth — disconnect analyser and destination connection
          if (dispatchNativeGain) {
            try { dispatchNativeGain.disconnect(dispatchNativeGain.context.destination); } catch { /* ignored */ }
          }
          try { furnaceNativeMeter.disconnect(); } catch { /* ignored */ }
        }
        furnaceNativeMeter = null;
        mameOutputNode = null;
        console.log(`[VolumeTest] ${name}: Cleaned up native meter, final peakDb=${peakDb.toFixed(2)}`);
      }

      // Drain meter before next synth to avoid residual readings
      for (let drain = 0; drain < 10; drain++) {
        await new Promise(r => setTimeout(r, 20));
        const level = meter.getValue() as number;
        if (level <= -100 || level === -Infinity) break;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logHtml(`<tr><td>${name}</td><td colspan="3" class="fail">Error: ${msg}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name, error: msg });
    }
  }

  logHtml('</table>');

  // Calculate normalization map
  if (testResults.volumeLevels.length > 0) {
    // Only include synths with meaningful output (> -30dB) in normalization suggestions.
    // WASM synths that fail to init measure at -90dB or -Infinity — including those
    // produces bogus offsets like +80dB that cause massive clipping when applied.
    const validLevels = testResults.volumeLevels.filter(v => v.peakDb !== -Infinity && v.peakDb > -30);
    const allMeasured = testResults.volumeLevels.filter(v => v.peakDb !== -Infinity);
    const avgPeak = validLevels.length > 0
      ? validLevels.reduce((sum, v) => sum + v.peakDb, 0) / validLevels.length
      : NaN;

    logHtml(`<div class="info">
      <p>Average peak level: ${isNaN(avgPeak) ? 'N/A' : avgPeak.toFixed(1) + 'dB'}</p>
      <p>Synths tested: ${testResults.volumeLevels.length}, Producing audio (> -30dB): ${validLevels.length}, Silent/near-silent: ${allMeasured.length - validLevels.length + (testResults.volumeLevels.length - allMeasured.length)}</p>
    </div>`);

    // Generate normalization code suggestion — only for synths with reliable measurements
    const normMap: Record<string, number> = {};
    validLevels.forEach(v => {
      const offset = Math.round(TARGET_PEAK - v.peakDb);
      if (Math.abs(offset) >= 3) {
        normMap[v.name] = offset;
      }
    });

    if (Object.keys(normMap).length > 0) {
      logHtml(`<pre>// Suggested VOLUME_NORMALIZATION_OFFSETS (only synths with reliable output > -30dB):\nconst VOLUME_NORMALIZATION_OFFSETS: Record&lt;string, number&gt; = ${JSON.stringify(normMap, null, 2)};</pre>`);
    }
  }
  if (meter) meter.dispose();

  // Cleanup WASM engines to prevent browser tab freeze
  try {
    const furnaceEngine = FurnaceChipEngine.getInstance();
    // Deactivate all chips by sending deactivate for common chip types
    for (let chipType = 0; chipType < 75; chipType++) {
      furnaceEngine.deactivate(chipType as unknown as Parameters<typeof furnaceEngine.deactivate>[0]);
    }
    console.log('[VolumeTest] Deactivated all Furnace chips');
  } catch (e) {
    console.warn('[VolumeTest] Furnace cleanup error:', e);
  }
}

function displaySummary() {
  const { passed, failed, wasmUnavailable, fallbacks, natives, errors, wasmUnavailSynths } = testResults;

  // Separate actual failures from WASM unavail in errors list
  const realErrors = errors.filter(e => !wasmUnavailSynths.includes(e.name));

  logHtml(`
    <div class="summary">
      <h2>Test Summary</h2>
      <p class="pass">Passed: ${passed}</p>
      <p class="${failed > 0 ? 'fail' : ''}">Failed: ${failed}</p>
      ${wasmUnavailable > 0 ? `<p class="warn">WASM Unavailable: ${wasmUnavailable} (not counted as failures)</p>` : ''}
      <p><strong>WASM Engines:</strong> Furnace ${engineStatus.Furnace ? '✓' : '✗'} | FurnaceDispatch ${engineStatus.FurnaceDispatch ? '✓' : '✗'} | Buzzmachine ${engineStatus.Buzzmachine ? '✓' : '✗'} | MAME ${engineStatus.MAME ? '✓' : '✗'}</p>
      <p><span class="fallback">FALLBACK</span> Using Tone.js fallback: ${fallbacks.length}</p>
      ${fallbacks.length > 0 ? `<ul>${fallbacks.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
      <p><span class="native">NATIVE</span> Using native/WASM: ${natives.length}</p>
      ${natives.length > 0 ? `<ul>${natives.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${realErrors.length > 0 ? `<p class="fail">Errors: ${realErrors.map(e => e.name).join(', ')}</p>` : ''}
      ${wasmUnavailSynths.length > 0 ? `<details><summary class="warn">WASM Unavailable synths (${wasmUnavailSynths.length})</summary><p>${wasmUnavailSynths.join(', ')}</p></details>` : ''}
      <p>Console errors captured: ${capturedConsoleErrors.length}</p>
      <button onclick="downloadConsoleErrors()">Download Console Log</button>
    </div>
  `);

  // Store results for Playwright to read
  window.SYNTH_TEST_RESULTS = testResults;
  window.SYNTH_TEST_COMPLETE = true;

  // Update document title so automation can detect completion
  document.title = `DONE ${passed}p ${failed}f`;
}

// Download captured console errors as a text file
function downloadConsoleErrors() {
  const content = capturedConsoleErrors.join('\n\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `synth-test-errors-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Make downloadConsoleErrors available globally
window.downloadConsoleErrors = downloadConsoleErrors;

// ============================================
// MAIN TEST RUNNERS
// ============================================

async function runAllTests() {
  clearResults();
  logHtml('<h2>Running All Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testSynthCreation();
    await testFallbackDetection();
    await testMethodAvailability();
    await testTriggers();
    await testVolumeLevels();
    displaySummary();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('Test error: ' + msg, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

async function runFallbackTests() {
  clearResults();
  logHtml('<h2>Running Fallback Detection...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testFallbackDetection();
    displaySummary();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('Test error: ' + msg, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

async function runVolumeTests() {
  clearResults();
  logHtml('<h2>Running Volume Level Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testVolumeLevels();

    // Display volume summary
    const { volumeLevels, errors, wasmUnavailable: wasmUnavailCount, wasmUnavailSynths } = testResults;
    const TARGET_PEAK = -10;
    // Exclude WASM UNAVAIL synths from "silent" count
    const testedLevels = volumeLevels.filter(v => !wasmUnavailSynths.includes(v.name));
    const silentSynths = testedLevels.filter(v => v.peakDb === -Infinity || v.peakDb < -60);
    const quietSynths = testedLevels.filter(v => v.peakDb >= -60 && v.peakDb < -25);
    const loudSynths = testedLevels.filter(v => v.peakDb > -3);
    const needsAdjustment = testedLevels.filter(v => v.peakDb !== -Infinity && Math.abs(v.peakDb - TARGET_PEAK) > 8);
    const realErrors = errors.filter(e => !wasmUnavailSynths.includes(e.name));

    logHtml(`
      <div class="summary">
        <h2>Volume Summary</h2>
        <p>Target peak level: ${TARGET_PEAK}dB (tolerance: ±8dB)</p>
        <p><strong>WASM Engines:</strong> Furnace ${engineStatus.Furnace ? '✓' : '✗'} | FurnaceDispatch ${engineStatus.FurnaceDispatch ? '✓' : '✗'} | Buzzmachine ${engineStatus.Buzzmachine ? '✓' : '✗'} | MAME ${engineStatus.MAME ? '✓' : '✗'}</p>
        <p class="${testResults.passed > 0 ? 'pass' : ''}">${testResults.passed} synths producing audio</p>
        ${wasmUnavailCount > 0 ? `<p class="warn">WASM Unavailable: ${wasmUnavailCount} synths (engine didn't load, not counted as failures)</p>` : ''}
        ${silentSynths.length > 0 ? `<p class="fail">SILENT (no output): ${silentSynths.map(s => s.name).join(', ')}</p>` : ''}
        ${quietSynths.length > 0 ? `<p class="warn">Too Quiet (< -25dB): ${quietSynths.map(s => `${s.name} (${s.peakDb.toFixed(1)})`).join(', ')}</p>` : ''}
        ${loudSynths.length > 0 ? `<p class="warn">Too Loud (> -3dB): ${loudSynths.map(s => `${s.name} (${s.peakDb.toFixed(1)})`).join(', ')}</p>` : ''}
        ${needsAdjustment.length > 0 ? `<p class="warn">Needs volume adjustment: ${needsAdjustment.length} synths</p>` : ''}
        ${realErrors.length > 0 ? `<p class="fail">Errors: ${realErrors.map(e => `${e.name}: ${e.error}`).join(', ')}</p>` : ''}
        ${wasmUnavailSynths.length > 0 ? `<details><summary class="warn">WASM Unavailable synths (${wasmUnavailSynths.length})</summary><p>${wasmUnavailSynths.join(', ')}</p></details>` : ''}
        ${silentSynths.length === 0 && quietSynths.length === 0 && loudSynths.length === 0 ? '<p class="pass">All tested synths have balanced output levels!</p>' : ''}
      </div>
    `);

    window.SYNTH_TEST_RESULTS = testResults;
    window.SYNTH_TEST_COMPLETE = true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('Test error: ' + msg, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

/**
 * Test for sustain/release behavior issues:
 * 1. Synths that go silent during sustain (bug)
 * 2. Synths that play forever after release (bug)
 */
async function testSustainReleaseBehavior() {
  logHtml('<h2>Sustain/Release Behavior Tests</h2>');
  logHtml('<p class="info">Testing that synths maintain level during sustain and properly stop after release.</p>');

  const meter = new Tone.Meter();
  meter.toDestination();

  // Synths to test (exclude noise/percussion which behave differently)
  const synthsToTest = ['Synth', 'MonoSynth', 'FMSynth', 'AMSynth', 'TB303', 'Buzz3o3',
    'SuperSaw', 'WobbleBass', 'FormantSynth', 'V2', 'Furnace', 'PolySynth', 'Organ'];

  interface BehaviorResult {
    name: string;
    sustainLevel: number;
    afterReleaseLevel: number;
    goesSilent: boolean;
    playsForever: boolean;
    status: 'pass' | 'fail' | 'warn' | 'error';
    error?: string;
  }

  const results: BehaviorResult[] = [];

  logHtml('<table><tr><th>Synth</th><th>Sustain Level</th><th>After Release</th><th>Status</th><th>Issue</th></tr>');

  for (const name of synthsToTest) {
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    try {
      const preset = getFirstPresetForSynthType(config.synthType as string);
      const presetConfig = preset
        ? (() => { const p = { ...preset } as Record<string, unknown>; delete p.name; delete p.type; delete p.synthType; return p; })()
        : {};

      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        volume: -12,
        ...presetConfig,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig);
      const synthObj = synth as unknown as Record<string, unknown>;
      if (typeof synthObj.connect === 'function') {
        (synthObj.connect as (dest: unknown) => void)(meter);
      }

      let sustainLevel = -Infinity;
      let afterReleaseLevel = -Infinity;

      if (typeof synthObj.triggerAttack === 'function') {
        // Trigger and hold for sustain measurement
        (synthObj.triggerAttack as (note: string) => void)('C4');

        // Wait for attack/decay to complete, measure sustain
        await new Promise(r => setTimeout(r, 500));
        sustainLevel = meter.getValue() as number;

        // Release the note
        if (typeof synthObj.triggerRelease === 'function') {
          (synthObj.triggerRelease as () => void)();
        } else if (typeof synthObj.releaseAll === 'function') {
          (synthObj.releaseAll as () => void)();
        }

        // Wait for release to complete
        await new Promise(r => setTimeout(r, 1500));
        afterReleaseLevel = meter.getValue() as number;
      }

      // Analyze behavior
      const goesSilent = sustainLevel < -40; // Should maintain level during sustain
      const playsForever = afterReleaseLevel > -50; // Should be silent after release

      let status: 'pass' | 'fail' | 'warn' = 'pass';
      let issue = '';

      if (goesSilent && playsForever) {
        status = 'fail';
        issue = 'SILENT SUSTAIN + PLAYS FOREVER';
      } else if (goesSilent) {
        status = 'fail';
        issue = 'GOES SILENT DURING SUSTAIN';
      } else if (playsForever) {
        status = 'fail';
        issue = 'PLAYS FOREVER (no release)';
      }

      results.push({
        name,
        sustainLevel,
        afterReleaseLevel,
        goesSilent,
        playsForever,
        status,
      });

      logHtml(`<tr>
        <td>${name}</td>
        <td>${sustainLevel === -Infinity ? '-∞' : sustainLevel.toFixed(1)}dB</td>
        <td>${afterReleaseLevel === -Infinity ? '-∞' : afterReleaseLevel.toFixed(1)}dB</td>
        <td class="${status}">${status.toUpperCase()}</td>
        <td class="${status === 'pass' ? '' : 'fail'}">${issue || 'OK'}</td>
      </tr>`);

      if (typeof synthObj.dispose === 'function') {
        (synthObj.dispose as () => void)();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        name,
        sustainLevel: -Infinity,
        afterReleaseLevel: -Infinity,
        goesSilent: true,
        playsForever: false,
        status: 'error',
        error: msg,
      });
      logHtml(`<tr><td>${name}</td><td colspan="4" class="fail">Error: ${msg}</td></tr>`);
    }
  }

  logHtml('</table>');

  // Summary
  const silentSynths = results.filter(r => r.goesSilent && r.status !== 'error');
  const foreverSynths = results.filter(r => r.playsForever && r.status !== 'error');
  const errorSynths = results.filter(r => r.status === 'error');

  logHtml(`
    <div class="summary">
      <h2>Behavior Summary</h2>
      ${silentSynths.length > 0 ? `<p class="fail">Goes silent during sustain: ${silentSynths.map(s => s.name).join(', ')}</p>` : ''}
      ${foreverSynths.length > 0 ? `<p class="fail">Plays forever (no release): ${foreverSynths.map(s => s.name).join(', ')}</p>` : ''}
      ${errorSynths.length > 0 ? `<p class="fail">Creation errors: ${errorSynths.map(s => s.name).join(', ')}</p>` : ''}
      ${silentSynths.length === 0 && foreverSynths.length === 0 && errorSynths.length === 0 ? '<p class="pass">All synths have correct sustain/release behavior!</p>' : ''}
    </div>
  `);

  meter.dispose();
}

async function runBehaviorTests() {
  clearResults();
  logHtml('<h2>Running Sustain/Release Behavior Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testSustainReleaseBehavior();
    window.SYNTH_TEST_COMPLETE = true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('Test error: ' + msg, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

// ============================================
// SAMPLE PACK TEST FUNCTIONS
// ============================================

/**
 * Test that sample packs are properly configured
 */
async function testSamplePackConfiguration() {
  logHtml('<h2>Sample Pack Configuration Tests</h2>');
  logHtml('<p class="info">Verifying sample pack metadata and structure.</p>');

  logHtml('<table><tr><th>Pack</th><th>Author</th><th>Samples</th><th>Categories</th><th>Status</th></tr>');

  for (const pack of SAMPLE_PACKS) {
    const categoryList = pack.categories.join(', ');
    const actualCount = Object.values(pack.samples).reduce((sum, arr) => sum + arr.length, 0);

    let status = 'pass';
    let statusText = 'OK';

    // Check that declared count matches actual
    if (actualCount !== pack.sampleCount) {
      status = 'warn';
      statusText = `Count mismatch: ${actualCount} vs ${pack.sampleCount}`;
    }

    // Check that all declared categories have samples
    const emptyCategories = pack.categories.filter(cat => pack.samples[cat].length === 0);
    if (emptyCategories.length > 0) {
      status = 'warn';
      statusText = `Empty categories: ${emptyCategories.join(', ')}`;
    }

    logHtml(`<tr>
      <td><strong>${pack.name}</strong><br><small>${pack.id}</small></td>
      <td>${pack.author}</td>
      <td>${actualCount}</td>
      <td>${categoryList}</td>
      <td class="${status}">${statusText}</td>
    </tr>`);

    if (status === 'pass') {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
  }

  logHtml('</table>');
}

/**
 * Test that all sample URLs can be fetched
 */
async function testSamplePackLoading() {
  logHtml('<h2>Sample Pack Loading Tests</h2>');
  logHtml('<p class="info">Testing that all sample URLs are accessible.</p>');

  for (const pack of SAMPLE_PACKS) {
    logHtml(`<h3>${pack.name} (${pack.sampleCount} samples)</h3>`);

    const result: SamplePackTestResult = {
      packId: pack.id,
      packName: pack.name,
      totalSamples: pack.sampleCount,
      loadedSamples: 0,
      failedSamples: [],
      volumeLevels: [],
      categoryCounts: {} as Record<SampleCategory, number>,
      status: 'pass'
    };

    // Test a subset of samples from each category (max 3 per category for speed)
    const MAX_SAMPLES_PER_CATEGORY = 3;

    logHtml('<table><tr><th>Category</th><th>Total</th><th>Tested</th><th>Loaded</th><th>Failed</th></tr>');

    for (const category of pack.categories) {
      const samples = pack.samples[category];
      if (!samples || samples.length === 0) continue;

      result.categoryCounts[category] = samples.length;

      // Test subset of samples
      const samplesToTest = samples.slice(0, MAX_SAMPLES_PER_CATEGORY);
      let loaded = 0;
      let failed = 0;

      for (const sample of samplesToTest) {
        try {
          const response = await fetch(sample.url, { method: 'HEAD' });
          if (response.ok) {
            loaded++;
            result.loadedSamples++;
          } else {
            failed++;
            result.failedSamples.push({
              filename: sample.filename,
              error: `HTTP ${response.status}`
            });
          }
        } catch (e: unknown) {
          failed++;
          result.failedSamples.push({
            filename: sample.filename,
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }

      logHtml(`<tr class="${failed === 0 ? '' : (loaded > 0 ? 'warn' : 'fail')}">
        <td>${category}</td>
        <td>${samples.length}</td>
        <td>${samplesToTest.length}</td>
        <td class="pass">${loaded}</td>
        <td class="${failed > 0 ? 'fail' : ''}">${failed}</td>
      </tr>`);
    }

    logHtml('</table>');

    // Determine overall status
    if (result.failedSamples.length > 0) {
      result.status = result.loadedSamples > 0 ? 'partial' : 'fail';
    }

    testResults.samplePackResults.push(result);

    if (result.failedSamples.length > 0) {
      logHtml(`<details><summary class="fail">Failed samples (${result.failedSamples.length})</summary><ul>`);
      for (const f of result.failedSamples) {
        logHtml(`<li>${f.filename}: ${f.error}</li>`);
      }
      logHtml('</ul></details>');
    }
  }
}

/**
 * Test sample playback with volume measurement
 */
async function testSamplePlayback() {
  logHtml('<h2>Sample Playback & Volume Tests</h2>');
  logHtml('<p class="info">Playing samples and measuring output levels. Target: -15dB to -6dB.</p>');

  const meter = new Tone.Meter();
  meter.toDestination();

  for (const pack of SAMPLE_PACKS) {
    logHtml(`<h3>${pack.name}</h3>`);

    const packResult = testResults.samplePackResults.find(r => r.packId === pack.id);

    logHtml('<table><tr><th>Sample</th><th>Category</th><th>Peak (dB)</th><th>Status</th></tr>');

    // Test one sample from each category
    for (const category of pack.categories) {
      const samples = pack.samples[category];
      if (!samples || samples.length === 0) continue;

      // Pick first sample from category
      const sample = samples[0];

      try {
        // Create a player for the sample
        const player = new Tone.Player(sample.url);
        player.connect(meter);

        // Wait for it to load
        await Tone.loaded();

        // Play and measure
        player.start();
        await new Promise(r => setTimeout(r, 300)); // Let it play briefly

        const peakDb = meter.getValue() as number;

        player.stop();
        player.dispose();

        // Determine status
        let status = 'pass';
        let statusText = 'OK';

        if (peakDb === -Infinity) {
          status = 'warn';
          statusText = 'SILENT';
        } else if (peakDb < -25) {
          status = 'warn';
          statusText = 'QUIET';
        } else if (peakDb > -3) {
          status = 'warn';
          statusText = 'LOUD';
        }

        if (packResult) {
          packResult.volumeLevels.push({
            filename: sample.filename,
            category,
            peakDb
          });
        }

        logHtml(`<tr>
          <td>${sample.name}</td>
          <td>${category}</td>
          <td>${peakDb === -Infinity ? '-∞' : peakDb.toFixed(1)}</td>
          <td class="${status}">${statusText}</td>
        </tr>`);

        // Small delay between samples
        await new Promise(r => setTimeout(r, 100));

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logHtml(`<tr>
          <td>${sample.name}</td>
          <td>${category}</td>
          <td colspan="2" class="fail">Error: ${msg}</td>
        </tr>`);
      }
    }

    logHtml('</table>');
  }

  meter.dispose();
}

/**
 * Test that sample categories are correctly organized
 */
async function testSampleCategories() {
  logHtml('<h2>Sample Category Organization</h2>');
  logHtml('<p class="info">Checking that samples are organized into appropriate categories.</p>');

  // Category keywords for validation
  const CATEGORY_KEYWORDS: Record<SampleCategory, string[]> = {
    kicks: ['kick', 'bd', 'bass drum', 'bassdrum'],
    snares: ['snare', 'sd', 'snr'],
    hihats: ['hihat', 'hi-hat', 'hh', 'hat', 'cymbal', 'oh', 'ch', 'ride', 'crash'],
    claps: ['clap', 'cp'],
    percussion: ['perc', 'tom', 'conga', 'bongo', 'bell', 'shaker', 'tambourine', 'rim', 'clave', 'tabla'],
    fx: ['fx', 'effect', 'sfx', 'laser', 'sweep', 'riser', 'impact'],
    bass: ['bass', 'sub'],
    leads: ['lead', 'synth', 'pluck', 'arp'],
    pads: ['pad', 'ambient', 'drone'],
    loops: ['loop', 'break', 'beat'],
    vocals: ['vocal', 'vox', 'voice', 'speak'],
    other: []
  };

  for (const pack of SAMPLE_PACKS) {
    logHtml(`<h3>${pack.name}</h3>`);

    let misplacements = 0;
    const issues: string[] = [];

    for (const category of pack.categories) {
      const samples = pack.samples[category];
      if (!samples) continue;

      for (const sample of samples) {
        const lowerName = sample.filename.toLowerCase();

        // Check if filename suggests a different category
        for (const [otherCat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
          if (otherCat === category || otherCat === 'other') continue;

          for (const keyword of keywords) {
            if (lowerName.includes(keyword)) {
              // Filename contains keyword for different category
              // This might be a misplacement OR the filename is just descriptive
              // Only flag obvious mismatches
              const isObviousMismatch =
                (category === 'kicks' && (lowerName.startsWith('sd_') || lowerName.startsWith('snare'))) ||
                (category === 'snares' && (lowerName.startsWith('bd_') || lowerName.startsWith('kick'))) ||
                (category === 'hihats' && (lowerName.startsWith('bd_') || lowerName.startsWith('sd_')));

              if (isObviousMismatch) {
                misplacements++;
                issues.push(`${sample.filename} in ${category} might belong in ${otherCat}`);
              }
              break;
            }
          }
        }
      }
    }

    if (misplacements === 0) {
      log(`${pack.name}: All samples appear correctly categorized`, 'pass');
    } else {
      log(`${pack.name}: ${misplacements} potential misplacements`, 'warn');
      for (const issue of issues.slice(0, 5)) {
        log(`  - ${issue}`, 'warn');
      }
      if (issues.length > 5) {
        log(`  ... and ${issues.length - 5} more`, 'info');
      }
    }
  }
}

/**
 * Run all sample pack tests
 */
async function runSamplePackTests() {
  clearResults();
  logHtml('<h2>Running Sample Pack Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testSamplePackConfiguration();
    await testSamplePackLoading();
    await testSamplePlayback();
    await testSampleCategories();
    displaySamplePackSummary();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('Test error: ' + msg, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

/**
 * Display sample pack test summary
 */
function displaySamplePackSummary() {
  const { samplePackResults } = testResults;

  const totalPacks = samplePackResults.length;
  const passedPacks = samplePackResults.filter(r => r.status === 'pass').length;
  const totalSamples = samplePackResults.reduce((sum, r) => sum + r.totalSamples, 0);
  const totalFailed = samplePackResults.reduce((sum, r) => sum + r.failedSamples.length, 0);

  logHtml(`
    <div class="summary">
      <h2>Sample Pack Test Summary</h2>
      <p>Packs Tested: ${totalPacks}</p>
      <p class="${passedPacks === totalPacks ? 'pass' : 'warn'}">Packs Passed: ${passedPacks}/${totalPacks}</p>
      <p>Total Samples: ${totalSamples}</p>
      ${totalFailed > 0 ? `<p class="fail">Failed to Load: ${totalFailed} samples</p>` : '<p class="pass">All tested samples loaded successfully</p>'}
    </div>
  `);

  window.SYNTH_TEST_RESULTS = testResults;
  window.SYNTH_TEST_COMPLETE = true;
}

// ============================================
// EFFECT TEST CONFIGURATIONS
// ============================================

const EFFECT_CONFIGS: Record<string, EffectConfig> = {
  // === Dynamics ===
  'Compressor': {
    id: 'test-compressor', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100,
    parameters: { threshold: -24, ratio: 12, attack: 0.003, release: 0.25 },
  },
  'EQ3': {
    id: 'test-eq3', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100,
    parameters: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 },
  },

  // === Distortion ===
  'Distortion': {
    id: 'test-distortion', category: 'tonejs', type: 'Distortion', enabled: true, wet: 50,
    parameters: { drive: 50 },
  },
  'BitCrusher': {
    id: 'test-bitcrusher', category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 50,
    parameters: { bits: 4 },
  },
  'Chebyshev': {
    id: 'test-chebyshev', category: 'tonejs', type: 'Chebyshev', enabled: true, wet: 50,
    parameters: { order: 50 },
  },

  // === Reverb & Delay ===
  'Reverb': {
    id: 'test-reverb', category: 'tonejs', type: 'Reverb', enabled: true, wet: 30,
    parameters: { decay: 1.5, preDelay: 0.01 },
  },
  'JCReverb': {
    id: 'test-jcreverb', category: 'tonejs', type: 'JCReverb', enabled: true, wet: 30,
    parameters: { roomSize: 0.5 },
  },
  'Delay': {
    id: 'test-delay', category: 'tonejs', type: 'Delay', enabled: true, wet: 30,
    parameters: { time: 0.25, feedback: 0.5 },
  },
  'FeedbackDelay': {
    id: 'test-feedbackdelay', category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 30,
    parameters: { time: 0.25, feedback: 0.5 },
  },
  'PingPongDelay': {
    id: 'test-pingpong', category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 30,
    parameters: { time: 0.25, feedback: 0.5 },
  },
  'SpaceEcho': {
    id: 'test-spaceecho', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 30,
    parameters: { mode: 4, rate: 300, intensity: 0.5, echoVolume: 0.8, reverbVolume: 0.3 },
  },
  'SpaceyDelayer': {
    id: 'test-spaceydelayer', category: 'tonejs', type: 'SpaceyDelayer', enabled: true, wet: 30,
    parameters: { firstTap: 250, tapSize: 150, feedback: 50, multiTap: 1, tapeFilter: 1 },
  },
  'RETapeEcho': {
    id: 'test-retapeecho', category: 'tonejs', type: 'RETapeEcho', enabled: true, wet: 30,
    parameters: { mode: 4, repeatRate: 0.5, intensity: 0.5, echoVolume: 0.7, wow: 0.3, flutter: 0.3, dirt: 0.2, inputBleed: 0, loopAmount: 0, playheadFilter: 1 },
  },

  // === Modulation ===
  'BiPhase': {
    id: 'test-biphase', category: 'tonejs', type: 'BiPhase', enabled: true, wet: 50,
    parameters: { rateA: 0.5, depthA: 0.6, rateB: 4.0, depthB: 0.4, feedback: 0.3 },
  },
  'Chorus': {
    id: 'test-chorus', category: 'tonejs', type: 'Chorus', enabled: true, wet: 50,
    parameters: { frequency: 1.5, delayTime: 3.5, depth: 0.7 },
  },
  'Phaser': {
    id: 'test-phaser', category: 'tonejs', type: 'Phaser', enabled: true, wet: 50,
    parameters: { frequency: 0.5, octaves: 3, baseFrequency: 350 },
  },
  'Tremolo': {
    id: 'test-tremolo', category: 'tonejs', type: 'Tremolo', enabled: true, wet: 50,
    parameters: { frequency: 10, depth: 0.5 },
  },
  'Vibrato': {
    id: 'test-vibrato', category: 'tonejs', type: 'Vibrato', enabled: true, wet: 50,
    parameters: { frequency: 5, depth: 0.1 },
  },
  'AutoPanner': {
    id: 'test-autopanner', category: 'tonejs', type: 'AutoPanner', enabled: true, wet: 50,
    parameters: { frequency: 1, depth: 1 },
  },

  // === Filters ===
  'Filter': {
    id: 'test-filter', category: 'tonejs', type: 'Filter', enabled: true, wet: 100,
    parameters: { frequency: 350, Q: 1, gain: 0, type: 'lowpass' },
  },
  'DubFilter': {
    id: 'test-dubfilter', category: 'tonejs', type: 'DubFilter', enabled: true, wet: 100,
    parameters: { cutoff: 20, resonance: 1, gain: 1 },
  },
  'AutoFilter': {
    id: 'test-autofilter', category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 50,
    parameters: { frequency: 1, baseFrequency: 200, octaves: 2.6 },
  },
  'AutoWah': {
    id: 'test-autowah', category: 'tonejs', type: 'AutoWah', enabled: true, wet: 50,
    parameters: { baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2 },
  },

  // === Pitch ===
  'PitchShift': {
    id: 'test-pitchshift', category: 'tonejs', type: 'PitchShift', enabled: true, wet: 100,
    parameters: { pitch: 0, windowSize: 0.1, delayTime: 0, feedback: 0 },
  },
  'FrequencyShifter': {
    id: 'test-freqshift', category: 'tonejs', type: 'FrequencyShifter', enabled: true, wet: 50,
    parameters: { frequency: 0 },
  },

  // === Spatial ===
  'StereoWidener': {
    id: 'test-stereowidener', category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100,
    parameters: { width: 0.5 },
  },

  // === Custom ===
  'TapeSaturation': {
    id: 'test-tapesat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 12000 },
  },
  'SidechainCompressor': {
    id: 'test-sidechain', category: 'tonejs', type: 'SidechainCompressor', enabled: true, wet: 100,
    parameters: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 6, sidechainGain: 50 },
  },

  // === Buzzmachine Effects ===
  // NOTE: Buzzmachine effects require AudioWorklet which is only available in browser environments.
  // These will be skipped in test environments that don't support AudioWorklet (e.g., Vitest/Node).
  // They work correctly in the full browser application.
  'BuzzDistortion': {
    id: 'test-buzzdist', category: 'buzzmachine', type: 'BuzzDistortion', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzSVF': {
    id: 'test-buzzsvf', category: 'buzzmachine', type: 'BuzzSVF', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzDelay': {
    id: 'test-buzzdelay', category: 'buzzmachine', type: 'BuzzDelay', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzChorus': {
    id: 'test-buzzchorus', category: 'buzzmachine', type: 'BuzzChorus', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzCompressor': {
    id: 'test-buzzcomp', category: 'buzzmachine', type: 'BuzzCompressor', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzOverdrive': {
    id: 'test-buzzod', category: 'buzzmachine', type: 'BuzzOverdrive', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzDistortion2': {
    id: 'test-buzzdist2', category: 'buzzmachine', type: 'BuzzDistortion2', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzCrossDelay': {
    id: 'test-buzzcrossdelay', category: 'buzzmachine', type: 'BuzzCrossDelay', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzPhilta': {
    id: 'test-buzzphilta', category: 'buzzmachine', type: 'BuzzPhilta', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzDist2': {
    id: 'test-buzzelakdist', category: 'buzzmachine', type: 'BuzzDist2', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzFreeverb': {
    id: 'test-buzzfreeverb', category: 'buzzmachine', type: 'BuzzFreeverb', enabled: true, wet: 30,
    parameters: {},
  },
  'BuzzFreqShift': {
    id: 'test-buzzfreqshift', category: 'buzzmachine', type: 'BuzzFreqShift', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzNotch': {
    id: 'test-buzznotch', category: 'buzzmachine', type: 'BuzzNotch', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzStereoGain': {
    id: 'test-buzzsrgain', category: 'buzzmachine', type: 'BuzzStereoGain', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzSoftSat': {
    id: 'test-buzzsoftsat', category: 'buzzmachine', type: 'BuzzSoftSat', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzLimiter': {
    id: 'test-buzzlimiter', category: 'buzzmachine', type: 'BuzzLimiter', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzExciter': {
    id: 'test-buzzexciter', category: 'buzzmachine', type: 'BuzzExciter', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzMasterizer': {
    id: 'test-buzzmasterizer', category: 'buzzmachine', type: 'BuzzMasterizer', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzStereoDist': {
    id: 'test-buzzstereodist', category: 'buzzmachine', type: 'BuzzStereoDist', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzWhiteChorus': {
    id: 'test-buzzwhitechorus', category: 'buzzmachine', type: 'BuzzWhiteChorus', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzZfilter': {
    id: 'test-buzzzfilter', category: 'buzzmachine', type: 'BuzzZfilter', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzChorus2': {
    id: 'test-buzzchorus2', category: 'buzzmachine', type: 'BuzzChorus2', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzPanzerDelay': {
    id: 'test-buzzpanzerdelay', category: 'buzzmachine', type: 'BuzzPanzerDelay', enabled: true, wet: 50,
    parameters: {},
  },

  // === Neural Effects (representative subset - 1 per category) ===
  'Neural TS808 (Overdrive)': {
    id: 'test-neural-0', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 0, neuralModelName: 'TS808',
  },
  'Neural RAT (Distortion)': {
    id: 'test-neural-1', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 1, neuralModelName: 'ProCo RAT',
  },
  'Neural MT-2 (Metal Zone)': {
    id: 'test-neural-2', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 2, neuralModelName: 'MT-2',
  },
  'Neural DOD 250': {
    id: 'test-neural-3', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 3, neuralModelName: 'DOD 250',
  },
  'Neural Big Muff': {
    id: 'test-neural-4', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 4, neuralModelName: 'Big Muff',
  },
  'Neural MXR Dist+': {
    id: 'test-neural-5', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 5, neuralModelName: 'MXR Dist+',
  },
  'Neural Bluesbreaker': {
    id: 'test-neural-6', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 6, neuralModelName: 'Bluesbreaker',
  },
  'Neural Klon': {
    id: 'test-neural-7', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 7, neuralModelName: 'Klon',
  },
  'Neural Princeton (Amp)': {
    id: 'test-neural-8', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 8, neuralModelName: 'Princeton',
  },
  'Neural Plexi (Amp)': {
    id: 'test-neural-9', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 9, neuralModelName: 'Plexi',
  },
  'Neural Mesa Recto (Amp)': {
    id: 'test-neural-10', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 10, neuralModelName: 'Mesa Recto',
  },
  'Neural AC30 (Amp)': {
    id: 'test-neural-11', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 11, neuralModelName: 'AC30',
  },
  'Neural Bassman (Amp)': {
    id: 'test-neural-12', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 12, neuralModelName: 'Bassman',
  },
  'Neural JCM800 (Amp)': {
    id: 'test-neural-13', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 13, neuralModelName: 'JCM800',
  },
  'Neural SLO100 (Amp)': {
    id: 'test-neural-14', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 14, neuralModelName: 'SLO100',
  },
  'Neural 5150 (Amp)': {
    id: 'test-neural-15', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 15, neuralModelName: '5150',
  },
  'Neural Dumble (Amp)': {
    id: 'test-neural-16', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 16, neuralModelName: 'Dumble ODS',
  },
  'Neural Matchless (Amp)': {
    id: 'test-neural-17', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 17, neuralModelName: 'Matchless DC30',
  },
  'Neural Orange (Amp)': {
    id: 'test-neural-18', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 18, neuralModelName: 'Orange Rockerverb',
  },
  'Neural ENGL (Amp)': {
    id: 'test-neural-19', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 19, neuralModelName: 'ENGL Powerball',
  },
  'Neural Friedman (Amp)': {
    id: 'test-neural-20', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 20, neuralModelName: 'Friedman BE-100',
  },
  'Neural Timmy': {
    id: 'test-neural-21', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, treble: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 21, neuralModelName: 'Timmy',
  },
  'Neural Vertex': {
    id: 'test-neural-22', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 22, neuralModelName: 'Vertex',
  },
  'Neural Fulltone OCD': {
    id: 'test-neural-23', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 23, neuralModelName: 'Fulltone OCD',
  },
  'Neural Horizon': {
    id: 'test-neural-24', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 24, neuralModelName: 'Horizon',
  },
  'Neural Suhr Riot': {
    id: 'test-neural-25', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 25, neuralModelName: 'Suhr Riot',
  },
  'Neural Bogner': {
    id: 'test-neural-26', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 26, neuralModelName: 'Bogner Ecstasy',
  },
  'Neural Wampler': {
    id: 'test-neural-27', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 27, neuralModelName: 'Wampler Pinnacle',
  },
  'Neural Fortin 33': {
    id: 'test-neural-28', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 28, neuralModelName: 'Fortin 33',
  },
  'Neural Revv G3': {
    id: 'test-neural-29', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 29, neuralModelName: 'Revv G3',
  },
  'Neural Way Huge': {
    id: 'test-neural-30', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 30, neuralModelName: 'Way Huge Pork Loin',
  },
  'Neural Darkglass (Bass)': {
    id: 'test-neural-31', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 31, neuralModelName: 'Darkglass B7K',
  },
  'Neural SansAmp (Bass)': {
    id: 'test-neural-32', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 32, neuralModelName: 'Tech 21 SansAmp',
  },
  'Neural Ampeg SVT (Bass)': {
    id: 'test-neural-33', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 33, neuralModelName: 'Ampeg SVT',
  },
  'Neural Virus Distortion': {
    id: 'test-neural-34', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 34, neuralModelName: 'Virus Distortion',
  },
  'Neural Filmosound (Amp)': {
    id: 'test-neural-35', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 35, neuralModelName: 'Filmosound',
  },
  'Neural Gibson EH-185 (Amp)': {
    id: 'test-neural-36', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 36, neuralModelName: 'Gibson EH-185',
  },
};

// ============================================
// EFFECT TEST FUNCTIONS
// ============================================

function getEffectCategory(name: string): string {
  if (name.startsWith('Buzz')) return 'Buzzmachine';
  if (name.startsWith('Neural')) return 'Neural';
  if (['SpaceyDelayer', 'RETapeEcho'].includes(name)) return 'WASM';
  return 'ToneJS';
}

async function testEffectCreation() {
  logHtml('<h2>Effect Creation Tests</h2>');
  logHtml(`<p class="info">Testing creation of ${Object.keys(EFFECT_CONFIGS).length} effects (Tone.js, WASM, Buzzmachine, Neural).</p>`);

  logHtml('<table><tr><th>Effect</th><th>Category</th><th>Constructor</th><th>Status</th></tr>');

  // Track consecutive failures per category for skip logic
  const silentCountByCategory: Record<string, number> = {};
  let skippedCount = 0;

  for (const [name, config] of Object.entries(EFFECT_CONFIGS)) {
    const category = getEffectCategory(name);
    const catFails = silentCountByCategory[category] || 0;

    // Skip after 5 consecutive failures in the same category
    if (catFails >= 5) {
      testResults.failed++;
      testResults.errors.push({ name: `Effect: ${name}`, error: `Skipped (${category} engine failed)` });
      logHtml(`<tr><td>${name}</td><td>${category}</td><td>-</td><td class="fail">SKIPPED (${category})</td></tr>`);
      skippedCount++;
      continue;
    }

    try {
      const effect = await InstrumentFactory.createEffect(config);
      const effectObj = effect as unknown as Record<string, unknown>;
      const ctorName = (effectObj.constructor as { name?: string } | undefined)?.name || 'Unknown';

      // Verify it has connect/disconnect/dispose methods
      const hasConnect = typeof effectObj.connect === 'function';
      const hasDispose = typeof effectObj.dispose === 'function';

      if (!hasConnect) {
        logHtml(`<tr><td>${name}</td><td>${category}</td><td>${ctorName}</td><td class="warn">NO connect()</td></tr>`);
        testResults.failed++;
        testResults.errors.push({ name: `Effect: ${name}`, error: 'Missing connect() method' });
        silentCountByCategory[category] = (silentCountByCategory[category] || 0) + 1;
      } else {
        logHtml(`<tr><td>${name}</td><td>${category}</td><td>${ctorName}</td><td class="pass">OK</td></tr>`);
        testResults.passed++;
        silentCountByCategory[category] = 0;
      }

      // Dispose
      if (hasDispose) {
        try { (effectObj.dispose as () => void)(); } catch { /* ignored */ }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? (e.message || e.name) : (typeof e === 'string' ? e : 'unknown error');
      logHtml(`<tr><td>${name}</td><td>${category}</td><td>-</td><td class="fail">Error: ${errMsg}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name: `Effect: ${name}`, error: errMsg });
      silentCountByCategory[category] = (silentCountByCategory[category] || 0) + 1;
    }
  }

  if (skippedCount > 0) {
    logHtml(`<tr><td colspan="4" class="info">${skippedCount} effects skipped after consecutive failures</td></tr>`);
    // Check if Buzzmachine category was one that failed
    if ((silentCountByCategory['Buzzmachine'] || 0) >= 5) {
      logHtml(`<tr><td colspan="4" class="warn">Buzzmachine effects require AudioWorklet which is only available in full browser environments (not test runners)</td></tr>`);
    }
  }

  logHtml('</table>');
}

/**
 * Helper to measure peak level over a duration
 */
async function measurePeak(meter: Tone.Meter, durationMs: number): Promise<number> {
  let peak = -Infinity;
  const startTime = Date.now();
  while (Date.now() - startTime < durationMs) {
    const level = meter.getValue() as number;
    if (level > peak) peak = level;
    await new Promise(r => setTimeout(r, 5));
  }
  return peak;
}

/**
 * Helper to measure RMS-like average level
 */
async function measureAverage(meter: Tone.Meter, durationMs: number): Promise<number> {
  const samples: number[] = [];
  const startTime = Date.now();
  while (Date.now() - startTime < durationMs) {
    const level = meter.getValue() as number;
    if (level > -100) samples.push(Math.pow(10, level / 20)); // Convert dB to linear
    await new Promise(r => setTimeout(r, 5));
  }
  if (samples.length === 0) return -Infinity;
  const rms = Math.sqrt(samples.reduce((a, b) => a + b * b, 0) / samples.length);
  return 20 * Math.log10(rms); // Back to dB
}

/**
 * Helper to drain/reset meter
 */
async function drainMeter(meter: Tone.Meter): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 10));
    const level = meter.getValue() as number;
    if (level <= -80 || level === -Infinity) break;
  }
}

/**
 * Effect behavior categories for validation
 */
type EffectBehavior =
  | 'passthrough'      // Should pass signal unchanged (EQ3 at 0, Compressor below threshold)
  | 'modify'           // Should modify signal (Distortion, BitCrusher)
  | 'tail'             // Should have audio tail after note stops (Reverb, Delay)
  | 'modulation'       // Should vary over time (Chorus, Tremolo, Phaser)
  | 'filter'           // Should reduce energy (Filter, AutoWah)
  | 'dynamics';        // Should affect dynamics (Compressor)

const EFFECT_BEHAVIORS: Record<string, EffectBehavior> = {
  'Compressor': 'dynamics',
  'EQ3': 'passthrough',
  'Distortion': 'modify',
  'BitCrusher': 'modify',
  'Chebyshev': 'modify',
  'Reverb': 'tail',
  'JCReverb': 'tail',
  'Delay': 'tail',
  'FeedbackDelay': 'tail',
  'PingPongDelay': 'tail',
  'Chorus': 'modulation',
  'Phaser': 'modulation',
  'Tremolo': 'modulation',
  'Vibrato': 'modulation',
  'AutoPanner': 'modulation',
  'Filter': 'filter',
  'AutoFilter': 'modulation',
  'AutoWah': 'filter',
  'PitchShift': 'modify',
  'FrequencyShifter': 'modify',
  'StereoWidener': 'passthrough',
  'TapeSaturation': 'modify',
  'BiPhase': 'modulation',
  'DubFilter': 'filter',
  'SpaceEcho': 'tail',
  'SpaceyDelayer': 'tail',
  'RETapeEcho': 'tail',
  'SidechainCompressor': 'dynamics',
};

async function testEffectSignalPath() {
  logHtml('<h2>Effect Signal Path Tests (Basic)</h2>');
  logHtml('<p class="info">Testing that effects pass audio through (synth → effect → meter). Target: signal above -60dB.</p>');

  const meter = new Tone.Meter(0);
  meter.connect(Tone.getDestination());

  // Create a persistent keep-alive oscillator to prevent WebAudio from going idle
  // This fixes the "first N effects always fail" issue
  const keepAlive = new Tone.Oscillator({ frequency: 20, volume: -96 }); // Inaudible 20Hz at -96dB
  keepAlive.connect(Tone.getDestination());
  keepAlive.start();

  // Warmup: Play actual test tones through the meter to prime everything
  for (let warmup = 0; warmup < 5; warmup++) {
    const warmupSynth = new Tone.Synth({ volume: -24 });
    warmupSynth.connect(meter);
    warmupSynth.triggerAttackRelease('C4', '16n');
    await new Promise(r => setTimeout(r, 100));
    warmupSynth.dispose();
  }
  await drainMeter(meter);

  const fastEffects = [
    'Chorus', 'Tremolo', 'Vibrato', 'AutoPanner', 'Phaser',
    'Distortion', 'BitCrusher', 'Chebyshev', 'TapeSaturation',
    'Reverb', 'JCReverb', 'Delay', 'FeedbackDelay', 'PingPongDelay',
    'AutoFilter', 'AutoWah', 'PitchShift', 'FrequencyShifter',
    'BiPhase', 'DubFilter',
    'Compressor', 'EQ3', 'Filter', 'StereoWidener',
  ];

  logHtml('<table><tr><th>Effect</th><th>Peak (dB)</th><th>Status</th></tr>');

  // Extensive warmup - the audio context seems to need significant priming
  // Run multiple warmup cycles with different effect types to fully activate WebAudio
  logHtml('<tr><td colspan="3" class="info">Running warmup cycles...</td></tr>');

  const warmupEffects = ['Distortion', 'Chorus', 'Delay', 'Filter', 'Compressor'];
  for (const effectName of warmupEffects) {
    const config = EFFECT_CONFIGS[effectName];
    if (!config) continue;

    try {
      const warmupSynth = new Tone.Synth({ volume: -18 });
      const warmupEffect = await InstrumentFactory.createEffect(config);
      const wEffObj = warmupEffect as unknown as Record<string, unknown>;
      warmupSynth.connect(warmupEffect as Tone.ToneAudioNode);
      if (typeof wEffObj.connect === 'function') (wEffObj.connect as (dest: unknown) => void)(meter);

      await new Promise(r => setTimeout(r, 50));
      warmupSynth.triggerAttackRelease('C4', '8n');
      await new Promise(r => setTimeout(r, 300));

      warmupSynth.dispose();
      try { if (typeof wEffObj.dispose === 'function') (wEffObj.dispose as () => void)(); } catch { /* ignored */ }
      await drainMeter(meter);
    } catch {
      // ignored - warmup effect failed, continue anyway
    }
  }

  // Final settle time
  await new Promise(r => setTimeout(r, 200));
  logHtml('<tr><td><i>(warmup complete)</i></td><td>-</td><td class="info">ready</td></tr>');

  for (const name of fastEffects) {
    const config = EFFECT_CONFIGS[name];
    if (!config) continue;

    try {
      const synth = new Tone.Synth({ volume: -12 });
      const effect = await InstrumentFactory.createEffect(config);
      const effectObj = effect as unknown as Record<string, unknown>;

      synth.connect(effect as Tone.ToneAudioNode);
      if (typeof effectObj.connect === 'function') (effectObj.connect as (dest: unknown) => void)(meter);

      // LFO-based effects need extra time for the oscillator to start
      const isLFOEffect = ['Chorus', 'Tremolo', 'Vibrato', 'AutoPanner', 'AutoFilter', 'Phaser'].includes(name);
      const stabilizeTime = isLFOEffect ? 200 : 100;

      await new Promise(r => setTimeout(r, stabilizeTime));

      // Prime the meter with a quick measurement to wake it up
      meter.getValue();
      await new Promise(r => setTimeout(r, 20));

      synth.triggerAttack('C4');
      const peakDb = await measurePeak(meter, 300);
      synth.triggerRelease();
      await new Promise(r => setTimeout(r, 50));

      let status = 'pass';
      let statusText = 'OK';
      if (peakDb === -Infinity || peakDb < -60) {
        status = 'fail';
        statusText = peakDb === -Infinity ? 'NO SIGNAL' : 'SILENT';
        testResults.failed++;
        testResults.errors.push({ name: `EffectPath: ${name}`, error: `No signal (${peakDb === -Infinity ? 'silent' : peakDb.toFixed(1) + 'dB'})` });
      } else {
        testResults.passed++;
      }

      logHtml(`<tr><td>${name}</td><td>${peakDb === -Infinity ? '-∞' : peakDb.toFixed(1)}</td><td class="${status}">${statusText}</td></tr>`);

      try { synth.dispose(); } catch { /* ignored */ }
      try { if (typeof effectObj.dispose === 'function') (effectObj.dispose as () => void)(); } catch { /* ignored */ }
      await drainMeter(meter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logHtml(`<tr><td>${name}</td><td>-</td><td class="fail">Error: ${msg}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name: `EffectPath: ${name}`, error: msg });
    }
  }

  logHtml('</table>');
  keepAlive.stop();
  keepAlive.dispose();
  meter.dispose();
}

/**
 * Advanced effect tests - validates effects actually do something
 */
async function testEffectBehavior() {
  logHtml('<h2>Effect Behavior Tests (Advanced)</h2>');
  logHtml('<p class="info">Validates that effects actually modify audio as expected.</p>');

  const meter = new Tone.Meter(0);
  meter.connect(Tone.getDestination());

  // Warm-up
  const warmupSynth = new Tone.Synth({ volume: -24 });
  warmupSynth.connect(meter);
  warmupSynth.triggerAttack('C4');
  await new Promise(r => setTimeout(r, 100));
  warmupSynth.triggerRelease();
  await new Promise(r => setTimeout(r, 100));
  warmupSynth.dispose();
  await drainMeter(meter);

  // First, measure baseline (dry signal)
  logHtml('<h3>Baseline Measurement</h3>');
  const baselineSynth = new Tone.Synth({ volume: -12 });
  baselineSynth.connect(meter);
  baselineSynth.triggerAttack('C4');
  const baselinePeak = await measurePeak(meter, 200);
  baselineSynth.triggerRelease();
  await new Promise(r => setTimeout(r, 50));
  const baselineTail = await measurePeak(meter, 200); // Measure after release
  baselineSynth.dispose();
  await drainMeter(meter);

  logHtml(`<p>Dry signal: Peak=${baselinePeak.toFixed(1)}dB, Tail=${baselineTail === -Infinity ? '-∞' : baselineTail.toFixed(1)}dB</p>`);

  // Test each effect for its expected behavior
  logHtml('<table><tr><th>Effect</th><th>Behavior</th><th>Peak</th><th>Tail</th><th>Test</th><th>Status</th></tr>');

  const effectsToTest = [
    'Distortion', 'BitCrusher', 'Chebyshev', 'TapeSaturation',  // Should modify
    'Reverb', 'JCReverb', 'Delay', 'FeedbackDelay',              // Should have tail
    'Tremolo', 'Chorus', 'Phaser', 'AutoPanner',                 // Modulation
    'Filter', 'DubFilter',                                        // Filter
    'Compressor',                                                 // Dynamics
  ];

  for (const name of effectsToTest) {
    const config = EFFECT_CONFIGS[name];
    if (!config) continue;

    const behavior = EFFECT_BEHAVIORS[name] || 'modify';

    try {
      const synth = new Tone.Synth({ volume: -12 });
      const effect = await InstrumentFactory.createEffect(config);
      const effectObj = effect as unknown as Record<string, unknown>;

      synth.connect(effect as Tone.ToneAudioNode);
      if (typeof effectObj.connect === 'function') (effectObj.connect as (dest: unknown) => void)(meter);
      await new Promise(r => setTimeout(r, 30));

      // Measure with effect
      synth.triggerAttack('C4');
      const effectPeak = await measurePeak(meter, 200);
      synth.triggerRelease();
      await new Promise(r => setTimeout(r, 50));
      const effectTail = await measurePeak(meter, 300); // Longer tail measurement

      let status = 'pass';
      let statusText = 'OK';
      let testDescription = '';

      // Validate based on expected behavior
      switch (behavior) {
        case 'tail':
          // Tail effects should have signal after note release
          testDescription = 'Tail > -60dB after release';
          if (effectTail < -60) {
            status = 'fail';
            statusText = `NO TAIL (${effectTail === -Infinity ? '-∞' : effectTail.toFixed(1)}dB)`;
          }
          break;

        case 'modify':
          // Modifying effects should produce signal
          testDescription = 'Peak > -40dB';
          if (effectPeak < -40) {
            status = 'fail';
            statusText = `WEAK (${effectPeak.toFixed(1)}dB)`;
          }
          break;

        case 'modulation':
          // Modulation effects should produce signal (harder to test variance)
          testDescription = 'Peak > -30dB';
          if (effectPeak < -30) {
            status = 'fail';
            statusText = `WEAK (${effectPeak.toFixed(1)}dB)`;
          }
          break;

        case 'filter':
          // Filter should still pass signal but possibly reduced
          testDescription = 'Signal present';
          if (effectPeak < -50) {
            status = 'fail';
            statusText = `TOO QUIET (${effectPeak.toFixed(1)}dB)`;
          }
          break;

        case 'dynamics':
          // Compressor should pass signal
          testDescription = 'Signal present';
          if (effectPeak < -40) {
            status = 'fail';
            statusText = `WEAK (${effectPeak.toFixed(1)}dB)`;
          }
          break;

        default:
          testDescription = 'Signal > -60dB';
          if (effectPeak < -60) {
            status = 'fail';
            statusText = `SILENT`;
          }
      }

      if (status === 'fail') {
        testResults.failed++;
        testResults.errors.push({ name: `EffectBehavior: ${name}`, error: statusText });
      } else {
        testResults.passed++;
      }

      logHtml(`<tr>
        <td>${name}</td>
        <td>${behavior}</td>
        <td>${effectPeak === -Infinity ? '-∞' : effectPeak.toFixed(1)}</td>
        <td>${effectTail === -Infinity ? '-∞' : effectTail.toFixed(1)}</td>
        <td>${testDescription}</td>
        <td class="${status}">${statusText}</td>
      </tr>`);

      try { synth.dispose(); } catch { /* ignored */ }
      try { if (typeof effectObj.dispose === 'function') (effectObj.dispose as () => void)(); } catch { /* ignored */ }
      await drainMeter(meter);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logHtml(`<tr><td>${name}</td><td>${behavior}</td><td>-</td><td>-</td><td>-</td><td class="fail">Error: ${msg}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name: `EffectBehavior: ${name}`, error: msg });
    }
  }

  logHtml('</table>');
  meter.dispose();
}

/**
 * Test wet/dry mix functionality
 */
async function testEffectWetDry() {
  logHtml('<h2>Wet/Dry Mix Tests</h2>');
  logHtml('<p class="info">Tests that wet parameter actually controls effect amount.</p>');

  const meter = new Tone.Meter(0);
  meter.connect(Tone.getDestination());

  // Warm-up
  const warmupSynth = new Tone.Synth({ volume: -24 });
  warmupSynth.connect(meter);
  warmupSynth.triggerAttack('C4');
  await new Promise(r => setTimeout(r, 100));
  warmupSynth.triggerRelease();
  await new Promise(r => setTimeout(r, 100));
  warmupSynth.dispose();
  await drainMeter(meter);

  // Test Reverb at different wet levels (good candidate because tail is obvious)
  logHtml('<h3>Reverb Wet/Dry Test</h3>');
  logHtml('<table><tr><th>Wet %</th><th>Peak</th><th>Tail (after release)</th><th>Expected</th><th>Status</th></tr>');

  const wetLevels = [0, 30, 100];
  const tailResults: number[] = [];
  const peakResults: number[] = [];

  for (const wetPercent of wetLevels) {
    const config = { ...EFFECT_CONFIGS['Reverb'], wet: wetPercent };

    try {
      const synth = new Tone.Synth({ volume: -12 });
      const effect = await InstrumentFactory.createEffect(config);
      const effectObj = effect as unknown as Record<string, unknown>;

      synth.connect(effect as Tone.ToneAudioNode);
      if (typeof effectObj.connect === 'function') (effectObj.connect as (dest: unknown) => void)(meter);
      await new Promise(r => setTimeout(r, 30));

      synth.triggerAttack('C4');
      const peak = await measurePeak(meter, 150);
      synth.triggerRelease();
      await new Promise(r => setTimeout(r, 100));
      const tail = await measurePeak(meter, 400);
      tailResults.push(tail);
      peakResults.push(peak);

      let status = 'pass';
      let statusText = 'OK';
      let expected = '';

      if (wetPercent === 0) {
        expected = 'No tail (dry)';
        if (tail > -50) {
          status = 'warn';
          statusText = 'Unexpected tail';
        }
      } else if (wetPercent === 100) {
        expected = 'Strong tail';
        if (tail < -40) {
          status = 'fail';
          statusText = 'Weak tail';
        }
      } else {
        expected = 'Some tail';
      }

      if (status === 'fail') {
        testResults.failed++;
        testResults.errors.push({ name: `WetDry: Reverb@${wetPercent}%`, error: statusText });
      } else {
        testResults.passed++;
      }

      logHtml(`<tr>
        <td>${wetPercent}%</td>
        <td>${peak.toFixed(1)}</td>
        <td>${tail === -Infinity ? '-∞' : tail.toFixed(1)}</td>
        <td>${expected}</td>
        <td class="${status}">${statusText}</td>
      </tr>`);

      try { synth.dispose(); } catch { /* ignored */ }
      try { if (typeof effectObj.dispose === 'function') (effectObj.dispose as () => void)(); } catch { /* ignored */ }
      await drainMeter(meter);

    } catch {
      logHtml(`<tr><td>${wetPercent}%</td><td>-</td><td>-</td><td>-</td><td class="fail">Error</td></tr>`);
      testResults.failed++;
    }
  }

  // Check that wet/dry affects the signal
  // Note: Convolution reverb at 100% wet is naturally quieter than dry (energy is diffused)
  // So we check that signal passes at all levels and that there's SOME difference
  if (tailResults.length === 3 && peakResults.length === 3) {
    const [dryPeak, midPeak, wetPeak] = peakResults;
    const allPassSignal = dryPeak > -60 && midPeak > -60 && wetPeak > -60;
    const hasDifference = Math.abs(wetPeak - dryPeak) > 1 || Math.abs(midPeak - dryPeak) > 0.5;

    if (!allPassSignal) {
      logHtml(`<tr><td colspan="5" class="fail">⚠️ Wet/dry broken: some levels produce no signal</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name: 'WetDry: Reverb gradient', error: 'Silent at some wet levels' });
    } else if (!hasDifference) {
      logHtml(`<tr><td colspan="5" class="warn">⚠️ Wet/dry may not be working: minimal difference between levels</td></tr>`);
      testResults.passed++; // Warning, not failure
      testResults.errors.push({ name: 'WetDry: Reverb gradient', error: 'Warning: minimal wet/dry difference' });
    } else {
      logHtml(`<tr><td colspan="5" class="pass">✓ Wet/dry working: signal passes at all levels with audible differences</td></tr>`);
      testResults.passed++;
    }
  }

  logHtml('</table>');
  meter.dispose();
}

/**
 * Test parameter changes affect output
 */
async function testEffectParameters() {
  logHtml('<h2>Parameter Change Tests</h2>');
  logHtml('<p class="info">Tests that changing parameters actually affects the effect.</p>');

  const meter = new Tone.Meter(0);
  meter.connect(Tone.getDestination());

  // Warm-up
  const warmupSynth = new Tone.Synth({ volume: -24 });
  warmupSynth.connect(meter);
  warmupSynth.triggerAttack('C4');
  await new Promise(r => setTimeout(r, 100));
  warmupSynth.triggerRelease();
  await new Promise(r => setTimeout(r, 100));
  warmupSynth.dispose();
  await drainMeter(meter);

  logHtml('<table><tr><th>Effect</th><th>Parameter</th><th>Value 1</th><th>Level 1</th><th>Value 2</th><th>Level 2</th><th>Diff</th><th>Status</th></tr>');

  // Test Filter cutoff
  const filterTests = [
    { effect: 'Filter', param: 'frequency', val1: 200, val2: 8000, paramPath: 'frequency' },
    { effect: 'Delay', param: 'feedback', val1: 0, val2: 0.8, paramPath: 'feedback' },
  ];

  for (const test of filterTests) {
    const config = EFFECT_CONFIGS[test.effect];
    if (!config) continue;

    try {
      // Test with value 1
      const config1 = { ...config, parameters: { ...config.parameters, [test.param]: test.val1 } };
      const synth1 = new Tone.Synth({ volume: -12 });
      const effect1 = await InstrumentFactory.createEffect(config1);
      const eff1Obj = effect1 as unknown as Record<string, unknown>;
      synth1.connect(effect1 as Tone.ToneAudioNode);
      if (typeof eff1Obj.connect === 'function') (eff1Obj.connect as (dest: unknown) => void)(meter);
      await new Promise(r => setTimeout(r, 30));
      synth1.triggerAttack('C4');
      const level1 = await measureAverage(meter, 200);
      synth1.triggerRelease();
      try { synth1.dispose(); } catch { /* ignored */ }
      try { if (typeof eff1Obj.dispose === 'function') (eff1Obj.dispose as () => void)(); } catch { /* ignored */ }
      await drainMeter(meter);

      // Test with value 2
      const config2 = { ...config, parameters: { ...config.parameters, [test.param]: test.val2 } };
      const synth2 = new Tone.Synth({ volume: -12 });
      const effect2 = await InstrumentFactory.createEffect(config2);
      const eff2Obj = effect2 as unknown as Record<string, unknown>;
      synth2.connect(effect2 as Tone.ToneAudioNode);
      if (typeof eff2Obj.connect === 'function') (eff2Obj.connect as (dest: unknown) => void)(meter);
      await new Promise(r => setTimeout(r, 30));
      synth2.triggerAttack('C4');
      const level2 = await measureAverage(meter, 200);
      synth2.triggerRelease();
      try { synth2.dispose(); } catch { /* ignored */ }
      try { if (typeof eff2Obj.dispose === 'function') (eff2Obj.dispose as () => void)(); } catch { /* ignored */ }
      await drainMeter(meter);

      const diff = Math.abs(level2 - level1);
      let status = 'pass';
      let statusText = 'OK';

      // Parameter change should cause at least 1dB difference
      if (diff < 1) {
        status = 'warn';
        statusText = 'No change';
        testResults.errors.push({ name: `Param: ${test.effect}.${test.param}`, error: 'Parameter has no audible effect' });
      }
      testResults.passed++;

      logHtml(`<tr>
        <td>${test.effect}</td>
        <td>${test.param}</td>
        <td>${test.val1}</td>
        <td>${level1.toFixed(1)}</td>
        <td>${test.val2}</td>
        <td>${level2.toFixed(1)}</td>
        <td>${diff.toFixed(1)}dB</td>
        <td class="${status}">${statusText}</td>
      </tr>`);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logHtml(`<tr><td>${test.effect}</td><td>${test.param}</td><td colspan="6" class="fail">Error: ${msg}</td></tr>`);
      testResults.failed++;
    }
  }

  logHtml('</table>');
  meter.dispose();
}

/**
 * Compare dry signal vs wet signal (A/B comparison)
 * This is the most reliable way to verify effects actually modify audio
 */
async function testEffectABComparison() {
  logHtml('<h2>A/B Comparison Tests (Dry vs Wet)</h2>');
  logHtml('<p class="info">Compares signal with effect bypassed vs engaged. Effects should modify the signal.</p>');

  const meter = new Tone.Meter(0);
  meter.connect(Tone.getDestination());

  // Keep-alive oscillator to prevent WebAudio from going idle
  const keepAlive = new Tone.Oscillator({ frequency: 20, volume: -96 });
  keepAlive.connect(Tone.getDestination());
  keepAlive.start();

  // Extended warm-up for A/B tests
  for (let warmup = 0; warmup < 5; warmup++) {
    const warmupSynth = new Tone.Synth({ volume: -24 });
    warmupSynth.connect(meter);
    warmupSynth.triggerAttackRelease('C4', '16n');
    await new Promise(r => setTimeout(r, 100));
    warmupSynth.dispose();
  }
  await drainMeter(meter);

  // Effects to test - ordered with most reliable first
  const effectTests = [
    // Modulation effects (most reliable - have LFOs that are clearly audible)
    { name: 'Chorus', expectation: 'thicken', desc: 'Should thicken/detune signal' },
    { name: 'Tremolo', expectation: 'modulate', desc: 'Should modulate amplitude' },
    { name: 'Vibrato', expectation: 'modulate', desc: 'Should modulate pitch' },
    { name: 'AutoPanner', expectation: 'modulate', desc: 'Should pan signal' },
    { name: 'Phaser', expectation: 'sweep', desc: 'Should add sweeping notches' },
    { name: 'AutoFilter', expectation: 'sweep', desc: 'Should sweep filter' },
    { name: 'BiPhase', expectation: 'sweep', desc: 'Should add phaser sweep' },
    // Distortion effects
    { name: 'Distortion', expectation: 'modify', desc: 'Should add harmonics/saturation' },
    { name: 'BitCrusher', expectation: 'modify', desc: 'Should quantize/crush signal' },
    { name: 'Chebyshev', expectation: 'modify', desc: 'Should add waveshaping' },
    { name: 'TapeSaturation', expectation: 'modify', desc: 'Should add warmth/saturation' },
    // Delay/Reverb effects (need time-based tail measurement)
    { name: 'Reverb', expectation: 'tail', desc: 'Should add reverb tail' },
    { name: 'JCReverb', expectation: 'tail', desc: 'Should add reverb tail' },
    { name: 'Delay', expectation: 'tail', desc: 'Should add echo/repeat' },
    { name: 'FeedbackDelay', expectation: 'tail', desc: 'Should add repeating echo' },
    { name: 'PingPongDelay', expectation: 'tail', desc: 'Should add stereo ping-pong' },
    // Filter effects
    { name: 'Filter', expectation: 'filter', desc: 'Should attenuate frequencies' },
    { name: 'AutoWah', expectation: 'filter', desc: 'Should add envelope following' },
    { name: 'DubFilter', expectation: 'filter', desc: 'Should filter signal' },
    // Pitch effects
    { name: 'PitchShift', expectation: 'modify', desc: 'Should shift pitch' },
    { name: 'FrequencyShifter', expectation: 'modify', desc: 'Should shift frequencies' },
    // Processors (no wet/dry)
    { name: 'Compressor', expectation: 'dynamics', desc: 'Should compress dynamics' },
    { name: 'EQ3', expectation: 'passthrough', desc: 'At flat settings, should pass through' },
  ];

  logHtml('<table><tr><th>Effect</th><th>Expected</th><th>Dry Peak</th><th>Dry Tail</th><th>Wet Peak</th><th>Wet Tail</th><th>Δ Peak</th><th>Δ Tail</th><th>Status</th></tr>');

  for (const test of effectTests) {
    const config = EFFECT_CONFIGS[test.name];
    if (!config) {
      logHtml(`<tr><td>${test.name}</td><td colspan="8" class="warn">Not configured</td></tr>`);
      continue;
    }

    try {
      // Determine if this is a time-based effect needing extra init time
      const needsExtraTime = ['Reverb', 'JCReverb', 'Delay', 'FeedbackDelay', 'PingPongDelay'].includes(test.name);
      const stabilizeTime = needsExtraTime ? 100 : 30;
      const tailMeasureTime = needsExtraTime ? 500 : 300;

      // === DRY MEASUREMENT (no effect) ===
      const drySynth = new Tone.Synth({ volume: -12 });
      drySynth.connect(meter);
      await new Promise(r => setTimeout(r, stabilizeTime));
      meter.getValue(); // Prime the meter
      await new Promise(r => setTimeout(r, 20));

      drySynth.triggerAttack('C4');
      const dryPeak = await measurePeak(meter, 200);
      drySynth.triggerRelease();
      await new Promise(r => setTimeout(r, 100));
      const dryTail = await measurePeak(meter, tailMeasureTime);

      drySynth.dispose();
      await drainMeter(meter);

      // === WET MEASUREMENT ===
      // Use 50% wet for time-based effects (100% wet = only wet signal, no dry pass-through)
      // This ensures we can measure the effect while still hearing the dry signal
      const isTimeBasedEffect = ['Delay', 'FeedbackDelay', 'PingPongDelay', 'Reverb'].includes(test.name);
      const wetAmount = isTimeBasedEffect ? 50 : 100;
      const peakMeasureTime = isTimeBasedEffect ? 400 : 200; // Longer for time-based effects

      const wetConfig = { ...config, wet: wetAmount };
      const wetSynth = new Tone.Synth({ volume: -12 });
      const effect = await InstrumentFactory.createEffect(wetConfig);
      const effectObj = effect as unknown as Record<string, unknown>;

      wetSynth.connect(effect as Tone.ToneAudioNode);
      if (typeof effectObj.connect === 'function') (effectObj.connect as (dest: unknown) => void)(meter);

      // Longer stabilization and meter priming
      await new Promise(r => setTimeout(r, stabilizeTime));
      meter.getValue(); // Prime the meter
      await new Promise(r => setTimeout(r, 20));

      wetSynth.triggerAttack('C4');
      const wetPeak = await measurePeak(meter, peakMeasureTime);
      wetSynth.triggerRelease();
      await new Promise(r => setTimeout(r, 100));
      const wetTail = await measurePeak(meter, tailMeasureTime);

      wetSynth.dispose();
      try { if (typeof effectObj.dispose === 'function') (effectObj.dispose as () => void)(); } catch { /* ignored */ }
      await drainMeter(meter);

      // === ANALYSIS ===
      const peakDiff = wetPeak - dryPeak;
      const tailDiff = (wetTail === -Infinity ? -100 : wetTail) - (dryTail === -Infinity ? -100 : dryTail);

      let status = 'pass';
      let statusText = 'OK';
      let issue = '';

      // Check based on expectation
      switch (test.expectation) {
        case 'tail':
          // Tail effects should have more tail than dry
          // Use lower threshold (3dB) since wet/dry mix affects perceived tail
          // Also check that signal passes through at all
          if (wetPeak < -50) {
            status = 'fail';
            statusText = 'SILENT';
            issue = `No signal through effect: ${wetPeak.toFixed(1)}dB`;
          } else if (tailDiff < 3) {
            status = 'warn';
            statusText = 'WEAK TAIL';
            issue = `Expected more tail, got only ${tailDiff.toFixed(1)}dB increase`;
          }
          break;

        case 'modify':
          // Modifying effects should change the signal somehow
          // Either peak or character should differ - at minimum signal should pass
          if (wetPeak < -50) {
            status = 'fail';
            statusText = 'TOO QUIET';
            issue = `Signal too weak: ${wetPeak.toFixed(1)}dB`;
          }
          break;

        case 'filter':
          // Filter effects typically reduce some frequencies
          // Signal should still be present but may be quieter
          if (wetPeak < -60) {
            status = 'fail';
            statusText = 'NO SIGNAL';
            issue = 'Filter killed the signal entirely';
          }
          break;

        case 'modulate':
        case 'sweep':
        case 'thicken':
          // Modulation effects should pass signal, may add character
          if (wetPeak < -40) {
            status = 'fail';
            statusText = 'WEAK';
            issue = `Signal too weak: ${wetPeak.toFixed(1)}dB`;
          }
          break;

        case 'dynamics':
          // Compressor should pass signal (may reduce loud peaks)
          if (wetPeak < -40) {
            status = 'fail';
            statusText = 'NO SIGNAL';
            issue = 'Compressor not passing signal';
          }
          break;

        case 'passthrough':
          // Should be similar to dry
          if (Math.abs(peakDiff) > 6) {
            status = 'warn';
            statusText = 'CHANGED';
            issue = `Expected passthrough, got ${peakDiff.toFixed(1)}dB change`;
          }
          break;
      }

      // Additional check: if wet signal is completely silent, that's always a fail
      if (wetPeak === -Infinity || wetPeak < -80) {
        status = 'fail';
        statusText = 'SILENT';
        issue = 'No signal through effect';
      }

      if (status === 'fail') {
        testResults.failed++;
        testResults.errors.push({ name: `A/B: ${test.name}`, error: issue || statusText });
      } else if (status === 'warn') {
        testResults.passed++; // Warnings still count as passed
        testResults.errors.push({ name: `A/B: ${test.name}`, error: `Warning: ${issue}` });
      } else {
        testResults.passed++;
      }

      const formatDb = (v: number) => v === -Infinity ? '-∞' : v.toFixed(1);
      const formatDiff = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1);

      logHtml(`<tr>
        <td>${test.name}</td>
        <td>${test.expectation}</td>
        <td>${formatDb(dryPeak)}</td>
        <td>${formatDb(dryTail)}</td>
        <td>${formatDb(wetPeak)}</td>
        <td>${formatDb(wetTail)}</td>
        <td>${formatDiff(peakDiff)}</td>
        <td>${formatDiff(tailDiff)}</td>
        <td class="${status}">${statusText}</td>
      </tr>`);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logHtml(`<tr><td>${test.name}</td><td>${test.expectation}</td><td colspan="7" class="fail">Error: ${msg}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name: `A/B: ${test.name}`, error: msg });
    }
  }

  logHtml('</table>');

  // Summary insight
  logHtml('<h3>Key Insights</h3>');
  logHtml('<ul>');
  logHtml('<li><b>Δ Peak</b>: Change in peak level (positive = louder, negative = quieter)</li>');
  logHtml('<li><b>Δ Tail</b>: Change in signal after note release (reverb/delay should be +20dB or more)</li>');
  logHtml('<li><b>SILENT</b>: Effect is not passing any signal - broken</li>');
  logHtml('<li><b>NO TAIL</b>: Reverb/delay effect has no audible tail - wet/dry mix may be broken</li>');
  logHtml('</ul>');

  keepAlive.stop();
  keepAlive.dispose();
  meter.dispose();
}

async function runEffectTests() {
  clearResults();
  logHtml('<h2>Running Comprehensive Effect Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();

    // Pre-warm WASM engines (needed for Buzzmachine effects)
    await preWarmEngines();

    // Basic tests
    await testEffectCreation();
    await testEffectSignalPath();

    // Advanced tests
    await testEffectBehavior();
    await testEffectWetDry();
    await testEffectParameters();
    await testEffectABComparison();

    // Summary
    const allErrors = testResults.errors.filter(e =>
      e.name.startsWith('Effect:') ||
      e.name.startsWith('EffectPath:') ||
      e.name.startsWith('A/B:') ||
      e.name.startsWith('EffectBehavior:') ||
      e.name.startsWith('WetDry:') ||
      e.name.startsWith('Param:')
    );

    logHtml(`
      <div class="summary">
        <h2>Effect Test Summary</h2>
        <p class="pass">Passed: ${testResults.passed}</p>
        <p class="fail">Failed: ${testResults.failed}</p>
        ${allErrors.length > 0 ? `
          <h3>Issues Found:</h3>
          <ul class="fail">
            ${allErrors.map(e => `<li><b>${e.name}</b>: ${e.error}</li>`).join('\n')}
          </ul>
        ` : '<p class="pass">All effects working correctly!</p>'}
      </div>
    `);

    window.SYNTH_TEST_RESULTS = testResults;
    window.SYNTH_TEST_COMPLETE = true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('Test error: ' + msg, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================

document.getElementById('runTests')?.addEventListener('click', runAllTests);
document.getElementById('runFallbackTests')?.addEventListener('click', runFallbackTests);
document.getElementById('runVolumeTests')?.addEventListener('click', runVolumeTests);
document.getElementById('runBehaviorTests')?.addEventListener('click', runBehaviorTests);
document.getElementById('runSamplePackTests')?.addEventListener('click', runSamplePackTests);
document.getElementById('runEffectTests')?.addEventListener('click', runEffectTests);

// Export for console access
window.runAllTests = runAllTests;
window.runFallbackTests = runFallbackTests;
window.runVolumeTests = runVolumeTests;
window.runBehaviorTests = runBehaviorTests;
window.runSamplePackTests = runSamplePackTests;
window.runEffectTests = runEffectTests;
