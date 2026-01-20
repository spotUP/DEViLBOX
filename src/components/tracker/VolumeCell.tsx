/**
 * VolumeCell - Displays and edits volume column (00-40 hex)
 */

import React from 'react';
import type { VolumeValue } from '@typedefs';

interface VolumeCellProps {
  value: VolumeValue;
  isActive: boolean;
  isEmpty: boolean;
  digitIndex?: number;
}

export const VolumeCell: React.FC<VolumeCellProps> = React.memo(
  ({ value, isActive, isEmpty, digitIndex = 0 }) => {
    const displayValue = value !== null ? value.toString(16).toUpperCase().padStart(2, '0') : '..';

    const colorClass = isEmpty ? 'text-text-muted' : 'text-emerald-400';

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

VolumeCell.displayName = 'VolumeCell';
