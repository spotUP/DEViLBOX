/**
 * FT2Button - FastTracker II style 3D button
 */

import React from 'react';

interface FT2ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  small?: boolean;
  className?: string;
  title?: string;
  colorAccent?: 'red' | 'green' | 'yellow' | 'blue' | 'purple';
}

export const FT2Button: React.FC<FT2ButtonProps> = ({
  children,
  onClick,
  disabled = false,
  active = false,
  small = false,
  className = '',
  title,
  colorAccent,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        ft2-btn
        ${small ? 'ft2-btn-small' : ''}
        ${active ? 'ft2-btn-active' : ''}
        ${disabled ? 'ft2-btn-disabled' : ''}
        ${colorAccent ? `ft2-btn-${colorAccent}` : ''}
        ${className}
      `}
    >
      {children}
    </button>
  );
};
