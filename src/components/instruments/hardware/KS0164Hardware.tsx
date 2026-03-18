/**
 * KS0164Hardware — Samsung KS0164 hardware UI stub
 */
import React from 'react';
import { MAMEGenericHardware } from './MAMEGenericHardware';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const KS0164Hardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return <MAMEGenericHardware synthType="MAMEKS0164" parameters={parameters} onParamChange={onParamChange} />;
};
