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

/**
 * Wrapper that resolves the correct editor at module level to avoid
 * creating components during render.
 */
const BuzzmachineEditorResolver: React.FC<BuzzmachineControlsProps & { machineType: string }> = ({
  config,
  onChange,
  machineType,
}) => {
  // getJeskolaEditor returns a stable component reference from a registry
  const Resolved = getJeskolaEditor(machineType);
  if (Resolved) {
    return React.createElement(Resolved, { config, onChange });
  }
  return <BuzzmachineEditor config={config} onChange={onChange} />;
};

export const BuzzmachineControls: React.FC<BuzzmachineControlsProps> = ({
  config,
  onChange,
}) => {
  const machineType = config.buzzmachine?.machineType || '';
  return <BuzzmachineEditorResolver config={config} onChange={onChange} machineType={machineType} />;
};

export default BuzzmachineControls;
