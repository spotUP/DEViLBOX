/**
 * ModalHeader - Standard modal header with title, icon, and close button
 */

import React from 'react';
import { X } from 'lucide-react';

interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  theme?: 'modern' | 'retro';
  showCloseButton?: boolean;
  className?: string;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  theme = 'modern',
  showCloseButton = true,
  className = '',
}) => {
  // Theme-based classes
  const themeClasses = theme === 'retro'
    ? 'bg-ft2-header border-ft2-border text-ft2-highlight'
    : 'bg-dark-bgSecondary border-dark-border text-text-primary';

  const borderClasses = theme === 'retro' ? 'border-b-2' : 'border-b';

  const closeButtonClasses = theme === 'retro'
    ? 'p-1 hover:bg-ft2-border transition-colors text-ft2-text hover:text-ft2-highlight focus:outline-none'
    : 'p-2 rounded-lg hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors focus:outline-none';

  return (
    <div className={`flex items-center justify-between px-4 py-3 ${borderClasses} ${themeClasses} ${className}`}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="text-accent-primary">
            {icon}
          </div>
        )}
        <div className="flex flex-col">
          <h2 className={`font-bold tracking-wide ${theme === 'retro' ? 'text-sm' : 'text-base'}`}>
            {title}
          </h2>
          {subtitle && (
            <p className={`text-text-secondary ${theme === 'retro' ? 'text-xs' : 'text-sm'}`}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className={closeButtonClasses}
          aria-label="Close"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
