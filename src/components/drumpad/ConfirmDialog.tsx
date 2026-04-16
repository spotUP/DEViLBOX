/**
 * ConfirmDialog - Reusable confirmation modal
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
}) => {
  useDialogKeyboard({ isOpen, onConfirm, onCancel });

  if (!isOpen) return null;

  // Animation keyframes (fade in + scale)
  const modalAnimation = 'animate-in fade-in-0 zoom-in-95 duration-200';

  const variantStyles = {
    danger: {
      icon: 'text-accent-error',
      button: 'bg-accent-error hover:bg-accent-error/80',
      border: 'border-accent-error/50',
    },
    warning: {
      icon: 'text-accent-warning',
      button: 'bg-accent-warning hover:bg-accent-warning/80',
      border: 'border-accent-warning/50',
    },
    info: {
      icon: 'text-accent-primary',
      button: 'bg-accent-primary hover:bg-accent-primary/80',
      border: 'border-accent-primary/50',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={`fixed inset-0 z-[60] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center ${modalAnimation}`}>
      <div className={`bg-dark-surface border ${styles.border} rounded-lg shadow-2xl max-w-md w-full mx-4 ${modalAnimation}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${styles.icon}`} />
            <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-dark-border rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-sm text-text-muted">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-dark-border hover:bg-dark-border/80 text-text-primary text-sm font-bold rounded transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 ${styles.button} text-text-primary text-sm font-bold rounded transition-colors`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
