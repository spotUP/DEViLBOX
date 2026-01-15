/**
 * AccentCell - TB-303 Accent toggle column
 * Displays and allows toggling of accent on notes
 */

import React from 'react';
import { Zap } from 'lucide-react';

interface AccentCellProps {
  value?: boolean;
  isActive: boolean;
  onToggle?: () => void;
}

export const AccentCell: React.FC<AccentCellProps> = ({ value, isActive, onToggle }) => {
  const baseClasses = 'w-6 h-5 flex items-center justify-center rounded text-xs font-mono transition-colors cursor-pointer';
  const activeClasses = isActive ? 'bg-accent-primary/30 ring-1 ring-accent-primary' : '';
  const valueClasses = value
    ? 'text-tracker-cell-accent bg-tracker-cell-accent/20'
    : 'text-text-muted/40 hover:text-text-muted hover:bg-dark-bgHover';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle?.();
  };

  return (
    <div
      className={`${baseClasses} ${activeClasses} ${valueClasses}`}
      title={value ? 'Accent ON (click to toggle)' : 'Accent OFF (click to toggle)'}
      onClick={handleClick}
    >
      {value ? <Zap size={12} fill="currentColor" /> : <Zap size={12} />}
    </div>
  );
};
