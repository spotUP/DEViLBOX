/**
 * InstrumentCell - Displays and edits instrument number (00-FF)
 */

import React from 'react';
import type { InstrumentValue } from '@typedefs';

interface InstrumentCellProps {
  value: InstrumentValue;
  isActive: boolean;
  isEmpty: boolean;
}

export const InstrumentCell: React.FC<InstrumentCellProps> = React.memo(
  ({ value, isActive, isEmpty }) => {
    const displayValue = value !== null ? value.toString(16).toUpperCase().padStart(2, '0') : '..';

    const colorClass = isEmpty ? 'text-text-muted' : 'text-amber-400';

    return (
      <span
        className={`tracker-cell ${colorClass} ${
          isActive ? 'bg-accent-primary text-text-inverse font-bold rounded-sm' : ''
        }`}
      >
        {displayValue}
      </span>
    );
  }
);

InstrumentCell.displayName = 'InstrumentCell';
