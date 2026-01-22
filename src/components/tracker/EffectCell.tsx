/**
 * EffectCell - Displays and edits effect command (A0F, C40, etc.)
 */

import React from 'react';
import type { EffectValue } from '@typedefs';

interface EffectCellProps {
  value: EffectValue;
  isActive: boolean;
  isEmpty: boolean;
  digitIndex?: number; // FT2: Which character is under cursor (0-2)
}

export const EffectCell: React.FC<EffectCellProps> = React.memo(
  ({ value, isActive, isEmpty, digitIndex = 0 }) => {
    const displayValue = value || '...';

    const colorClass = isEmpty ? 'text-text-muted' : 'text-orange-400';

    // FT2-style: Highlight only the character under the cursor
    if (isActive && displayValue !== '...') {
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

EffectCell.displayName = 'EffectCell';
