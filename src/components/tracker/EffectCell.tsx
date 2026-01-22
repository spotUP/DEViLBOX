/**
 * EffectCell - Displays and edits effect command (A0F, C40, etc.)
 * Enhanced with FT2 effect tooltips
 * Supports both XM format (effTyp + eff) and legacy string format
 */

import React from 'react';
import { xmEffectToString } from '@/lib/xmConversions';
import { formatEffectTooltip } from '@utils/ft2EffectDescriptions';

interface EffectCellProps {
  // New XM format
  effTyp?: number;
  eff?: number;
  // Legacy format (for effect2)
  value?: string;
  isActive: boolean;
  isEmpty: boolean;
  digitIndex?: number; // FT2: Which character is under cursor (0-2)
}

export const EffectCell: React.FC<EffectCellProps> = React.memo(
  ({ effTyp, eff, value, isActive, isEmpty, digitIndex = 0 }) => {
    // Convert XM format to display string, or use legacy value
    let displayValue = '...';
    if (effTyp !== undefined && eff !== undefined) {
      displayValue = xmEffectToString(effTyp, eff);
    } else if (value) {
      displayValue = value;
    }

    // Get tooltip for FT2 effect
    const tooltip = !isEmpty && displayValue !== '...' ? formatEffectTooltip(displayValue) : null;

    const colorClass = isEmpty ? 'text-text-muted' : 'text-orange-400';

    // FT2-style: Highlight only the character under the cursor
    if (isActive && displayValue !== '...') {
      const chars = displayValue.split('');
      return (
        <span
          className={`tracker-cell ${colorClass}`}
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
          color: isActive ? '#ffffff' : undefined
        }}
        title={tooltip || undefined}
      >
        {displayValue}
      </span>
    );
  }
);

EffectCell.displayName = 'EffectCell';
