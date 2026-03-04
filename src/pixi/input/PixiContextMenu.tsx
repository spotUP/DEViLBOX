/**
 * PixiContextMenu — GL-native context menu positioned via PixiJS screen coordinates.
 * Registers in usePixiDropdownStore so PixiGlobalDropdownLayer renders it at
 * root stage level (zIndex 9999), above all PixiWindow masks.
 */

import { useEffect, useRef } from 'react';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';

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

let _ctxMenuIdCounter = 0;

export const PixiContextMenu: React.FC<PixiContextMenuProps> = ({
  items,
  x,
  y,
  isOpen,
  onClose,
}) => {
  const idRef = useRef(`pixi-ctx-menu-${++_ctxMenuIdCounter}`);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Register / unregister in the global dropdown store
  useEffect(() => {
    const id = idRef.current;
    const store = usePixiDropdownStore.getState();
    if (isOpen) {
      // Clamp position to stay within reasonable bounds
      const adjustedX = Math.min(x, (window.innerWidth || 1920) - 200);
      const adjustedY = Math.min(y, (window.innerHeight || 1080) - items.length * 28 - 16);

      store.openDropdown({
        kind: 'contextMenu',
        id,
        x: adjustedX,
        y: adjustedY,
        items,
        onClose: () => onCloseRef.current(),
      });
    } else {
      store.closeDropdown(id);
    }
  }, [isOpen, x, y, items]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  // Clean up on unmount
  useEffect(() => {
    const id = idRef.current;
    return () => usePixiDropdownStore.getState().closeDropdown(id);
  }, []);

  // Rendering is handled by PixiGlobalDropdownLayer
  return null;
};
