/**
 * PixiContextMenu — DOM overlay context menu positioned via PixiJS screen coordinates.
 * Complex menus with nested submenus stay DOM for practicality.
 */

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
}

interface PixiContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
}

export const PixiContextMenu: React.FC<PixiContextMenuProps> = ({
  items,
  x,
  y,
  isOpen,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Ensure menu stays within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 28 - 16);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 10001,
        minWidth: 180,
        background: '#111113',
        border: '1px solid #2a2a2f',
        borderRadius: 6,
        padding: '4px 0',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={i}
              style={{
                height: 1,
                margin: '4px 8px',
                background: '#2a2a2f',
              }}
            />
          );
        }
        return (
          <div
            key={i}
            onClick={() => {
              if (item.disabled) return;
              item.action?.();
              onClose();
            }}
            style={{
              padding: '6px 12px',
              color: item.disabled ? '#404048' : '#f0f0f2',
              cursor: item.disabled ? 'default' : 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.target as HTMLDivElement).style.background = '#222226';
              }
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLDivElement).style.background = 'transparent';
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>,
    document.body,
  );
};
