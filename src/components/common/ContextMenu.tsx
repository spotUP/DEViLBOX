/**
 * ContextMenu - Reusable context menu component with submenus
 * Supports right-click and dropdown button usage
 *
 * Keyboard navigation:
 * - Up/Down arrow: move highlight between items
 * - Enter/Space: activate highlighted item
 * - Right arrow: open submenu
 * - Left arrow / Escape: close submenu or menu
 * - Type-ahead: jump to first item matching typed characters
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Check, Circle } from 'lucide-react';
import { useClickOutside } from '@hooks/useClickOutside';

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
  className?: string;
  submenu?: MenuItemType[];
  onClick?: () => void;
}

export type MenuItemType = MenuItem | MenuDivider;

interface ContextMenuProps {
  items: MenuItemType[];
  position: { x: number; y: number } | null;
  onClose: () => void;
  className?: string;
  /** Minimum width in pixels (used by DropdownButton to match trigger width) */
  minWidth?: number;
  /** Custom z-index (default: 100) */
  zIndex?: number;
  /** If true, auto-focus first item on mount (used for keyboard-opened menus) */
  autoFocus?: boolean;
}

/** Filter items to only actionable (non-divider, non-disabled) items */
function getActionableItems(items: MenuItemType[]): MenuItem[] {
  return items.filter(
    (item): item is MenuItem => item.type !== 'divider' && !(item as MenuItem).disabled,
  );
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onClose,
  className = '',
  minWidth,
  zIndex = 100,
  autoFocus = true,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number } | null>(null);
  const submenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const typeAheadRef = useRef('');
  const typeAheadTimerRef = useRef<NodeJS.Timeout | null>(null);

  const actionableItems = getActionableItems(items);

  // Auto-focus the menu container on mount for keyboard capture
  useEffect(() => {
    if (!position || !autoFocus) return;
    requestAnimationFrame(() => {
      menuRef.current?.focus();
    });
  }, [position, autoFocus]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!position || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const VIEWPORT_PADDING = 10;
    const availableHeight = viewportHeight - VIEWPORT_PADDING * 2;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth - VIEWPORT_PADDING) {
      x = viewportWidth - rect.width - VIEWPORT_PADDING;
    }
    if (x < VIEWPORT_PADDING) x = VIEWPORT_PADDING;

    // If menu is taller than the viewport, cap its height and let it scroll;
    // otherwise just shift it up so the bottom fits.
    let cappedMaxHeight: number | null = null;
    if (rect.height > availableHeight) {
      cappedMaxHeight = availableHeight;
      y = VIEWPORT_PADDING;
    } else if (y + rect.height > viewportHeight - VIEWPORT_PADDING) {
      y = viewportHeight - rect.height - VIEWPORT_PADDING;
    }
    if (y < VIEWPORT_PADDING) y = VIEWPORT_PADDING;

    // Deferred to avoid cascading renders in effect
    const frame = requestAnimationFrame(() => {
      setAdjustedPosition({ x, y });
      setMaxHeight(cappedMaxHeight);
    });
    return () => cancelAnimationFrame(frame);
  }, [position]);

  // Close on outside click
  useClickOutside(menuRef, onClose);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;

      case 'ArrowDown': {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex(prev => {
          const next = prev + 1;
          return next >= actionableItems.length ? 0 : next;
        });
        break;
      }

      case 'ArrowUp': {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex(prev => {
          const next = prev - 1;
          return next < 0 ? actionableItems.length - 1 : next;
        });
        break;
      }

      case 'ArrowRight': {
        // Open submenu if highlighted item has one
        const item = actionableItems[highlightedIndex];
        if (item?.submenu?.length) {
          e.preventDefault();
          e.stopPropagation();
          const itemEl = menuRef.current?.querySelector(
            `[data-menu-id="${item.id}"]`,
          ) as HTMLElement | null;
          if (itemEl) handleSubmenuEnter(item.id, itemEl);
        }
        break;
      }

      case 'ArrowLeft':
        // Close submenu (parent handles this via portal)
        if (activeSubmenu) {
          e.preventDefault();
          e.stopPropagation();
          setActiveSubmenu(null);
          setSubmenuPosition(null);
        }
        break;

      case 'Enter':
      case ' ': {
        e.preventDefault();
        e.stopPropagation();
        const item = actionableItems[highlightedIndex];
        if (item) {
          if (item.submenu?.length) {
            const itemEl = menuRef.current?.querySelector(
              `[data-menu-id="${item.id}"]`,
            ) as HTMLElement | null;
            if (itemEl) handleSubmenuEnter(item.id, itemEl);
          } else {
            item.onClick?.();
            onClose();
          }
        }
        break;
      }

      case 'Home': {
        e.preventDefault();
        if (actionableItems.length > 0) setHighlightedIndex(0);
        break;
      }

      case 'End': {
        e.preventDefault();
        if (actionableItems.length > 0) setHighlightedIndex(actionableItems.length - 1);
        break;
      }

      default: {
        // Type-ahead: single printable character jumps to matching item
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          if (typeAheadTimerRef.current) clearTimeout(typeAheadTimerRef.current);
          typeAheadRef.current += e.key.toLowerCase();
          typeAheadTimerRef.current = setTimeout(() => { typeAheadRef.current = ''; }, 500);

          const search = typeAheadRef.current;
          const matchIndex = actionableItems.findIndex(
            item => item.label.toLowerCase().startsWith(search),
          );
          if (matchIndex !== -1) setHighlightedIndex(matchIndex);
        }
        break;
      }
    }
  }, [onClose, actionableItems, highlightedIndex, activeSubmenu]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !menuRef.current) return;
    const item = actionableItems[highlightedIndex];
    if (!item) return;
    const el = menuRef.current.querySelector(`[data-menu-id="${item.id}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, actionableItems]);

  // Clean up type-ahead timer
  useEffect(() => {
    return () => {
      if (typeAheadTimerRef.current) clearTimeout(typeAheadTimerRef.current);
      if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
    };
  }, []);

  const handleSubmenuEnter = useCallback((itemId: string, element: HTMLElement) => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const menuWidth = 180; // Approximate min-width

    // Smart flip: if not enough space on right, show on left
    const showOnRight = rect.right + menuWidth < viewportWidth - 10;

    setActiveSubmenu(itemId);
    setSubmenuPosition({
      x: showOnRight ? rect.right - 2 : rect.left - menuWidth + 2,
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

  // Map from item id → index in actionableItems for highlight matching
  const highlightedItemId = actionableItems[highlightedIndex]?.id;

  return createPortal(
    <div
      ref={menuRef}
      data-context-menu
      role="menu"
      tabIndex={-1}
      className={`
        fixed min-w-[180px] w-max max-w-[calc(100vw-20px)] py-1 text-xs font-mono whitespace-nowrap
        bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl
        focus:outline-none
        ${className}
      `}
      style={{
        left: adjustedPosition?.x ?? position.x,
        top: adjustedPosition?.y ?? position.y,
        maxHeight: maxHeight ?? undefined,
        overflowY: maxHeight !== null ? 'auto' : undefined,
        minWidth: minWidth ?? undefined,
        zIndex,
        // Prevent wheel from leaking through to the pattern editor below
        overscrollBehavior: 'contain',
      }}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnterSubmenu}
      // Stop wheel propagation so scrolling inside the menu doesn't scroll the pattern
      onWheelCapture={(e) => e.stopPropagation()}
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
                role="separator"
              />
            );
          }

          const hasSubmenu = item.submenu && item.submenu.length > 0;
          const isHighlighted = item.id === highlightedItemId;

          return (
            <div
              key={item.id}
              data-menu-id={item.id}
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              className={`
                flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors whitespace-nowrap
                ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-dark-bgHover'}
                ${item.danger ? 'text-accent-error hover:bg-accent-error/10' : 'text-text-secondary'}
                ${activeSubmenu === item.id || isHighlighted ? 'bg-dark-bgHover' : ''}
                ${item.className || ''}
              `}
              onClick={() => {
                if (item.disabled) return;
                if (hasSubmenu) return; // Submenu opens on hover
                item.onClick?.();
                onClose();
              }}
              onMouseEnter={(e) => {
                // Sync highlight with mouse hover
                const idx = actionableItems.findIndex(ai => ai.id === item.id);
                if (idx !== -1) setHighlightedIndex(idx);

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
                <span className="text-[10px] text-text-muted ml-4">{item.shortcut}</span>
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
  style?: React.CSSProperties;
  disabled?: boolean;
  /** Custom z-index for dropdown menu (default: 100) */
  zIndex?: number;
}

export const DropdownButton: React.FC<DropdownButtonProps> = ({
  items,
  children,
  className = '',
  style,
  disabled = false,
  zIndex,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | undefined>(undefined);

  const handleClick = useCallback(() => {
    if (disabled) return;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left,
        y: rect.bottom + 4,
      });
      setTriggerWidth(rect.width);
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
        className={`whitespace-nowrap ${className}`}
        style={style}
      >
        {children}
      </button>
      {isOpen && position && (
        <ContextMenu
          items={items}
          position={position}
          onClose={handleClose}
          minWidth={triggerWidth}
          zIndex={zIndex}
        />
      )}
    </>
  );
};
