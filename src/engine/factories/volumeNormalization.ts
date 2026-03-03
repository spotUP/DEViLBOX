/**
 * Volume normalization for synth types.
 * Shared across all sub-factories.
 */

export const VOLUME_NORMALIZATION_OFFSETS: Record<string, number> = {
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
  'FurnaceOPM': -6,      // Recalibrated 2026-02-28
  'FurnaceOPL': 2,       // Recalibrated 2026-02-28
  'FurnaceOPLL': 1,      // Recalibrated 2026-02-28
  'FurnaceESFM': 5,      // Recalibrated 2026-02-28
  'FurnaceOPZ': -14,     // Measured: +3.8dB → need -14dB
  'FurnaceOPNA': -11,    // Recalibrated 2026-02-28
  'FurnaceOPNB': -10,    // Recalibrated 2026-02-28
  'FurnaceOPL4': -8,     // Recalibrated 2026-02-28
  'FurnaceY8950': -5,    // Recalibrated 2026-02-28
  'FurnaceVRC7': -6,     // Recalibrated 2026-02-28
  'FurnaceOPN2203': -23, // Recalibrated 2026-02-28
  'FurnaceOPNBB': -21,   // Recalibrated 2026-02-28
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
  'FurnaceC64': 16,      // Recalibrated 2026-02-28
  'FurnaceSID6581': 16,  // Recalibrated 2026-02-28
  'FurnaceSID8580': 17,  // Recalibrated 2026-02-28
  'FurnaceAY': 3,        // Measured: -9.0dB → on target
  'FurnaceAY8930': 25,   // Measured: -32.4dB → need +22dB
  'FurnaceVIC': -1,      // Measured: -6.4dB → need -4dB (was +3, overcorrected)
  'FurnaceSAA': 6,       // Measured: -9.5dB → on target
  'FurnaceTED': -4,      // Measured: -10.0dB → on target
  'FurnaceVERA': 14,     // Measured: -13.4dB → need +3dB
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
  'FurnaceRF5C68': 0,    // Silent - sample format mismatch (needs signed magnitude)
  'FurnaceC140': 8,      // Recalibrated 2026-02-28
  'FurnaceK007232': -4,  // Measured: -9.9dB → on target
  'FurnaceK053260': -1,  // Recalibrated 2026-02-28
  'FurnaceGA20': 3,      // Silent - sample format mismatch (needs unsigned 8-bit)
  'FurnaceOKI': 2,       // Recalibrated 2026-02-28
  'FurnaceYMZ280B': 14,  // Recalibrated 2026-02-28
  'FurnaceX1_010': 15,   // Measured: -9.6dB → on target
  'FurnaceMSM6258': -10, // Measured: -10.1dB → on target
  'FurnaceMSM5232': 10,  // Measured: -9.8dB → on target
  'FurnaceMULTIPCM': 14, // Recalibrated 2026-02-28
  'FurnaceNAMCO': 0,     // Recalibrated 2026-02-28
  'FurnacePCMDAC': -5,   // Recalibrated 2026-02-28
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
  'CEM3394': 14,         // Recalibrated 2026-02-28
  'SCSP': 1,             // Recalibrated 2026-02-28
  // MAME chip synths - calibrated 2026-02-07 via browser test runner
  'MAMEAstrocade': 10,   // Recalibrated 2026-02-28
  'MAMESN76477': 5,      // Measured: -15.0dB → need +5dB
  'MAMEASC': 2,          // Recalibrated 2026-02-28
  'MAMEES5503': 48,      // Recalibrated 2026-02-28
  'MAMEMEA8000': 8,      // Recalibrated 2026-02-28
  'MAMESNKWave': 2,      // Recalibrated 2026-02-28
  'MAMESP0250': 7,       // Recalibrated 2026-02-28
  'MAMETMS36XX': -1,     // Recalibrated 2026-02-28
  'MAMEVotrax': 12,      // Recalibrated 2026-02-28
  'MAMEYMOPQ': 9,        // Recalibrated 2026-02-28
  'MAMEUPD931': 18,      // Recalibrated 2026-02-28
  'MAMEUPD933': 16,      // Recalibrated 2026-02-28
  'MAMETMS5220': 4,      // Recalibrated 2026-02-28
  'MAMEYMF271': 8,       // Recalibrated 2026-02-28
  'MAMETR707': 22,       // Measured 2026-02-07: -31.6dB → need +22dB
  'MAMEVASynth': 12,     // Recalibrated 2026-02-28
  'MAMEAICA': 0,         // Silent (sample-playback chip, needs ROM + mapping)
  'MAMEICS2115': 30,     // Recalibrated 2026-02-28
  'MAMEK054539': 19,     // Recalibrated 2026-02-28
  'MAMEC352': 17,        // Measured 2026-02-07: -26.7dB → need +17dB
  'MAMERF5C400': 0,      // Silent (sample-playback chip, needs ROM + mapping)
  'ModularSynth': 0,     // Not yet calibrated
  'HivelySynth': 0,     // WASM song player — volume managed internally
  'JamCrackerSynth': 0, // JamCracker WASM replayer — volume managed internally
  'OctaMEDSynth': 0,   // OctaMED synth instrument — volume managed internally
  'UADESynth': 0,       // UADE exotic Amiga player — volume managed internally
  'SunVoxSynth': 0,     // SunVox WASM patch player — volume managed internally
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
