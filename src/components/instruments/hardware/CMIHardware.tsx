/**
 * CMIHardware — Fairlight CMI IIx hardware UI stub
 */
import React from 'react';
import { MAMEGenericHardware } from './MAMEGenericHardware';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const CMIHardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return <MAMEGenericHardware synthType="MAMECMI" parameters={parameters} onParamChange={onParamChange} />;
};
