/**
 * Volume normalization for synth types.
 * Shared across all sub-factories.
 */

export const VOLUME_NORMALIZATION_OFFSETS: Record<string, number> = {
  // Tone.js built-in synths - recalibrated 2026-03-05 via browser test runner
  'Synth': 5,            // Measured: -4.3dB → target -10dB
  'MonoSynth': 2,        // Measured: 1.6dB → target -10dB
  'DuoSynth': 6,         // Measured: -10.8dB → on target
  'FMSynth': 16,         // Measured: -9.9dB → on target
  'ToneAM': 22,         // Measured: -9.8dB → on target
  'PluckSynth': 19,      // Measured: 3.4dB → target -10dB
  'MetalSynth': 17,      // Measured: -3.8dB → target -10dB
  'MembraneSynth': 3,    // Measured: -3.2dB → target -10dB
  'NoiseSynth': 2,       // Measured: -4.7dB → target -10dB
  'PolySynth': 8,        // Measured: -10.3dB → on target
  'HarmonicSynth': -5,   // Measured: -5.5dB → target -10dB
  // Custom synths (WASM and specialized engines) - recalibrated 2026-03-05
  'TB303': 1,            // Measured: 4.0dB → target -10dB
  'JC303': 1,            // Same engine as TB303
  'Buzz3o3': 2,         // Measured: -12.2dB @ offset 0 → target -10dB
  'Furnace': 0,          // Generic Furnace - WASM dispatcher, no chip-specific output
  // Furnace FM chips - recalibrated 2026-02-13 via browser test runner
  'FurnaceOPN': 3,       // Measured: -6.4dB → target -10dB
  'FurnaceOPM': -4,      // Measured: -11.9dB → target -10dB
  'FurnaceOPL': 9,       // Measured: -16.8dB → target -10dB
  'FurnaceOPLL': 24,     // Measured: -32.5dB → target -10dB
  'FurnaceESFM': 8,      // Measured: -13.4dB → target -10dB
  'FurnaceOPZ': -4,      // Measured: -19.8dB → target -10dB
  'FurnaceOPNA': 2,      // Measured: -23.1dB → target -10dB
  'FurnaceOPNB': 2,      // Measured: -21.8dB → target -10dB
  'FurnaceOPL4': 17,     // Measured: -34.8dB → target -10dB
  'FurnaceY8950': 9,     // Measured: -23.6dB → target -10dB (was silent, fixed chipType + ymfm core)
  'FurnaceVRC7': 24,     // Measured: -40.1dB → target -10dB
  'FurnaceOPN2203': -4,  // Measured: -29.1dB → target -10dB
  'FurnaceOPNBB': 2,     // Measured: -33.1dB → target -10dB
  // Furnace Dispatch chips - recalibrated 2026-02-13 via browser test runner
  'FurnaceNES': 7,       // Measured: -9.8dB → on target
  'FurnaceGB': 4,        // Measured: -9.6dB → on target
  'FurnaceSNES': 2,      // Measured: -21.8dB → target -10dB
  'FurnacePCE': 0,       // Measured: -5.3dB → target -10dB
  'FurnacePSG': 3,       // Measured: -9.1dB → on target
  'FurnaceVB': 16,       // Measured: -9.7dB → on target
  'FurnaceLynx': -1,     // Measured: -5.9dB → target -10dB
  'FurnaceSWAN': 4,      // Measured: -9.9dB → on target
  'FurnaceVRC6': 3,      // Measured: -9.6dB → on target
  'FurnaceN163': 7,      // Measured: -10.5dB → on target
  'FurnaceFDS': 3,       // Measured: -8.2dB → on target
  'FurnaceMMC5': 37,     // Measured: -9.8dB → on target
  'FurnaceGBA': -10,     // Measured: -10.0dB → on target
  'FurnaceNDS': 3,       // Measured: -8.6dB → on target
  'FurnacePOKEMINI': -10, // Measured: -10.0dB → on target
  'FurnaceC64': 19,      // Measured: -13.1dB → target -10dB
  'FurnaceSID6581': 19,  // Measured: -13.4dB → target -10dB
  'FurnaceSID8580': 19,  // Measured: -12.4dB → target -10dB
  'FurnaceAY': 3,        // Measured: -9.0dB → on target
  'FurnaceAY8930': 25,   // Measured: -32.4dB → need +22dB
  'FurnaceVIC': -1,      // Measured: -6.4dB → need -4dB (was +3, overcorrected)
  'FurnaceSAA': 6,       // Measured: -9.5dB → on target
  'FurnaceTED': -4,      // Measured: -10.0dB → on target
  'FurnaceVERA': 17,     // Measured: -12.5dB → target -10dB
  'FurnaceSCC': 9,       // Measured: -9.7dB → on target
  'FurnaceTIA': -7,      // Measured: -10.4dB → on target
  'FurnaceAMIGA': -4,    // Recalibrated 2026-02-28
  'FurnacePET': -10,     // Measured: -10.0dB → on target
  'FurnacePCSPKR': -10,  // Measured: -10.0dB → on target
  'FurnaceZXBEEPER': -4, // Measured: -10.2dB → on target
  'FurnacePOKEY': 7,     // Measured: -9.7dB → on target
  'FurnacePONG': -10,    // Measured: -10.0dB → on target
  'FurnacePV1000': 3,    // Measured: -9.6dB → on target
  'FurnaceDAVE': 2,      // Recalibrated 2026-02-28
  'FurnaceSU': 8,        // Recalibrated 2026-02-28
  'FurnacePOWERNOISE': -4, // Measured: -10.4dB → on target
  'FurnaceSEGAPCM': -5,  // Measured: -10.4dB → on target
  'FurnaceQSOUND': 4,    // Recalibrated 2026-02-28
  'FurnaceES5506': 38,   // Recalibrated 2026-02-28
  'FurnaceRF5C68': -4,   // Measured: -1.99dB raw → -14.0@-8 → target -10dB (fixed setFlags bug)
  'FurnaceC140': 8,      // Recalibrated 2026-02-28
  'FurnaceK007232': -4,  // Measured: -9.9dB → on target
  'FurnaceK053260': -1,  // Recalibrated 2026-02-28
  'FurnaceGA20': -3,     // Measured: -3.8dB → target -10dB
  'FurnaceOKI': 2,       // Recalibrated 2026-02-28
  'FurnaceYMZ280B': 14,  // Recalibrated 2026-02-28
  'FurnaceX1_010': 15,   // Measured: -9.6dB → on target
  'FurnaceMSM6258': -10, // Measured: -10.1dB → on target
  'FurnaceMSM5232': 10,  // Measured: -9.8dB → on target
  'FurnaceMULTIPCM': 14, // Recalibrated 2026-02-28
  'FurnaceNAMCO': 0,     // Measured: -25.1dB (volatile output, split diff)
  'FurnacePCMDAC': -5,   // Recalibrated 2026-02-28
  'FurnaceBUBBLE': 3,    // Measured: -9.5dB → on target
  'FurnaceSM8521': 2,    // Measured: -3.4dB → target -10dB
  'FurnaceT6W28': 3,     // Measured: -8.3dB → on target
  'FurnaceSUPERVISION': -1, // Measured: -6.2dB → need -4dB (was +3, overcorrected)
  'FurnaceUPD1771': 3,   // Measured: -4.2dB → target -10dB
  'FurnaceSCVTONE': 3,   // Measured: -8.1dB → on target
  'BuzzKick': 3,         // Calibrated with output gain: measured -13.1dB, target -10
  'BuzzKickXP': 5,       // Calibrated with output gain: measured -21.7dB, target -10
  'BuzzNoise': 7,        // Calibrated with output gain: measured -22.3dB, target -10
  'BuzzTrilok': 5,       // Calibrated with output gain: measured -22.4dB, target -10
  'Buzz4FM2F': 7,        // Calibrated with output gain: measured -21.2dB, target -10
  'BuzzFreqBomb': 4,     // Calibrated with output gain: measured -21.3dB, target -10
  'Buzz3o3DF': 2,       // Measured: -12.2dB @ offset 0 → target -10dB
  'Synare': -4,          // Measured: 1.2dB → target -10dB
  'DubSiren': 7,         // Measured: -4.2dB → target -10dB
  'SpaceLaser': 17,      // Measured: -3.1dB → target -10dB (required reverb .ready await)
  'V2': 0,               // Reset to 0 - WASM doesn't init in test, was unmeasured guess of 30
  'Sam': 8,              // Measured: -2.3dB → target -10dB
  'DECtalk': 10,          // WAV output is quiet — boost to match other speech synths
  'PinkTrombone': 6,      // Vocal tract model runs quiet — boost to audible level
  'SuperSaw': 6,         // Measured: -7.3dB → target -10dB
  'WobbleBass': 12,      // Measured: -9.4dB → on target
  'FormantSynth': -1,    // Measured: -0.5dB → target -10dB
  'StringMachine': 7,    // Measured: -5.8dB → target -10dB
  'PWMSynth': 4,         // Measured: -4.9dB → target -10dB
  'ChipSynth': 4,        // Measured: -8.9dB → target -10dB
  'Wavetable': -3,       // Measured: -2.3dB → target -10dB
  'Organ': 3,            // Measured: -10.3dB → on target
  'Sampler': 10,         // Measured: -20.3dB → increase 10
  'Player': 10,          // Measured 2026-02-05: peak -19.6dB → need +10dB delta
  'GranularSynth': -47,  // Measured 2026-02-05: peak +45dB at offset 8 → need -55dB delta (engine runs very hot)
  'DrumMachine': 18,     // Measured 2026-02-05: peak -18.4dB at offset 10 → need +8dB delta
  'ChiptuneModule': -6,  // Measured: -3.8dB → decrease 6
  'DrumKit': 0,          // Kept (test sample may not load)
  // MAME/WASM synths - CAUTION: test runner can't measure these (WASM doesn't init in test)
  // These offsets are GUESSES. Only Dexed reliably inits in test environment.
  'MAMEVFX': 0,          // Reset to 0 - was unmeasured guess of 8
  'MAMEDOC': 0,          // Reset to 0 - was unmeasured guess of 8
  'MAMERSA': 0,          // Reset to 0 - was unmeasured guess of 8
  'MAMESWP30': 0,        // Reset to 0 - was unmeasured guess of 8
  'CZ101': 0,            // Reset to 0 - was unmeasured guess of 10
  'MdaEPiano': 6,        // Initial estimate — Rhodes is naturally quiet
  'MdaJX10': 4,          // Initial estimate
  'MdaDX10': 4,          // Initial estimate
  'RaffoSynth': 4,       // Minimoog clone
  'CalfMono': 4,         // Calf Monosynth — initial estimate
  'SetBfree': 6,         // setBfree Hammond B3 — organ can be loud
  'SynthV1': 4,          // SynthV1 4-osc poly — initial estimate
  'Monique': 5,          // Monique morphing mono — initial estimate
  'Amsynth': 3,          // AMSynth analog modelling — moderate output
  'VL1': 3,              // Casio VL-Tone — low output wavetable synth
  'TalNoizeMaker': 4,   // TAL-NoiseMaker VA — initial estimate
  'Aeolus': 6,           // Pipe organ — can be loud
  'FluidSynth': 4,       // SF2 player — depends on soundfont
  'Sfizz': 4,            // SFZ player — depends on samples
  'ZynAddSubFX': 5,      // Mega-synth — can be loud
  'SuperCollider': 2,   // Measured: -22.3dB @ offset -10 → adjusted to target -10dB
  'CEM3394': 14,         // Recalibrated 2026-02-28
  'SCSP': 1,             // Recalibrated 2026-02-28
  // MAME chip synths - calibrated 2026-02-07 via browser test runner
  'MAMEAstrocade': 16,   // Measured: -16.0dB → target -10dB
  'MAMESN76477': 5,      // Measured: -15.0dB → need +5dB
  'MAMEASC': 9,          // Measured: -16.6dB → target -10dB
  'MAMEES5503': 54,      // Measured: -15.6dB → target -10dB
  'MAMEMEA8000': 8,      // Recalibrated 2026-02-28
  'MAMESNKWave': 2,      // Recalibrated 2026-02-28
  'MAMESP0250': 7,       // Recalibrated 2026-02-28
  'MAMETMS36XX': -1,     // Recalibrated 2026-02-28
  'MAMEVotrax': 12,      // Recalibrated 2026-02-28
  'MAMEYMOPQ': 12,       // Measured: -12.7dB → target -10dB
  'MAMEUPD931': 18,      // Recalibrated 2026-02-28
  'MAMEUPD933': 16,      // Recalibrated 2026-02-28
  'MAMETMS5220': 4,      // Recalibrated 2026-02-28
  'MAMEYMF271': 14,      // Measured: -16.0dB → target -10dB
  'MAMETR707': 22,       // Measured 2026-02-07: -31.6dB → need +22dB
  'MAMEVASynth': 15,     // Measured: -13.0dB → target -10dB
  'MAMECMI': 0,          // TBD — needs calibration once WASM is compiled
  'MAMEFZPCM': 0,        // TBD — needs calibration once WASM is compiled
  'MAMEPS1SPU': 0,       // TBD — needs calibration once WASM is compiled
  'MAMEZSG2': 0,         // TBD — needs calibration once WASM is compiled
  'MAMEKS0164': 0,       // TBD — needs calibration once WASM is compiled
  'MAMESWP00': 0,        // TBD — needs calibration once WASM is compiled
  'MAMESWP20': 0,        // TBD — needs calibration once WASM is compiled
  'MAMERolandGP': 0,     // TBD — needs calibration once WASM is compiled
  'MAMEICS2115': 30,     // Recalibrated 2026-02-28
  'MAMEK054539': 19,     // Recalibrated 2026-02-28
  'MAMEC352': 17,        // Measured 2026-02-07: -26.7dB → need +17dB
  'MAMERF5C400': 0,      // Silent (sample-playback chip, needs ROM + mapping)
  'ModularSynth': 6,     // Measured: -15.5dB → target -10dB
  'HivelySynth': 1,     // Measured: -11.0dB → target -10dB
  'JamCrackerSynth': 0, // JamCracker WASM replayer — volume managed internally
  'OctaMEDSynth': 0,   // OctaMED synth instrument — volume managed internally
  'UADESynth': 0,       // UADE exotic Amiga player — volume managed internally
  'SunVoxSynth': 0,     // SunVox WASM patch player — volume managed internally
  'SunVoxModular': 0,   // SunVox modular — volume managed internally
  'KlysSynth': 0,       // Klystrack — volume managed internally
  'Sc68Synth': 0,       // SC68/SNDH — volume managed internally
  'ZxtuneSynth': 0,     // ZXTune — volume managed internally
  'WaveSabreSynth': 0,  // WaveSabre (XRNS) — volume managed internally
  'OidosSynth': 0,      // Oidos (XRNS) — volume managed internally
  'TunefishSynth': 0,   // Tunefish (XRNS) — volume managed internally
  'V2Speech': 0,        // V2 Speech module — uses V2 engine
  'MusicLineSynth': 0,  // MusicLine — volume managed internally
  'SymphonieSynth': 0,  // Symphonie — volume managed internally
  'FuturePlayerSynth': 0, // Future Player — volume managed internally
  'MAMES14001A': 10,    // SSi S14001A speech — quiet output
  'MAMEVLM5030': 8,     // Konami VLM5030 speech — quiet output
  'MAMEHC55516': 6,     // Harris HC55516 CVSD — quiet output
  'MAMEMultiPCM': 0,    // MultiPCM — TBD
};

/**
 * Get the normalized volume for a synth type
 * Applies synth-specific offset to achieve consistent output levels
 */
export function getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
  const baseVolume = configVolume ?? -12;
  const offset = VOLUME_NORMALIZATION_OFFSETS[synthType] ?? 0;
  return baseVolume + offset;
}
