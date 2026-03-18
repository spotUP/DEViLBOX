/**
 * SWP20Hardware — Yamaha SWP20 AWM2 hardware UI stub
 */
import React from 'react';
import { MAMEGenericHardware } from './MAMEGenericHardware';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const SWP20Hardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return <MAMEGenericHardware synthType="MAMESWP20" parameters={parameters} onParamChange={onParamChange} />;
};
