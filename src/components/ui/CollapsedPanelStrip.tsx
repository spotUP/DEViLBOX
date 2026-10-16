/**
 * CollapsedPanelStrip — what a collapsible side panel shows while collapsed:
 * a full-height strip with a chevron pointing into the app and the panel name
 * written vertically, muted until hovered. One look for every docked side
 * panel (the synth editor's instrument list, the AI assistant).
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CollapsedPanelStripProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Panel name, written vertically. */
  label: string;
  /** Edge the panel is docked to; the chevron points away from it. */
  side: 'left' | 'right';
}

export const CollapsedPanelStrip: React.FC<CollapsedPanelStripProps> = ({ label, side, className = '', ...rest }) => {
  const Chevron = side === 'left' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      {...rest}
      className={`flex flex-col items-center justify-start gap-3 pt-3 w-full h-full text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary transition-colors ${className}`}
    >
      <Chevron size={16} />
      <span className="rotate-180 tracking-widest font-mono text-[10px] uppercase" style={{ writingMode: 'vertical-lr' }}>
        {label}
      </span>
    </button>
  );
};
