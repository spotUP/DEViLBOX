/**
 * PatternContextMenu - Right-click menu for pattern list items
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Edit3,
  Copy,
  Trash2,
  FileText,
  Maximize2,
  Minimize2,
  Download,
  X,
} from 'lucide-react';
import { ContextMenu, useContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { useTrackerStore } from '@stores/useTrackerStore';

interface PatternContextMenuProps {
  patternIndex: number;
  children: React.ReactNode;
}

// Rename Dialog Component
const RenameDialog: React.FC<{
  isOpen: boolean;
  currentName: string;
  onConfirm: (newName: string) => void;
  onClose: () => void;
}> = ({ isOpen, currentName, onConfirm, onClose }) => {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setName(currentName));
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
          <h3 className="text-sm font-semibold text-text-primary">Rename Pattern</h3>
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
            placeholder="Enter pattern name"
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

// Confirmation Dialog Component
const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ isOpen, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) => {
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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
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
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary
                     hover:bg-dark-bgTertiary rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              danger
                ? 'bg-accent-error text-white hover:bg-accent-error/80'
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

export const PatternContextMenu: React.FC<PatternContextMenuProps> = ({
  patternIndex,
  children,
}) => {
  const { position, open, close, isOpen } = useContextMenu();
  const { isLiveMode, queuePattern, pendingPatternIndex } = useLiveModeStore();
  const {
    patterns,
    currentPatternIndex,
    setCurrentPattern,
    duplicatePattern,
    deletePattern,
    expandPattern,
    shrinkPattern,
    resizePattern,
    updatePatternName,
  } = useTrackerStore();

  // Dialog states
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const pattern = patterns[patternIndex];
  const isQueued = pendingPatternIndex === patternIndex;
  const isCurrent = currentPatternIndex === patternIndex;
  const canDelete = patterns.length > 1;

  const handleRename = useCallback((newName: string) => {
    updatePatternName?.(patternIndex, newName);
  }, [patternIndex, updatePatternName]);

  const handleDelete = useCallback(() => {
    deletePattern(patternIndex);
  }, [patternIndex, deletePattern]);

  const handleSetLength = useCallback((length: number) => {
    resizePattern?.(patternIndex, length);
  }, [patternIndex, resizePattern]);

  const menuItems = useMemo((): MenuItemType[] => {
    const items: MenuItemType[] = [];

    // Live mode: Queue pattern
    if (isLiveMode) {
      items.push({
        id: 'queue',
        label: isQueued ? 'Cancel Queue' : 'Queue Pattern',
        icon: <Clock size={14} />,
        onClick: () => {
          if (isQueued) {
            useLiveModeStore.getState().clearQueue();
          } else {
            queuePattern(patternIndex);
          }
        },
      });
    }

    // Edit pattern (switch to it)
    items.push({
      id: 'edit',
      label: 'Edit Pattern',
      icon: <Edit3 size={14} />,
      disabled: isCurrent,
      onClick: () => setCurrentPattern(patternIndex),
    });

    items.push({ type: 'divider' });

    // Duplicate
    items.push({
      id: 'duplicate',
      label: 'Duplicate',
      icon: <Copy size={14} />,
      onClick: () => duplicatePattern(patternIndex),
    });

    // Delete
    items.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 size={14} />,
      danger: true,
      disabled: !canDelete,
      onClick: () => setShowDeleteDialog(true),
    });

    items.push({ type: 'divider' });

    // Rename
    items.push({
      id: 'rename',
      label: 'Rename',
      icon: <FileText size={14} />,
      onClick: () => setShowRenameDialog(true),
    });

    // Set Length submenu
    items.push({
      id: 'length',
      label: 'Set Length',
      icon: <Maximize2 size={14} />,
      submenu: [
        {
          id: 'length-16',
          label: '16 rows',
          checked: pattern?.length === 16,
          onClick: () => handleSetLength(16),
        },
        {
          id: 'length-32',
          label: '32 rows',
          checked: pattern?.length === 32,
          onClick: () => handleSetLength(32),
        },
        {
          id: 'length-64',
          label: '64 rows',
          checked: pattern?.length === 64,
          onClick: () => handleSetLength(64),
        },
        {
          id: 'length-128',
          label: '128 rows',
          checked: pattern?.length === 128,
          onClick: () => handleSetLength(128),
        },
      ],
    });

    // Expand/Shrink
    items.push({
      id: 'expand',
      label: 'Expand (2x)',
      icon: <Maximize2 size={14} />,
      onClick: () => expandPattern?.(patternIndex),
    });

    items.push({
      id: 'shrink',
      label: 'Shrink (1/2)',
      icon: <Minimize2 size={14} />,
      onClick: () => shrinkPattern?.(patternIndex),
    });

    items.push({ type: 'divider' });

    // Export
    items.push({
      id: 'export',
      label: 'Export Pattern',
      icon: <Download size={14} />,
      onClick: () => {
        // Export pattern as JSON for now
        const patternData = JSON.stringify(pattern, null, 2);
        const blob = new Blob([patternData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pattern?.name || 'pattern'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
    });

    return items;
  }, [
    isLiveMode,
    isQueued,
    isCurrent,
    canDelete,
    patternIndex,
    pattern,
    queuePattern,
    setCurrentPattern,
    duplicatePattern,
    expandPattern,
    shrinkPattern,
    handleSetLength,
  ]);

  return (
    <div onContextMenu={open}>
      {children}
      {isOpen && (
        <ContextMenu
          items={menuItems}
          position={position}
          onClose={close}
        />
      )}

      {/* Rename Dialog */}
      <RenameDialog
        isOpen={showRenameDialog}
        currentName={pattern?.name || ''}
        onConfirm={handleRename}
        onClose={() => setShowRenameDialog(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Pattern"
        message={`Delete pattern "${pattern?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setShowDeleteDialog(false)}
      />
    </div>
  );
};
