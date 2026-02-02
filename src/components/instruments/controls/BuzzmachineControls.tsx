/**
 * BuzzmachineControls - Control panel for Buzzmachine effects and generators
 * 
 * Dynamically selects between specialized editors (JeskolaEditors) 
 * and the generic fallback (BuzzmachineEditor).
 */

import React from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { BuzzmachineEditor } from '../editors/BuzzmachineEditor';
import { getJeskolaEditor } from '../editors/JeskolaEditors';

interface BuzzmachineControlsProps {
  config: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const BuzzmachineControls: React.FC<BuzzmachineControlsProps> = ({
  config,
  onChange,
}) => {
  const machineType = config.buzzmachine?.machineType || '';
  
  // Try to get a specialized visual editor first
  const SpecializedEditor = getJeskolaEditor(machineType);
  
  if (SpecializedEditor) {
    return <SpecializedEditor config={config} onChange={onChange} />;
  }
  
  // Fallback to generic visual editor
  return <BuzzmachineEditor config={config} onChange={onChange} />;
};

export default BuzzmachineControls;
