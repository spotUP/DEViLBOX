/**
 * InstrumentContextMenu - Right-click menu for instrument list items
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  Edit3,
  Copy,
  Trash2,
  FileText,
  ClipboardPaste,
  ClipboardCopy,
  Save,
  RotateCcw,
} from 'lucide-react';
import { ContextMenu, useContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { RenameDialog } from '@components/common/RenameDialog';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { useInstrumentStore } from '@stores/useInstrumentStore';

interface InstrumentContextMenuProps {
  instrumentId: number;
  onEdit?: () => void;
  onSavePreset?: () => void;
  children: React.ReactNode;
}

export const InstrumentContextMenu: React.FC<InstrumentContextMenuProps> = ({
  instrumentId,
  onEdit,
  onSavePreset,
  children,
}) => {
  const { position, open, close, isOpen } = useContextMenu();
  const instruments = useInstrumentStore((s) => s.instruments);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);
  const cloneInstrument = useInstrumentStore((s) => s.cloneInstrument);
  const deleteInstrument = useInstrumentStore((s) => s.deleteInstrument);
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);


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
              const { id: _id, name: _name, ...settings } = sourceInstrument;
              void _id; void _name;
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
      <RenameDialog
        isOpen={showRenameDialog}
        currentName={instrument?.name || ''}
        onConfirm={handleRename}
        onClose={() => setShowRenameDialog(false)}
        title="Rename Instrument"
        placeholder="Enter instrument name"
      />

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
