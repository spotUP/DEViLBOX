/**
 * FlagCell - Flexible cell that can display either Accent ('A') or Slide ('S')
 * Similar to effect columns, each flag column can hold either type
 */

import React from 'react';

interface FlagCellProps {
  value?: number; // 0=empty, 1=accent, 2=slide
  isActive: boolean;
}

export const FlagCell: React.FC<FlagCellProps> = ({ value, isActive }) => {
  const baseClasses = 'w-6 h-5 flex items-center justify-center rounded text-xs font-mono transition-colors';
  const activeClasses = isActive ? 'bg-accent-primary/30 ring-1 ring-accent-primary' : '';

  let displayText = '.';
  let valueClasses = 'text-text-muted/40';
  let title = 'Empty (A=accent, S=slide)';

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
