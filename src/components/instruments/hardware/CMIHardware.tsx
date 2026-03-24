/**
 * CMIHardware — Fairlight CMI IIx hardware UI (DOM fallback)
 * Uses the generic ChipSynthControls which reads from chipParameters.ts
 */
import React from 'react';
import { ChipSynthControls } from '../controls/ChipSynthControls';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const CMIHardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return (
    <ChipSynthControls
      synthType="MAMECMI"
      parameters={parameters}
      instrumentId={0}
      onParamChange={onParamChange}
      onLoadPreset={() => {}}
    />
  );
};
