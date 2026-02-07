/**
 * HardwareUIWrapper - Generic wrapper for hardware-accurate UIs
 *
 * Provides a consistent interface for all hardware UIs with mode switching
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

interface HardwareUIWrapperProps {
  synthType: SynthType;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * Map of synth types to their hardware UI components
 */
const HARDWARE_UI_MAP: Partial<Record<SynthType, React.ComponentType<any>>> = {
  // Drum Machines
  MAMETR707: TR707Hardware,
  DrumMachine: TR808Hardware,   // Roland TR-808/909 Rhythm Composers (1980/1983)

  // Synthesizers - Classic
  TB303: TB303Hardware,         // Roland TB-303 Bass Line (1981)
  CZ101: CZ101Hardware,         // Casio CZ-101 Phase Distortion (1984)
  Dexed: DX7Hardware,           // Yamaha DX7 FM Synthesis (1983)
  OBXd: OBXdHardware,           // Oberheim OB-X Analog (1979)

  // Synthesizers - MAME
  MAMERSA: D50Hardware,         // Roland D-50 LA Synthesis (1987)
  MAMEVFX: VFXHardware,         // Ensoniq VFX Wavetable (1989)

  // Future hardware UIs:
  // MAMEDOC: ESQ1Hardware,     // Ensoniq ESQ-1 / DOC
  // MAMESWP30: MU2000Hardware, // Yamaha MU2000 / SWP30
};

/**
 * Check if a synth type has a hardware UI available
 */
export function hasHardwareUI(synthType: SynthType): boolean {
  return synthType in HARDWARE_UI_MAP;
}

/**
 * Get the hardware UI component for a synth type
 */
export function getHardwareUI(synthType: SynthType): React.ComponentType<any> | null {
  return HARDWARE_UI_MAP[synthType] || null;
}

/**
 * HardwareUIWrapper component
 */
export const HardwareUIWrapper: React.FC<HardwareUIWrapperProps> = ({
  synthType,
  parameters,
  onParamChange,
}) => {
  const HardwareComponent = HARDWARE_UI_MAP[synthType];

  if (!HardwareComponent) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-lg mb-2">Hardware UI not available for {synthType}</p>
        <p className="text-sm">This synth uses the standard control interface.</p>
      </div>
    );
  }

  return (
    <HardwareComponent
      parameters={parameters}
      onParamChange={onParamChange}
    />
  );
};
