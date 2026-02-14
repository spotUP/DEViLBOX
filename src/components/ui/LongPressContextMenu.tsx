/**
 * LongPressContextMenu - Context menu triggered by long-press
 * Portal-rendered overlay with viewport boundary detection
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { haptics } from '@/utils/haptics';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export interface LongPressContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  isOpen: boolean;
  onClose: () => void;
}

export const LongPressContextMenu: React.FC<LongPressContextMenuProps> = ({
  items,
  position,
  isOpen,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Keep within horizontal bounds
    if (rect.right > viewportWidth - 16) {
      adjustedX = viewportWidth - rect.width - 16;
    }
    if (rect.left < 16) {
      adjustedX = 16;
    }

    // Keep within vertical bounds
    if (rect.bottom > viewportHeight - 16) {
      adjustedY = viewportHeight - rect.height - 16;
    }
    if (rect.top < 16) {
      adjustedY = 16;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [isOpen, position]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Context Menu */}
      <div
        ref={menuRef}
        className="absolute bg-dark-bgSecondary rounded-lg shadow-2xl border border-dark-border min-w-[180px] animate-fade-in"
        style={{
          left: position.x,
          top: position.y,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-1">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                if (!item.disabled) {
                  haptics.success();
                  item.action();
                  onClose();
                }
              }}
              disabled={item.disabled}
              className={`
                w-full flex items-center gap-3 px-4 py-3
                text-left font-mono text-sm
                transition-colors
                ${item.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : item.destructive
                  ? 'text-error hover:bg-error/10'
                  : 'text-text-primary hover:bg-dark-bgHover'
                }
              `}
            >
              {item.icon && (
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LongPressContextMenu;
