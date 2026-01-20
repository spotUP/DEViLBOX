/**
 * NoteCell - Displays and edits note column (C-4, D#5, ===, etc.)
 */

import React from 'react';
import type { NoteValue } from '@typedefs';

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
    if (value && value !== '...') {
      if (value === '===') {
        displayValue = '===';
      } else {
        // Input format: "C-4", "C#-4", "D#-5", etc.
        // Output format: "C-4", "C#4", "D#5", etc. (always 3 chars)
        if (value.includes('#')) {
          // Sharp note: "C#-4" -> "C#4" (remove all dashes)
          displayValue = value.replace(/-/g, '');
        } else {
          // Natural note: "C-4" -> "C-4" (keep as is)
          displayValue = value;
        }
        // Ensure exactly 3 characters
        displayValue = displayValue.substring(0, 3);
      }
    }

    let colorClass = 'text-text-primary';
    if (isEmpty) {
      colorClass = 'text-text-muted';
    } else if (isNoteOff) {
      colorClass = 'text-accent-error';
    }

    return (
      <span
        className={`tracker-cell font-mono ${colorClass} ${
          isActive ? 'bg-accent-primary text-text-inverse font-bold' : ''
        }`}
        style={{
          width: '3.5ch',
          minWidth: '3.5ch',
          maxWidth: '3.5ch',
          display: 'inline-block',
          textAlign: 'left',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          fontSize: '11px',
          padding: '0 1px'
        }}
      >
        {displayValue}
      </span>
    );
  }
);

NoteCell.displayName = 'NoteCell';
