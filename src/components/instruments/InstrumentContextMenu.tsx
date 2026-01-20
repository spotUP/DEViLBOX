/**
 * InstrumentContextMenu - Right-click menu for instrument list items
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Edit3,
  Copy,
  Trash2,
  FileText,
  ClipboardPaste,
  ClipboardCopy,
  Save,
  RotateCcw,
  X,
} from 'lucide-react';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { useContextMenu } from '@hooks/useContextMenu';
import { useInstrumentStore } from '@stores/useInstrumentStore';

interface InstrumentContextMenuProps {
  instrumentId: number;
  onEdit?: () => void;
  onSavePreset?: () => void;
  children: React.ReactNode;
}

// Rename Dialog Component
const RenameDialog: React.FC<{
  isOpen: boolean;
  currentName: string;
  onConfirm: (newName: string) => void;
  onClose: () => void;
}> = ({ isOpen, currentName: _currentName, onConfirm, onClose }) => {
  const [name, setName] = useState(_currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus input after dialog opens
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name !== _currentName) {
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
          <h3 className="text-sm font-semibold text-text-primary">Rename Instrument</h3>
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
            placeholder="Enter instrument name"
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
              disabled={!name.trim() || name === _currentName}
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

export const InstrumentContextMenu: React.FC<InstrumentContextMenuProps> = ({
  instrumentId,
  onEdit,
  onSavePreset,
  children,
}) => {
  const { position, open, close, isOpen } = useContextMenu();
  const {
    instruments,
    setCurrentInstrument,
    cloneInstrument,
    deleteInstrument,
    updateInstrument,
  } = useInstrumentStore();


  // Dialog states
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const instrument = instruments.find((i) => i.id === instrumentId);
  const canDelete = instruments.length > 1;

  const handleRename = useCallback((newName: string) => {
    updateInstrument(instrumentId, { name: newName });
  }, [instrumentId, updateInstrument]);

  const handleReset = useCallback(() => {
    updateInstrument(instrumentId, {
      synthType: 'Synth',
      oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
      filter: { type: 'lowpass', frequency: 2000, Q: 1, rolloff: -12 },
      effects: [],
      volume: -6,
      pan: 0,
    });
  }, [instrumentId, updateInstrument]);

  const menuItems = useMemo((): MenuItemType[] => {
    if (!instrument) return [];

    return [
      // Edit
      {
        id: 'edit',
        label: 'Edit',
        icon: <Edit3 size={14} />,
        onClick: () => {
          setCurrentInstrument(instrumentId);
          onEdit?.();
        },
      },
      { type: 'divider' },
      // Duplicate
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <Copy size={14} />,
        onClick: () => cloneInstrument(instrumentId),
      },
      // Delete
      {
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 size={14} />,
        danger: true,
        disabled: !canDelete,
        onClick: () => deleteInstrument(instrumentId),
      },
      { type: 'divider' },
      // Rename
      {
        id: 'rename',
        label: 'Rename',
        icon: <FileText size={14} />,
        onClick: () => setShowRenameDialog(true),
      },
      { type: 'divider' },
      // Copy Settings
      {
        id: 'copy-settings',
        label: 'Copy Settings',
        icon: <ClipboardCopy size={14} />,
        onClick: () => {
          // Store in localStorage for clipboard
          localStorage.setItem('devilbox-instrument-clipboard', JSON.stringify(instrument));
        },
      },
      // Paste Settings
      {
        id: 'paste-settings',
        label: 'Paste Settings',
        icon: <ClipboardPaste size={14} />,
        onClick: () => {
          const clipboardData = localStorage.getItem('devilbox-instrument-clipboard');
          if (clipboardData) {
            try {
              const sourceInstrument = JSON.parse(clipboardData);
              // Copy everything except id and name
              const { id: _, name: __, ...settings } = sourceInstrument;
              void _; void __;
              updateInstrument(instrumentId, settings);
            } catch (e) {
              console.error('Failed to paste instrument settings:', e);
            }
          }
        },
      },
      { type: 'divider' },
      // Save as Preset
      {
        id: 'save-preset',
        label: 'Save as Preset',
        icon: <Save size={14} />,
        onClick: () => {
          onSavePreset?.();
        },
      },
      // Reset to Default
      {
        id: 'reset',
        label: 'Reset to Default',
        icon: <RotateCcw size={14} />,
        danger: true,
        onClick: () => setShowResetDialog(true),
      },
    ];
  }, [
    instrument,
    instrumentId,
    canDelete,
    setCurrentInstrument,
    cloneInstrument,
    deleteInstrument,
    updateInstrument,
    onEdit,
    onSavePreset,
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
      {showRenameDialog && (
        <RenameDialog
          isOpen={showRenameDialog}
          currentName={instrument?.name || ''}
          onConfirm={handleRename}
          onClose={() => setShowRenameDialog(false)}
        />
      )}

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetDialog}
        title="Reset Instrument"
        message="Reset this instrument to default settings? This cannot be undone."
        confirmLabel="Reset"
        danger
        onConfirm={handleReset}
        onClose={() => setShowResetDialog(false)}
      />
    </div>
  );
};
