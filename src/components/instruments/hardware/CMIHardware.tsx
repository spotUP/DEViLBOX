/**
 * CMIHardware — Fairlight CMI IIx hardware UI
 * Uses the shared CMIControls (which uses useCMIPanel hook)
 */
import React from 'react';
import { CMIControls } from '../controls/CMIControls';

interface Props {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export const CMIHardware: React.FC<Props> = ({ parameters, onParamChange }) => {
  return (
    <CMIControls
      synthType="MAMECMI"
      parameters={parameters}
      instrumentId={0}
      onParamChange={onParamChange}
    />
  );
};
