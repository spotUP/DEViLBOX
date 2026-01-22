/**
 * Modal - Reusable modal wrapper component
 * Supports both modern and retro (FT2) themes with consistent behavior
 */

import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;

  // Style
  theme?: 'modern' | 'retro'; // dark-* vs ft2-*
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  backdropOpacity?: 'light' | 'medium' | 'dark'; // 50 | 60 | 80
  rounded?: boolean; // true for modern, false for retro

  // Behavior
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;

  // Animation
  animation?: 'fade' | 'slide' | 'scale';

  // Custom classes
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  theme = 'modern',
  size = 'md',
  backdropOpacity = 'medium',
  rounded = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  animation = 'fade',
  className = '',
}) => {
  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Backdrop classes
  const backdropOpacityMap = {
    light: 'bg-black/50',
    medium: 'bg-black/60',
    dark: 'bg-black/80',
  };

  const backdropClasses = `
    fixed inset-0 z-50 flex items-center justify-center p-4
    ${backdropOpacityMap[backdropOpacity]}
  `;

  // Size classes
  const sizeMap = {
    sm: 'w-80 max-w-sm',
    md: 'w-96 max-w-md',
    lg: 'max-w-2xl w-full',
    xl: 'max-w-4xl w-full',
    fullscreen: 'w-full h-full',
  };

  // Theme-based classes
  const themeClasses = theme === 'retro'
    ? 'bg-ft2-bg border-ft2-border'
    : 'bg-dark-bg border-dark-border';

  // Border classes
  const borderClasses = theme === 'retro'
    ? 'border-2'
    : 'border';

  const roundedClasses = rounded ? 'rounded-lg' : '';

  // Animation classes
  const animationMap = {
    fade: 'animate-fade-in',
    slide: 'animate-slide-in-up',
    scale: 'animate-scale-in',
  };

  const modalClasses = `
    ${sizeMap[size]}
    ${themeClasses}
    ${borderClasses}
    ${roundedClasses}
    ${animationMap[animation]}
    ${size !== 'fullscreen' ? 'shadow-xl max-h-[90vh] overflow-hidden' : ''}
    ${className}
    flex flex-col
  `;

  return (
    <div
      className={backdropClasses}
      onClick={handleBackdropClick}
    >
      <div className={modalClasses}>
        {children}
      </div>
    </div>
  );
};
