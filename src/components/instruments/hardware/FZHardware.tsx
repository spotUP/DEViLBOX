/**
 * FZHardware — Casio FZ-1 PCM Sampler hardware UI stub
 */
import React from 'react';
import { MAMEGenericHardware } from './MAMEGenericHardware';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const FZHardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return <MAMEGenericHardware synthType="MAMEFZPCM" parameters={parameters} onParamChange={onParamChange} />;
};
