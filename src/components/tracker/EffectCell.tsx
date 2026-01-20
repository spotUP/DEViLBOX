/**
 * EffectCell - Displays and edits effect command (A0F, C40, etc.)
 */

import React from 'react';
import type { EffectValue } from '@typedefs';

interface EffectCellProps {
  value: EffectValue;
  isActive: boolean;
  isEmpty: boolean;
  digitIndex?: number;
}

export const EffectCell: React.FC<EffectCellProps> = React.memo(
  ({ value, isActive, isEmpty, digitIndex = 0 }) => {
    const displayValue = value || '...';

    const colorClass = isEmpty ? 'text-text-muted' : 'text-orange-400';

    return (
      <span
        className={`tracker-cell font-mono ${colorClass} ${
          isActive ? 'bg-accent-primary/20' : ''
        }`}
        style={{
          fontSize: '11px',
          padding: '0 1px',
          letterSpacing: '-0.5px'
        }}
      >
        {displayValue.split('').map((char, i) => (
          <span
            key={i}
            className={isActive && digitIndex === i ? 'bg-accent-primary text-text-inverse font-bold' : ''}
          >
            {char}
          </span>
        ))}
      </span>
    );
  }
);

EffectCell.displayName = 'EffectCell';
