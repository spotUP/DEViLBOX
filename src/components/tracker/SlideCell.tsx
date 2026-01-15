/**
 * SlideCell - TB-303 Slide/Glide toggle column
 * Displays and allows toggling of slide/portamento on notes
 */

import React from 'react';
import { ArrowRightFromLine } from 'lucide-react';

interface SlideCellProps {
  value?: boolean;
  isActive: boolean;
  onToggle?: () => void;
}

export const SlideCell: React.FC<SlideCellProps> = ({ value, isActive, onToggle }) => {
  const baseClasses = 'w-6 h-5 flex items-center justify-center rounded text-xs font-mono transition-colors cursor-pointer';
  const activeClasses = isActive ? 'bg-accent-primary/30 ring-1 ring-accent-primary' : '';
  const valueClasses = value
    ? 'text-tracker-cell-slide bg-tracker-cell-slide/20'
    : 'text-text-muted/40 hover:text-text-muted hover:bg-dark-bgHover';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle?.();
  };

  return (
    <div
      className={`${baseClasses} ${activeClasses} ${valueClasses}`}
      title={value ? 'Slide ON (click to toggle)' : 'Slide OFF (click to toggle)'}
      onClick={handleClick}
    >
      {value ? <ArrowRightFromLine size={12} strokeWidth={3} /> : <ArrowRightFromLine size={12} />}
    </div>
  );
};
