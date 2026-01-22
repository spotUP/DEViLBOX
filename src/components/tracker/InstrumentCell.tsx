/**
 * InstrumentCell - Displays and edits instrument number (00-FF)
 */

import React from 'react';
import { useUIStore } from '@stores/useUIStore';
import type { InstrumentValue } from '@typedefs';

interface InstrumentCellProps {
  value: InstrumentValue;
  isActive: boolean;
  isEmpty: boolean;
  digitIndex?: number; // FT2: Which character is under cursor (0-1)
}

export const InstrumentCell: React.FC<InstrumentCellProps> = React.memo(
  ({ value, isActive, isEmpty, digitIndex = 0 }) => {
    const useHexNumbers = useUIStore((state) => state.useHexNumbers);
    const displayValue = value !== null
      ? useHexNumbers
        ? value.toString(16).toUpperCase().padStart(2, '0')
        : value.toString(10).padStart(2, '0')
      : '..';

    const colorClass = isEmpty ? 'text-text-muted' : 'text-amber-400';

    // FT2-style: Highlight only the character under the cursor
    if (isActive && displayValue !== '..') {
      const chars = displayValue.split('');
      return (
        <span className={`tracker-cell ${colorClass}`}>
          {chars.map((char, i) => (
            <span
              key={i}
              className={
                i === digitIndex
                  ? 'bg-accent-primary text-text-inverse font-bold rounded-sm'
                  : ''
              }
            >
              {char}
            </span>
          ))}
        </span>
      );
    }

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
