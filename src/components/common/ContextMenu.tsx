/**
 * ContextMenu - Reusable context menu component with submenus
 * Supports right-click and dropdown button usage
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Check, Circle } from 'lucide-react';

export interface MenuDivider {
  type: 'divider';
}

export interface MenuItem {
  type?: 'item';
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  radio?: boolean;
  danger?: boolean;
  submenu?: MenuItemType[];
  onClick?: () => void;
}

export type MenuItemType = MenuItem | MenuDivider;

interface ContextMenuProps {
  items: MenuItemType[];
  position: { x: number; y: number } | null;
  onClose: () => void;
  className?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onClose,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number } | null>(null);
  const submenuTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!position || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth - 10) {
      x = viewportWidth - rect.width - 10;
    }
    if (x < 10) x = 10;

    // Adjust vertical position
    if (y + rect.height > viewportHeight - 10) {
      y = viewportHeight - rect.height - 10;
    }
    if (y < 10) y = 10;

    // Deferred to avoid cascading renders in effect
    const frame = requestAnimationFrame(() => {
      setAdjustedPosition({ x, y });
    });
    return () => cancelAnimationFrame(frame);
  }, [position]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Check if click is inside a portal-rendered submenu (same component class)
        // Submenus are rendered via createPortal at document.body level
        const target = e.target as Element;
        if (target.closest?.('[data-context-menu]')) return;
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
    };
  }, [onClose]);

  const handleSubmenuEnter = useCallback((itemId: string, element: HTMLElement) => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
    const rect = element.getBoundingClientRect();
    setActiveSubmenu(itemId);
    setSubmenuPosition({
      x: rect.right - 2,
      y: rect.top - 4,
    });
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
    submenuTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null);
      setSubmenuPosition(null);
    }, 300); // Sufficient time to move mouse to submenu
  }, []);

  const handleMouseEnterSubmenu = useCallback(() => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  }, []);

  if (!position) return null;

  return createPortal(
    <div
      ref={menuRef}
      data-context-menu
      className={`
        fixed z-[100] min-w-[180px] py-1
        bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl
        ${className}
      `}
      style={{
        left: adjustedPosition?.x ?? position.x,
        top: adjustedPosition?.y ?? position.y,
      }}
      onMouseEnter={handleMouseEnterSubmenu}
    >
      {items.length === 0 ? (
        <div className="px-4 py-2 text-xs text-text-muted italic">Empty</div>
      ) : (
        items.map((item, index) => {
          // Guard against undefined items
          if (!item) return null;

          if (item.type === 'divider') {
            return (
              <div
                key={`divider-${index}`}
                className="h-px bg-dark-border my-1 mx-2"
              />
            );
          }

          const hasSubmenu = item.submenu && item.submenu.length > 0;

          return (
            <div
              key={item.id}
              className={`
                flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors
                ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-dark-bgHover'}
                ${item.danger ? 'text-accent-error hover:bg-accent-error/10' : 'text-text-secondary'}
                ${activeSubmenu === item.id ? 'bg-dark-bgHover' : ''}
              `}
              onClick={() => {
                if (item.disabled) return;
                if (hasSubmenu) return; // Submenu opens on hover
                item.onClick?.();
                onClose();
              }}
              onMouseEnter={(e) => {
                if (hasSubmenu) {
                  handleSubmenuEnter(item.id, e.currentTarget);
                } else {
                  // Close any open submenu when hovering over a non-submenu item
                  setActiveSubmenu(null);
                  setSubmenuPosition(null);
                }
              }}
              onMouseLeave={() => {
                if (hasSubmenu) {
                  handleSubmenuLeave();
                }
              }}
            >
              {/* Checkbox/Radio indicator */}
              {item.checked !== undefined && (
                <span className="w-4 flex justify-center">
                  {item.radio ? (
                    item.checked ? (
                      <Circle size={8} className="fill-accent-primary text-accent-primary" />
                    ) : null
                  ) : item.checked ? (
                    <Check size={14} className="text-accent-primary" />
                  ) : null}
                </span>
              )}

              {/* Icon */}
              {item.icon && <span className="w-4 flex justify-center">{item.icon}</span>}

              {/* Label */}
              <span className="flex-1">{item.label}</span>

              {/* Shortcut */}
              {item.shortcut && (
                <span className="text-xs text-text-muted ml-4">{item.shortcut}</span>
              )}

              {/* Submenu arrow */}
              {hasSubmenu && <ChevronRight size={14} className="text-text-muted" />}

              {/* Submenu */}
              {hasSubmenu && activeSubmenu === item.id && submenuPosition && (
                <ContextMenuPortal
                  items={item.submenu!}
                  position={submenuPosition}
                  onClose={onClose}
                />
              )}
            </div>
          );
        })
      )}
    </div>,
    document.body
  );
};

// Separate portal component for submenus
const ContextMenuPortal: React.FC<ContextMenuProps> = (props) => {
  return <ContextMenu {...props} />;
};

// Hook for context menu state
// eslint-disable-next-line react-refresh/only-export-components
export const useContextMenu = () => {
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const openContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  return {
    position: contextMenuPosition,
    open: openContextMenu,
    close: closeContextMenu,
    isOpen: contextMenuPosition !== null,
  };
};

// Dropdown button that opens a context menu
interface DropdownButtonProps {
  items: MenuItemType[];
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const DropdownButton: React.FC<DropdownButtonProps> = ({
  items,
  children,
  className = '',
  disabled = false,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback(() => {
    if (disabled) return;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left,
        y: rect.bottom + 4,
      });
      setIsOpen(true);
    }
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setPosition(null);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        disabled={disabled}
        className={className}
      >
        {children}
      </button>
      {isOpen && position && (
        <ContextMenu
          items={items}
          position={position}
          onClose={handleClose}
        />
      )}
    </>
  );
};
