/**
 * VolumeCell - Displays and edits volume column (00-40 hex)
 */

import React from 'react';
import type { VolumeValue } from '@typedefs';

interface VolumeCellProps {
  value: VolumeValue;
  isActive: boolean;
  isEmpty: boolean;
}

export const VolumeCell: React.FC<VolumeCellProps> = React.memo(
  ({ value, isActive, isEmpty }) => {
    const displayValue = value !== null ? value.toString(16).toUpperCase().padStart(2, '0') : '..';

    const colorClass = isEmpty ? 'text-text-muted' : 'text-emerald-400';

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

VolumeCell.displayName = 'VolumeCell';
