/**
 * Buzzmachine Factory Presets
 * Formats internal Buzzmachine presets into standard InstrumentConfig objects
 * for inclusion in the main factory preset list.
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { BUZZMACHINE_PRESETS } from './buzzmachinePresets';
import { BuzzmachineType } from '../engine/buzzmachines/BuzzmachineEngine';

// List of Generator types to include in main presets
const GENERATOR_TYPES = [
  BuzzmachineType.FSM_KICK,
  BuzzmachineType.FSM_KICKXP,
  BuzzmachineType.JESKOLA_TRILOK,
  BuzzmachineType.JESKOLA_NOISE,
  BuzzmachineType.OOMEK_AGGRESSOR,
  BuzzmachineType.OOMEK_AGGRESSOR_DF,
  BuzzmachineType.MADBRAIN_4FM2F,
  BuzzmachineType.MADBRAIN_DYNAMITE6,
  BuzzmachineType.MAKK_M3,
  BuzzmachineType.MAKK_M4,
  BuzzmachineType.CYANPHASE_DTMF,
  BuzzmachineType.ELENZIL_FREQUENCYBOMB,
];

export const BUZZMACHINE_FACTORY_PRESETS: InstrumentPreset['config'][] = [];

// Iterate through generator types and convert their presets
for (const type of GENERATOR_TYPES) {
  const presets = BUZZMACHINE_PRESETS[type];
  if (presets) {
    for (const [presetName, config] of Object.entries(presets)) {
      // Create a nice display name
      const displayName = `Buzz ${presetName}`;
      
      BUZZMACHINE_FACTORY_PRESETS.push({
        name: displayName,
        type: 'synth',
        synthType: `Buzz${getShortName(type)}` as any, // Construct dynamic synth type or use 'Buzzmachine'
        // Ideally we use 'Buzzmachine' synthType but set the specific config
        // But InstrumentFactory supports specific types like 'BuzzKick'
        // Let's use the specific type names handled by InstrumentFactory
        volume: -10,
        pan: 0,
        effects: [],
        // We need to pass the config. For specific types, InstrumentFactory
        // often just takes parameters directly or uses the 'Buzzmachine' generic path.
        // Let's rely on InstrumentFactory handling 'BuzzKick', 'BuzzNoise' etc.
        // which it does by looking at config.parameters
        parameters: config.parameters as Record<string, number>,
      });
    }
  }
}

// Helper to map BuzzmachineType to InstrumentFactory SynthType string
// e.g. 'FSMKick' -> 'BuzzKick'
function getShortName(type: string): string {
  switch (type) {
    case BuzzmachineType.FSM_KICK: return 'Kick';
    case BuzzmachineType.FSM_KICKXP: return 'KickXP';
    case BuzzmachineType.JESKOLA_TRILOK: return 'Trilok';
    case BuzzmachineType.JESKOLA_NOISE: return 'Noise';
    case BuzzmachineType.OOMEK_AGGRESSOR: return 'Aggressor'; // Not directly supported in factory?
    // InstrumentFactory handles specific strings. Let's check InstrumentFactory.ts
    // It handles: BuzzDTMF, BuzzFreqBomb, BuzzKick, BuzzKickXP, BuzzNoise, BuzzTrilok,
    // Buzz4FM2F, BuzzDynamite6, BuzzM3, Buzz3o3, Buzz3o3DF, BuzzM4.
    // OomekAggressor maps to Buzz3o3.
    // OomekAggressorDF maps to Buzz3o3DF.
    
    // Mapping fix:
    case BuzzmachineType.OOMEK_AGGRESSOR: return '3o3'; // -> Buzz3o3
    case BuzzmachineType.OOMEK_AGGRESSOR_DF: return '3o3DF'; // -> Buzz3o3DF
    case BuzzmachineType.MADBRAIN_4FM2F: return '4FM2F';
    case BuzzmachineType.MADBRAIN_DYNAMITE6: return 'Dynamite6';
    case BuzzmachineType.MAKK_M3: return 'M3';
    case BuzzmachineType.MAKK_M4: return 'M4';
    case BuzzmachineType.CYANPHASE_DTMF: return 'DTMF';
    case BuzzmachineType.ELENZIL_FREQUENCYBOMB: return 'FreqBomb';
    default: return type;
  }
}
