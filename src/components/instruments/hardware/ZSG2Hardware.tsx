/**
 * ZSG2Hardware — ZOOM ZSG-2 hardware UI stub
 */
import React from 'react';
import { MAMEGenericHardware } from './MAMEGenericHardware';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const ZSG2Hardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return <MAMEGenericHardware synthType="MAMEZSG2" parameters={parameters} onParamChange={onParamChange} />;
};
