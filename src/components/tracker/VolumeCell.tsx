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
  digitIndex?: number; // FT2: Which character is under cursor (0-1)
}

export const VolumeCell: React.FC<VolumeCellProps> = React.memo(
  ({ value, isActive, isEmpty, digitIndex = 0 }) => {
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

VolumeCell.displayName = 'VolumeCell';
