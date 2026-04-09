/**
 * ConfirmDialog — Shared confirmation modal.
 * Used by InstrumentContextMenu, PatternContextMenu, and others.
 */

import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  alertOnly?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, title, message, confirmLabel = 'Confirm', danger = false, alertOnly = false, onConfirm, onClose,
}) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      onConfirm();
      onClose();
    }
  }, [onClose, onConfirm]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]"
      onClick={onClose}
    >
      <div
        className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl p-4 min-w-[300px] max-w-[400px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-sm text-text-secondary mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          {!alertOnly && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary
                       hover:bg-dark-bgTertiary rounded transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              danger
                ? 'bg-accent-error text-text-primary hover:bg-accent-error/80'
                : 'bg-accent-primary text-text-inverse hover:bg-accent-primary/80'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
