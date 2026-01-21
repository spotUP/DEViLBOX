/**
 * VolumeCell - Displays and edits volume column (00-40 hex + FT2 volume effects)
 */

import React from 'react';
import type { VolumeValue } from '@typedefs';
import { formatVolumeColumn, decodeVolumeColumn } from '@engine/EffectProcessor';

interface VolumeCellProps {
  value: VolumeValue;
  isActive: boolean;
  isEmpty: boolean;
}

export const VolumeCell: React.FC<VolumeCellProps> = React.memo(
  ({ value, isActive, isEmpty }) => {
    const displayValue = formatVolumeColumn(value);

    // Determine color based on volume type
    let colorClass = 'text-text-muted';
    if (!isEmpty && value !== null) {
      const decoded = decodeVolumeColumn(value);
      if (decoded?.type === 'set') {
        colorClass = 'text-emerald-400'; // Regular volume
      } else {
        colorClass = 'text-yellow-400'; // Volume effect
      }
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

VolumeCell.displayName = 'VolumeCell';
