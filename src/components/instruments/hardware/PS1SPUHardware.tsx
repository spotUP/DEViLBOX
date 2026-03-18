/**
 * PS1SPUHardware — PlayStation SPU hardware UI stub
 */
import React from 'react';
import { MAMEGenericHardware } from './MAMEGenericHardware';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const PS1SPUHardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return <MAMEGenericHardware synthType="MAMEPS1SPU" parameters={parameters} onParamChange={onParamChange} />;
};
