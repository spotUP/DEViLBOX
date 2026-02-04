/**
 * ProbabilityCell - Maybe/probability column
 * Displays chance (0-99%) that a note will play on each pass
 * Empty/undefined/0 = always play (100%)
 * 1-99 = percentage chance
 */

import React from 'react';

interface ProbabilityCellProps {
  value?: number; // 0-99 percentage, undefined = always
  isActive: boolean;
  digitIndex?: number; // 0-1 for 2-digit decimal input
}

export const ProbabilityCell: React.FC<ProbabilityCellProps> = React.memo(
  ({ value, isActive, digitIndex = 0 }) => {
    const isEmpty = value === undefined || value === 0;
    const clampedValue = isEmpty ? 0 : Math.min(99, Math.max(0, value!));
    const displayValue = isEmpty ? '..' : clampedValue.toString(10).padStart(2, '0');

    const colorClass = isEmpty
      ? 'text-text-muted/40'
      : clampedValue >= 75
        ? 'text-emerald-400'     // High probability - green
        : clampedValue >= 50
          ? 'text-yellow-400'    // Medium probability - yellow
          : clampedValue >= 25
            ? 'text-orange-400'  // Low probability - orange
            : 'text-red-400';    // Very low - red

    const cellStyle = {
      width: '24px',
      minWidth: '24px',
      maxWidth: '24px',
      display: 'inline-block' as const,
      textAlign: 'left' as const,
      overflow: 'hidden' as const,
      whiteSpace: 'nowrap' as const,
    };

    // FT2-style: Highlight only the character under the cursor
    if (isActive && !isEmpty) {
      const chars = displayValue.split('');
      return (
        <span
          className={`tracker-cell ${colorClass}`}
          style={cellStyle}
          title={`${clampedValue}% chance to play`}
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
        title={isEmpty ? 'Probability (always)' : `${clampedValue}% chance to play`}
      >
        {displayValue}
      </span>
    );
  }
);

ProbabilityCell.displayName = 'ProbabilityCell';
