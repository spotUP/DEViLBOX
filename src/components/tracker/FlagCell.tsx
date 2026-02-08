/**
 * FlagCell - Flexible cell for TB-303/TT-303 articulation flags
 * Values: 0=empty, 1=accent, 2=slide, 3=mute, 4=hammer
 */

import React from 'react';

interface FlagCellProps {
  value?: number; // 0=empty, 1=accent, 2=slide, 3=mute, 4=hammer
  isActive: boolean;
}

export const FlagCell: React.FC<FlagCellProps> = ({ value, isActive }) => {
  const baseClasses = 'w-6 h-5 flex items-center justify-center rounded text-xs font-mono transition-colors';
  const activeClasses = isActive ? 'bg-accent-primary/30 ring-1 ring-accent-primary' : '';

  let displayText = '.';
  let valueClasses = 'text-text-muted/40';
  let title = 'Empty (A=accent, S=slide, M=mute, H=hammer)';

  if (value === 1) {
    // Accent
    displayText = 'A';
    valueClasses = 'text-tracker-cell-accent bg-tracker-cell-accent/20';
    title = 'Accent ON';
  } else if (value === 2) {
    // Slide
    displayText = 'S';
    valueClasses = 'text-tracker-cell-slide bg-tracker-cell-slide/20';
    title = 'Slide ON';
  } else if (value === 3) {
    // Mute (TT-303 extension)
    displayText = 'M';
    valueClasses = 'text-yellow-400 bg-yellow-400/20';
    title = 'Mute ON (TT-303: silent step)';
  } else if (value === 4) {
    // Hammer (TT-303 extension)
    displayText = 'H';
    valueClasses = 'text-cyan-400 bg-cyan-400/20';
    title = 'Hammer ON (TT-303: legato without glide)';
  }

  return (
    <div
      className={`${baseClasses} ${activeClasses} ${valueClasses}`}
      title={title}
    >
      {displayText}
    </div>
  );
};
