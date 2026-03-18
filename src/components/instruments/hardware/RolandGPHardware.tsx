/**
 * RolandGPHardware — Roland TC6116 SC-88 PCM hardware UI stub
 */
import React from 'react';
import { MAMEGenericHardware } from './MAMEGenericHardware';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const RolandGPHardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return <MAMEGenericHardware synthType="MAMERolandGP" parameters={parameters} onParamChange={onParamChange} />;
};
