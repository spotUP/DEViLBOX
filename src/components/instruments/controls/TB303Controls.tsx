/**
 * TB303Controls - Control panel for TB-303 acid bass synthesizer
 *
 * Extracted from VisualTB303Editor for use in the unified editor.
 * Contains filter, oscillator, slide, and Devil Fish modification controls.
 */

import React from 'react';
import type { TB303Config } from '@typedefs/instrument';
import { JC303StyledKnobPanel } from './JC303StyledKnobPanel';

interface TB303ControlsProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
  /** Show the filter curve visualization at top */
  showFilterCurve?: boolean;
  /** Show the TB303 branding header */
  showHeader?: boolean;
  /** Use the JC303 styled panel */
  isJC303?: boolean;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  isBuzz3o3?: boolean;
}

export const TB303Controls: React.FC<TB303ControlsProps> = ({
  config,
  onChange,
  volume,
  onVolumeChange,
  isBuzz3o3 = false,
}) => {
  return (
    <JC303StyledKnobPanel 
      config={config} 
      onChange={onChange} 
      volume={volume} 
      onVolumeChange={onVolumeChange} 
      isBuzz3o3={isBuzz3o3}
    />
  );
};

export default TB303Controls;
