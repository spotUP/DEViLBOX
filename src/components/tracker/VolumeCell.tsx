/**
 * VolumeCell - Displays and edits volume column (XM format: 0x00-0xFF)
 * XM volume column format:
 * - 0x00-0x0F: Nothing
 * - 0x10-0x50: Set volume 0-64
 * - 0x60-0xFF: Volume effects (slide, pan, portamento, etc.)
 */

import React from 'react';
import type { VolumeValue } from '@typedefs';
import { formatVolumeColumn } from '@/lib/xmConversions';
import { decodeVolumeColumn } from '@engine/EffectProcessor';
import { getVolumeColumnDescription } from '@utils/ft2EffectDescriptions';

interface VolumeCellProps {
  value: VolumeValue;
  isActive: boolean;
  isEmpty: boolean;
  digitIndex?: number; // FT2: Which character is under cursor (0-1)
}

export const VolumeCell: React.FC<VolumeCellProps> = React.memo(
  ({ value, isActive, digitIndex = 0 }) => {
    const displayValue = formatVolumeColumn(value);

    // XM format: 0x00-0x0F = nothing, check if value is actually empty
    const isEmptyValue = value === null || value === 0 || (typeof value === 'number' && value < 0x10);

    // Get tooltip for volume column
    const tooltip = !isEmptyValue ? getVolumeColumnDescription(value) : null;

    // Determine color based on volume type
    let colorClass = 'text-text-muted';
    if (!isEmptyValue && value !== null) {
      const decoded = decodeVolumeColumn(value);
      if (decoded?.type === 'set' || (typeof value === 'number' && value >= 0x10 && value <= 0x50)) {
        colorClass = 'text-emerald-400'; // Regular volume (0x10-0x50)
      } else {
        colorClass = 'text-yellow-400'; // Volume effect (0x60-0xFF)
      }
    }

    const cellStyle = {
      width: '28px',
      minWidth: '28px',
      maxWidth: '28px',
      display: 'inline-block' as const,
      textAlign: 'left' as const,
      overflow: 'hidden' as const,
      whiteSpace: 'nowrap' as const,
    };

    // FT2-style: Highlight only the character under the cursor
    if (isActive && displayValue !== '..') {
      const chars = displayValue.split('');
      return (
        <span
          className={`tracker-cell ${colorClass}`}
          style={cellStyle}
          title={tooltip || undefined}
        >
          {chars.map((char, i) => (
            <span
              key={i}
              className={
                i === digitIndex
                  ? 'bg-accent-primary font-bold rounded-sm'
                  : ''
              }
              style={{
                color: i === digitIndex ? '#ffffff' : undefined
              }}
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
          isActive ? 'bg-accent-primary font-bold rounded-sm' : ''
        }`}
        style={{
          ...cellStyle,
          color: isActive ? '#ffffff' : undefined
        }}
        title={tooltip || undefined}
      >
        {displayValue}
      </span>
    );
  }
);

VolumeCell.displayName = 'VolumeCell';
