/**
 * PianoRollContextMenu - Right-click context menu for notes and grid
 */

import React, { useEffect, useRef } from 'react';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import {
  Copy, ClipboardPaste, Trash2, Scissors, Zap,
  ArrowRightLeft, Grid3X3, Layers,
} from 'lucide-react';

interface PianoRollContextMenuProps {
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onQuantize: () => void;
  onToggleSlide: () => void;
  onToggleAccent: () => void;
  hasSelection: boolean;
  hasClipboard: boolean;
}

export const PianoRollContextMenu: React.FC<PianoRollContextMenuProps> = ({
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onSelectAll,
  onQuantize,
  onToggleSlide,
  onToggleAccent,
  hasSelection,
  hasClipboard,
}) => {
  const { contextMenu, hideContextMenu } = usePianoRollStore();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or escape
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.visible, hideContextMenu]);

  if (!contextMenu.visible) return null;

  // Keep menu within viewport — clamp to edges
  const menuWidth = 200; // approximate, slightly larger than min-w-[180px]
  const menuHeight = 260; // approximate (8 items + dividers)
  const clampedX = Math.min(contextMenu.x, window.innerWidth - menuWidth);
  const clampedY = Math.min(contextMenu.y, window.innerHeight - menuHeight);

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(0, clampedX),
    top: Math.max(0, clampedY),
    zIndex: 100,
  };

  const MenuItem: React.FC<{
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
    onClick: () => void;
    disabled?: boolean;
  }> = ({ icon, label, shortcut, onClick, disabled }) => (
    <button
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left rounded transition-colors
        ${disabled ? 'text-text-muted/50 cursor-not-allowed' : 'text-text-primary hover:bg-dark-bgTertiary'}`}
      onClick={() => {
        if (!disabled) {
          onClick();
          hideContextMenu();
        }
      }}
      disabled={disabled}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-text-muted text-[10px]">{shortcut}</span>}
    </button>
  );

  const Divider = () => <div className="h-px bg-dark-border mx-2 my-1" />;

  return (
    <div
      ref={menuRef}
      className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[180px]"
      style={menuStyle}
    >
      <MenuItem icon={<Copy size={12} />} label="Copy" shortcut="Ctrl+C" onClick={onCopy} disabled={!hasSelection} />
      <MenuItem icon={<Scissors size={12} />} label="Cut" shortcut="Ctrl+X" onClick={onCut} disabled={!hasSelection} />
      <MenuItem icon={<ClipboardPaste size={12} />} label="Paste" shortcut="Ctrl+V" onClick={onPaste} disabled={!hasClipboard} />
      <MenuItem icon={<Trash2 size={12} />} label="Delete" shortcut="Del" onClick={onDelete} disabled={!hasSelection} />
      <Divider />
      <MenuItem icon={<Layers size={12} />} label="Select All" shortcut="Ctrl+A" onClick={onSelectAll} />
      <Divider />
      <MenuItem icon={<Grid3X3 size={12} />} label="Quantize" shortcut="Q" onClick={onQuantize} disabled={!hasSelection} />
      <Divider />
      <MenuItem icon={<ArrowRightLeft size={12} />} label="Toggle Slide" shortcut="S" onClick={onToggleSlide} disabled={!hasSelection} />
      <MenuItem icon={<Zap size={12} />} label="Toggle Accent" shortcut="A" onClick={onToggleAccent} disabled={!hasSelection} />
    </div>
  );
};
