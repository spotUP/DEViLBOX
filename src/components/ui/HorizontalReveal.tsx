/**
 * HorizontalReveal — slides a docked side panel open and closed. The child
 * stays mounted while hidden, so the close animates too, and the width comes
 * from a grid track animating 0fr <-> 1fr: it follows the content width, so
 * a `w-fit` panel slides without a hard-coded size.
 */

import React from 'react';

export interface HorizontalRevealProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}

export const HorizontalReveal: React.FC<HorizontalRevealProps> = ({ open, children, className = '' }) => (
  <div
    className={`grid transition-[grid-template-columns] duration-200 ease-out ${open ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'} ${className}`}
    inert={!open}
    aria-hidden={!open}
    data-open={open}
  >
    <div className="min-w-0 overflow-hidden flex">{children}</div>
  </div>
);
