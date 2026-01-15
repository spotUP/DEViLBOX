/**
 * EffectCell - Displays and edits effect command (A0F, C40, etc.)
 */

import React from 'react';
import type { EffectValue } from '@typedefs';

interface EffectCellProps {
  value: EffectValue;
  isActive: boolean;
  isEmpty: boolean;
}

export const EffectCell: React.FC<EffectCellProps> = React.memo(
  ({ value, isActive, isEmpty }) => {
    const displayValue = value || '...';

    const colorClass = isEmpty ? 'text-text-muted' : 'text-orange-400';

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
