/**
 * RenameDialog — Shared modal for renaming items.
 * Used by InstrumentContextMenu and PatternContextMenu.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface RenameDialogProps {
  isOpen: boolean;
  currentName: string;
  onConfirm: (newName: string) => void;
  onClose: () => void;
  /** Dialog title (default: 'Rename') */
  title?: string;
  /** Input placeholder (default: 'Enter name') */
  placeholder?: string;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen, currentName, onConfirm, onClose,
  title = 'Rename', placeholder = 'Enter name',
}) => {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setName(currentName));
      // Focus input after dialog opens
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name !== currentName) {
      onConfirm(name.trim());
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl p-4 min-w-[300px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded"
          >
            <X size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary
                     focus:outline-none focus:border-accent-primary"
            placeholder={placeholder}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary
                       hover:bg-dark-bgTertiary rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name === currentName}
              className="px-3 py-1.5 text-sm bg-accent-primary text-text-inverse rounded
                       hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
