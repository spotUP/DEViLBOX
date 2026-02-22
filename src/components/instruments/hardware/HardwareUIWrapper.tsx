/**
 * HardwareUIWrapper - Generic wrapper for hardware-accurate UIs
 *
 * Routes synth types to their appropriate hardware UI components.
 * Supports both dedicated hardware UIs (TB303, DX7, etc.) and
 * generic parameterized UIs (MAME Generic, Buzz Generic).
 */

import React from 'react';
import type { SynthType } from '@typedefs/instrument';
import { TR707Hardware } from './TR707Hardware';
import { TR808Hardware } from './TR808Hardware';
import { TB303Hardware } from './TB303Hardware';
import { D50Hardware } from './D50Hardware';
import { CZ101Hardware } from './CZ101Hardware';
import { VFXHardware } from './VFXHardware';
import { DX7Hardware } from './DX7Hardware';
import { OBXdHardware } from './OBXdHardware';
import { MAMEGenericHardware } from './MAMEGenericHardware';
import { BuzzGenericHardware } from './BuzzGenericHardware';
import { VSTBridgeGenericHardware, isVSTBridgeType } from './VSTBridgeGenericHardware';

interface HardwareUIWrapperProps {
  synthType: SynthType;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

type HWComponentProps = {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
  synthType?: SynthType;
};

/**
 * Map of synth types to their dedicated hardware UI components.
 * These have custom-built UIs for specific synths.
 */
const DEDICATED_UI_MAP: Partial<Record<SynthType, React.ComponentType<HWComponentProps>>> = {
  // Drum Machines
  MAMETR707: TR707Hardware,
  DrumMachine: TR808Hardware,   // Roland TR-808/909 Rhythm Composers (1980/1983)

  // Synthesizers - Classic
  TB303: TB303Hardware,         // Roland TB-303 Bass Line (1981)
  CZ101: CZ101Hardware,         // Casio CZ-101 Phase Distortion (1984)
  Dexed: DX7Hardware,           // Yamaha DX7 FM Synthesis (1983)
  OBXd: OBXdHardware,           // Oberheim OB-X Analog (1979)

  // Synthesizers - MAME (dedicated)
  MAMERSA: D50Hardware,         // Roland D-50 LA Synthesis (1987)
  MAMEVFX: VFXHardware,         // Ensoniq VFX Wavetable (1989)
};

/**
 * MAME chip synths that use the MAMEGenericHardware (SDL2 WASM) module.
 * These all share the same parameterized C module with chip-specific
 * parameter metadata from chipParameters.ts.
 */
const MAME_GENERIC_TYPES: SynthType[] = [
  // Sound generators
  'MAMEAstrocade',    // Bally Astrocade Custom I/O (1977)
  'MAMESN76477',      // TI SN76477 Complex Sound Generator (1978)
  'MAMEASC',          // Apple Sound Chip (1987)
  'MAMEES5503',       // Ensoniq DOC 32-Voice Wavetable (1986)
  'MAMEMSM5232',      // OKI MSM5232 8-Voice Organ
  'MAMESNKWave',      // SNK Programmable Waveform
  'MAMETMS36XX',      // TI TMS36XX Tone Matrix Organ
  'MAMETIA',          // Atari 2600 TIA
  'MAMEVASynth',      // Virtual Analog Modeling

  // Speech synthesizers
  'MAMEMEA8000',      // Philips MEA8000 LPC Speech
  'MAMESP0250',       // GI SP0250 Digital LPC Speech
  'MAMETMS5220',      // TI TMS5220 Speak & Spell
  'MAMEVotrax',       // Votrax SC-01 Formant Speech

  // Keyboard / Phase Distortion
  'MAMEUPD931',       // NEC uPD931 Casio Keyboard Voice
  'MAMEUPD933',       // NEC uPD933 CZ Phase Distortion

  // FM synthesis
  'MAMEYMOPQ',        // Yamaha YM3806 4-Op FM
  'MAMEYMF271',       // Yamaha OPX 4-Op FM+PCM

  // Curtis analog
  'CEM3394',          // Curtis Electromusic Analog Voice

  // PCM / ROM-based (minimal controls)
  'MAMEAICA',         // Sega Dreamcast AICA
  'MAMEICS2115',      // ICS WaveFront 32-Voice
  'MAMEK054539',      // Konami K054539 PCM/ADPCM
  'MAMEC352',         // Namco C352 32-Voice PCM
  'MAMERF5C400',      // Ricoh RF5C400 32-Voice PCM
  'SCSP',             // Sega Saturn SCSP
  'MAMESWP30',        // Yamaha MU-2000 SWP30
];

/**
 * Buzzmachine synth types that use BuzzGenericHardware.
 */
const BUZZ_GENERIC_TYPES: SynthType[] = [
  'Buzzmachine',
  'BuzzDTMF',
  'BuzzFreqBomb',
  'BuzzKick',
  'BuzzKickXP',
  'BuzzNoise',
  'BuzzTrilok',
  'Buzz4FM2F',
  'BuzzDynamite6',
  'BuzzM3',
  'Buzz3o3',
  'Buzz3o3DF',
  'BuzzM4',
];

/** Check if a synth type has any hardware UI (dedicated or generic) */
// eslint-disable-next-line react-refresh/only-export-components
export function hasHardwareUI(synthType: SynthType): boolean {
  if (synthType in DEDICATED_UI_MAP) return true;
  if (MAME_GENERIC_TYPES.includes(synthType)) return true;
  if (BUZZ_GENERIC_TYPES.includes(synthType)) return true;
  if (isVSTBridgeType(synthType)) return true;
  return false;
}

/** Get the hardware UI component for a synth type (dedicated only) */
// eslint-disable-next-line react-refresh/only-export-components
export function getHardwareUI(synthType: SynthType): React.ComponentType<HWComponentProps> | null {
  return DEDICATED_UI_MAP[synthType] || null;
}

/**
 * HardwareUIWrapper component — routes to the right hardware UI
 */
export const HardwareUIWrapper: React.FC<HardwareUIWrapperProps> = ({
  synthType,
  parameters,
  onParamChange,
}) => {
  /* Check dedicated UIs first */
  const DedicatedComponent = DEDICATED_UI_MAP[synthType];
  if (DedicatedComponent) {
    return (
      <DedicatedComponent
        parameters={parameters}
        onParamChange={onParamChange}
      />
    );
  }

  /* MAME Generic Hardware UI */
  if (MAME_GENERIC_TYPES.includes(synthType)) {
    return (
      <MAMEGenericHardware
        synthType={synthType}
        parameters={parameters}
        onParamChange={onParamChange}
      />
    );
  }

  /* Buzz Generic Hardware UI */
  if (BUZZ_GENERIC_TYPES.includes(synthType)) {
    return (
      <BuzzGenericHardware
        synthType={synthType}
        parameters={parameters}
        onParamChange={onParamChange}
      />
    );
  }

  /* VSTBridge Generic Hardware UI */
  if (isVSTBridgeType(synthType)) {
    return (
      <VSTBridgeGenericHardware
        synthType={synthType}
        parameters={parameters}
        onParamChange={onParamChange}
      />
    );
  }

  /* No hardware UI available */
  return (
    <div className="p-8 text-center text-gray-500">
      <p className="text-lg mb-2">Hardware UI not available for {synthType}</p>
      <p className="text-sm">This synth uses the standard control interface.</p>
    </div>
  );
};
