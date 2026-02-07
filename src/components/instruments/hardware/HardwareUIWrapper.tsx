/**
 * HardwareUIWrapper - Generic wrapper for hardware-accurate UIs
 *
 * Provides a consistent interface for all hardware UIs with mode switching
 */

import React from 'react';
import type { SynthType } from '@typedefs/instrument';
import { TR707Hardware } from './TR707Hardware';

interface HardwareUIWrapperProps {
  synthType: SynthType;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * Map of synth types to their hardware UI components
 */
const HARDWARE_UI_MAP: Partial<Record<SynthType, React.ComponentType<any>>> = {
  MAMETR707: TR707Hardware,
  // Future hardware UIs:
  // MAMERSA: D50Hardware,
  // MAMEVFX: VFXHardware,
  // MAMEDOC: DOCHardware,
  // Add more as implemented
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
