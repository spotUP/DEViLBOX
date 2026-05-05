/**
 * PatternContextMenu - Right-click menu for pattern list items
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  Clock,
  Edit3,
  Copy,
  Trash2,
  FileText,
  Maximize2,
  Minimize2,
  Download,
} from 'lucide-react';
import { ContextMenu, useContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { RenameDialog } from '@components/common/RenameDialog';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useEditorStore, type PasteMode } from '@stores/useEditorStore';

interface PatternContextMenuProps {
  patternIndex: number;
  children: React.ReactNode;
}

export const PatternContextMenu: React.FC<PatternContextMenuProps> = ({
  patternIndex,
  children,
}) => {
  const { position, open, close, isOpen } = useContextMenu();
  const isLiveMode = useLiveModeStore((s) => s.isLiveMode);
  const queuePattern = useLiveModeStore((s) => s.queuePattern);
  const pendingPatternIndex = useLiveModeStore((s) => s.pendingPatternIndex);
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const clipboard = useTrackerStore((s) => s.clipboard);
  const setCurrentPattern = useTrackerStore((s) => s.setCurrentPattern);
  const duplicatePattern = useTrackerStore((s) => s.duplicatePattern);
  const deletePattern = useTrackerStore((s) => s.deletePattern);
  const expandPattern = useTrackerStore((s) => s.expandPattern);
  const shrinkPattern = useTrackerStore((s) => s.shrinkPattern);
  const resizePattern = useTrackerStore((s) => s.resizePattern);
  const updatePatternName = useTrackerStore((s) => s.updatePatternName);
  const paste = useTrackerStore((s) => s.paste);
  const pasteMix = useTrackerStore((s) => s.pasteMix);
  const pasteFlood = useTrackerStore((s) => s.pasteFlood);
  const pastePushForward = useTrackerStore((s) => s.pastePushForward);

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

    // Paste modes
    const pasteDisabled = !clipboard;
    const makePasteItem = (label: string, mode: PasteMode, action: () => void) => ({
      id: `paste-${mode}`,
      label,
      icon: <Copy size={14} />,
      disabled: pasteDisabled,
      onClick: () => {
        useEditorStore.getState().setPasteMode(mode);
        action();
      },
    });

    items.push(makePasteItem('Paste (Overwrite)', 'overwrite', paste));
    items.push(makePasteItem('Paste Mix', 'mix', pasteMix));
    items.push(makePasteItem('Paste Flood', 'flood', pasteFlood));
    items.push(makePasteItem('Paste Insert', 'insert', pastePushForward));

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
    clipboard,
    queuePattern,
    setCurrentPattern,
    duplicatePattern,
    expandPattern,
    shrinkPattern,
    handleSetLength,
    paste,
    pasteMix,
    pasteFlood,
    pastePushForward,
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
        title="Rename Pattern"
        placeholder="Enter pattern name"
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
