/**
 * Modal - Reusable modal wrapper component
 * Supports both modern and retro (FT2) themes with consistent behavior
 * 
 * Keyboard behavior:
 * - Escape: closes modal (when closeOnEscape=true)
 * - Enter: triggers onConfirm if provided (smart detection avoids text inputs)
 * - Ctrl/Cmd+Enter: force confirm even in text inputs
 */

import React, { useEffect, useCallback, useRef } from 'react';

/** Focusable element selector for focus trap */
const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;

  // Confirm action (if provided, Enter triggers it)
  onConfirm?: () => void;
  confirmDisabled?: boolean;

  // Style
  theme?: 'modern' | 'retro'; // dark-* vs ft2-*
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  backdropOpacity?: 'light' | 'medium' | 'dark'; // 50 | 60 | 80
  rounded?: boolean; // true for modern, false for retro

  // Behavior
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  closeOnEnter?: boolean; // If no onConfirm, Enter closes modal (default: true)

  // Animation
  animation?: 'fade' | 'slide' | 'scale';

  // Custom classes
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  onConfirm,
  confirmDisabled = false,
  theme = 'modern',
  size = 'md',
  backdropOpacity = 'medium',
  rounded = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  closeOnEnter = true,
  animation = 'fade',
  className = '',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Handle keyboard events (including focus trap)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    const target = e.target as HTMLElement;
    const isTextarea = target.tagName === 'TEXTAREA';
    const isSelect = target.tagName === 'SELECT';
    const isButton = target.tagName === 'BUTTON';
    const isInput = target.tagName === 'INPUT';
    const inputType = isInput ? (target as HTMLInputElement).type : '';
    const isTextInput = isInput && ['text', 'search', 'url', 'email', 'password'].includes(inputType);

    // Focus trap: Tab/Shift+Tab cycles within modal
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }

    // Escape to close
    if (closeOnEscape && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    // Ctrl/Cmd+Enter - force confirm/close even in text inputs
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (onConfirm && !confirmDisabled) {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (closeOnEnter) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      return;
    }

    // Enter to confirm/close (smart detection)
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // Allow Enter in textarea (for newlines)
      if (isTextarea) return;
      // Allow Enter in select (to select option)
      if (isSelect) return;
      // Allow Enter on buttons (triggers click)
      if (isButton) return;
      // Allow Enter in text inputs (might be for form submission within modal)
      // But if there's no form, we want Enter to close - let individual modals handle this
      if (isTextInput) return;

      if (onConfirm && !confirmDisabled) {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (closeOnEnter) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
  }, [isOpen, onClose, onConfirm, confirmDisabled, closeOnEscape, closeOnEnter]);

  // Focus management: save previous focus on open, restore on close.
  // Depends ONLY on isOpen — must not re-run when handleKeyDown identity
  // changes, otherwise every parent re-render would steal focus from inputs.
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    requestAnimationFrame(() => {
      if (!modalRef.current) return;
      const firstFocusable = modalRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        modalRef.current.focus();
      }
    });

    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        requestAnimationFrame(() => prev.focus());
      }
    };
  }, [isOpen]);

  // Keyboard listener — re-registers when handleKeyDown identity changes,
  // but doesn't touch focus state.
  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, handleKeyDown]);

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
    fixed inset-0 z-[99990] flex items-center justify-center p-4
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
    flex flex-col outline-none
  `;

  return (
    <div
      className={backdropClasses}
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={modalClasses}
      >
        {children}
      </div>
    </div>
  );
};
