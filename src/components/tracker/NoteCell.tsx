/**
 * NoteCell - Displays and edits note column (C-4, D#5, ===, etc.)
 * Supports both numeric XM format (0-97) and legacy string format
 */

import React from 'react';
import type { NoteValue } from '@typedefs';
import { xmNoteToString } from '@/lib/xmConversions';

interface NoteCellProps {
  value: NoteValue;
  isActive: boolean;
  isEmpty: boolean;
  isNoteOff: boolean;
}

export const NoteCell: React.FC<NoteCellProps> = React.memo(
  ({ value, isActive, isEmpty, isNoteOff }) => {
    // Format note to always be 3 characters: C-3, C#3, etc.
    let displayValue = '...';

    // Handle numeric XM format (NoteValue is always a number)
    if (value === 0) {
      displayValue = '...'; // Empty
    } else if (value === 97) {
      displayValue = '==='; // Note off
    } else if (value >= 1 && value <= 96) {
      // Convert XM note to string (1 = C-0, 49 = C-4, etc.)
      displayValue = xmNoteToString(value);
    }

    let colorClass = 'text-text-primary';
    if (isEmpty) {
      colorClass = 'text-text-muted';
    } else if (isNoteOff) {
      colorClass = 'text-accent-error';
    }

    return (
      <span
        className={`tracker-cell ${colorClass} ${
          isActive ? 'bg-accent-primary font-bold rounded-sm' : ''
        }`}
        style={{
          width: '42px',
          minWidth: '42px',
          maxWidth: '42px',
          display: 'inline-block',
          textAlign: 'left',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          color: isActive ? '#ffffff' : undefined
        }}
      >
        {displayValue}
      </span>
    );
  }
);

NoteCell.displayName = 'NoteCell';
