/**
 * PianoRollContextMenu - Right-click context menu for notes and grid
 */

import React, { useEffect, useRef } from 'react';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import {
  Copy, ClipboardPaste, Trash2, Scissors, Zap,
  ArrowRightLeft, Grid3X3, Layers, Gauge,
} from 'lucide-react';

// ============================================================================
// Module-scope sub-components (extracted for react-hooks/static-components)
// ============================================================================

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  hideContextMenu: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, shortcut, onClick, disabled, hideContextMenu }) => (
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

const MenuDivider: React.FC = () => <div className="h-px bg-dark-border mx-2 my-1" />;

interface PianoRollContextMenuProps {
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onQuantize: () => void;
  onToggleSlide: () => void;
  onToggleAccent: () => void;
  onSetVelocity?: (velocity: number) => void;
  hasSelection: boolean;
  hasClipboard: boolean;
  selectionVelocity?: number;
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
  onSetVelocity,
  hasSelection,
  hasClipboard,
  selectionVelocity,
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

  return (
    <div
      ref={menuRef}
      className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[180px]"
      style={menuStyle}
    >
      <MenuItem hideContextMenu={hideContextMenu} icon={<Copy size={12} />} label="Copy" shortcut="Ctrl+C" onClick={onCopy} disabled={!hasSelection} />
      <MenuItem hideContextMenu={hideContextMenu} icon={<Scissors size={12} />} label="Cut" shortcut="Ctrl+X" onClick={onCut} disabled={!hasSelection} />
      <MenuItem hideContextMenu={hideContextMenu} icon={<ClipboardPaste size={12} />} label="Paste" shortcut="Ctrl+V" onClick={onPaste} disabled={!hasClipboard} />
      <MenuItem hideContextMenu={hideContextMenu} icon={<Trash2 size={12} />} label="Delete" shortcut="Del" onClick={onDelete} disabled={!hasSelection} />
      <MenuDivider />
      <MenuItem hideContextMenu={hideContextMenu} icon={<Layers size={12} />} label="Select All" shortcut="Ctrl+A" onClick={onSelectAll} />
      <MenuDivider />
      <MenuItem hideContextMenu={hideContextMenu} icon={<Grid3X3 size={12} />} label="Quantize" shortcut="Q" onClick={onQuantize} disabled={!hasSelection} />
      <MenuDivider />
      {hasSelection && onSetVelocity && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Gauge size={12} className="text-text-muted shrink-0" />
            <span className="text-xs text-text-muted shrink-0">Vel</span>
            <input
              type="range"
              min={1}
              max={127}
              value={selectionVelocity ?? 100}
              onChange={(e) => onSetVelocity(parseInt(e.target.value, 10))}
              className="flex-1 h-1 accent-accent-primary"
              style={{ cursor: 'pointer' }}
            />
            <span className="text-xs text-text-primary w-6 text-right tabular-nums">{selectionVelocity ?? 100}</span>
          </div>
          <MenuDivider />
        </>
      )}
      <MenuItem hideContextMenu={hideContextMenu} icon={<ArrowRightLeft size={12} />} label="Toggle Slide" shortcut="S" onClick={onToggleSlide} disabled={!hasSelection} />
      <MenuItem hideContextMenu={hideContextMenu} icon={<Zap size={12} />} label="Toggle Accent" shortcut="A" onClick={onToggleAccent} disabled={!hasSelection} />
    </div>
  );
};
