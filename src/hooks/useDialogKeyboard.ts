/**
 * useDialogKeyboard - Custom hook for enhanced dialog keyboard controls
 *
 * Features:
 * - Enter to confirm (with smart detection to avoid triggering in text inputs)
 * - Escape to cancel
 * - Ctrl/Cmd+Enter to force confirm even in text inputs
 * - Auto-focus management
 */

import { useEffect, useCallback, useRef } from 'react';

interface UseDialogKeyboardOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  enableEnter?: boolean; // Default: true
  enableEscape?: boolean; // Default: true
  enableCtrlEnter?: boolean; // Default: true
  onCtrlEnter?: () => void; // Optional: different action for Ctrl+Enter (overrides default force-confirm behavior)
  ctrlEnterDisabled?: boolean; // Default: false
  preventEnterInTextarea?: boolean; // Default: true (allow Enter for newlines in textarea)
}

export function useDialogKeyboard({
  isOpen,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  enableEnter = true,
  enableEscape = true,
  enableCtrlEnter = true,
  onCtrlEnter,
  ctrlEnterDisabled = false,
  preventEnterInTextarea = true,
}: UseDialogKeyboardOptions) {
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  // Save and restore focus
  useEffect(() => {
    if (isOpen) {
      // Save the currently focused element
      lastFocusedElementRef.current = document.activeElement as HTMLElement;

      // Focus the first focusable element in the dialog after a brief delay
      setTimeout(() => {
        const firstFocusable = document.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 100);
    } else {
      // Restore focus when dialog closes
      if (lastFocusedElementRef.current) {
        lastFocusedElementRef.current.focus();
        lastFocusedElementRef.current = null;
      }
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    const target = e.target as HTMLElement;
    const isTextarea = target.tagName === 'TEXTAREA';
    const isSelect = target.tagName === 'SELECT';
    const isButton = target.tagName === 'BUTTON';

    // Escape to cancel
    if (enableEscape && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }

    // Ctrl/Cmd+Enter - custom action or force confirm
    if (enableCtrlEnter && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (onCtrlEnter && !ctrlEnterDisabled) {
        // Custom Ctrl+Enter action (e.g., Replace All in Find dialog)
        e.preventDefault();
        e.stopPropagation();
        onCtrlEnter();
      } else if (!confirmDisabled) {
        // Default: force confirm (even in text inputs)
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
      return;
    }

    // Enter to confirm (smart detection)
    if (enableEnter && e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // Allow Enter in textarea (for newlines) unless preventEnterInTextarea is false
      if (isTextarea && preventEnterInTextarea) {
        return;
      }

      // Allow Enter in select (to select option)
      if (isSelect) {
        return;
      }

      // Allow Enter on buttons (triggers click)
      if (isButton) {
        return;
      }

      // In number/text inputs: Enter = confirm
      // This is standard behavior - Enter submits the form
      if (!confirmDisabled) {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    }
  }, [isOpen, onConfirm, onCancel, confirmDisabled, enableEnter, enableEscape, enableCtrlEnter, preventEnterInTextarea]);

  useEffect(() => {
    if (!isOpen) return;

    // Add event listener at capture phase to intercept before other handlers
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, handleKeyDown]);

  return {
    // Expose keyboard shortcut hints for UI display
    shortcuts: {
      confirm: enableCtrlEnter && !onCtrlEnter ? '⏎ or Ctrl+⏎' : enableEnter ? '⏎' : null,
      ctrlEnter: enableCtrlEnter && onCtrlEnter ? 'Ctrl+⏎' : null,
      cancel: enableEscape ? 'Esc' : null,
    }
  };
}

/**
 * useModalClose - Simpler hook for modals that just need Enter/Escape to close
 * 
 * Use this for info modals, settings, etc. that don't have a separate confirm action.
 * For dialogs with OK/Cancel buttons, use useDialogKeyboard instead.
 */
interface UseModalCloseOptions {
  isOpen: boolean;
  onClose: () => void;
  enableEnter?: boolean; // Default: true
  enableEscape?: boolean; // Default: true
  /** Ref to the modal container element — enables Tab focus trapping + auto-focus */
  containerRef?: React.RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModalClose({
  isOpen,
  onClose,
  enableEnter = true,
  enableEscape = true,
  containerRef,
}: UseModalCloseOptions) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Auto-focus first focusable element on open, restore on close
  useEffect(() => {
    if (!isOpen || !containerRef?.current) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const first = containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) first.focus();
    });

    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        requestAnimationFrame(() => prev.focus());
      }
    };
  }, [isOpen, containerRef]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    const target = e.target as HTMLElement;
    const isTextarea = target.tagName === 'TEXTAREA';
    const isSelect = target.tagName === 'SELECT';
    const isButton = target.tagName === 'BUTTON';
    const isInput = target.tagName === 'INPUT';

    // Tab focus trapping
    if (e.key === 'Tab' && containerRef?.current) {
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !containerRef.current.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !containerRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }

    // Escape to close
    if (enableEscape && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    // Enter to close (smart detection to avoid interfering with form elements)
    if (enableEnter && e.key === 'Enter' && !e.shiftKey) {
      // Ctrl/Cmd+Enter always closes
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      
      // Plain Enter - skip in form elements
      if (isTextarea || isSelect || isButton || isInput) return;

      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }, [isOpen, onClose, enableEnter, enableEscape, containerRef]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, handleKeyDown]);
}
