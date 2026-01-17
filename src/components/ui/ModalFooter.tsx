/**
 * ModalFooter - Standard modal footer with button alignment
 */

import React from 'react';

interface ModalFooterProps {
  children: React.ReactNode;
  theme?: 'modern' | 'retro';
  align?: 'left' | 'center' | 'right' | 'between';
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  children,
  theme = 'modern',
  align = 'right',
}) => {
  // Theme-based classes
  const themeClasses = theme === 'retro'
    ? 'bg-ft2-header border-ft2-border'
    : 'bg-dark-bgSecondary border-dark-border';

  const borderClasses = theme === 'retro' ? 'border-t-2' : 'border-t';

  // Alignment classes
  const alignmentMap = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between',
  };

  return (
    <div className={`flex gap-2 px-4 py-3 ${borderClasses} ${themeClasses} ${alignmentMap[align]}`}>
      {children}
    </div>
  );
};
