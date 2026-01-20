import { useState, useCallback } from 'react';

// Hook for context menu state
export const useContextMenu = () => {
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const openContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    // Check if it's a React MouseEvent or a native MouseEvent
    if ('preventDefault' in e) e.preventDefault();
    if ('stopPropagation' in e) e.stopPropagation();
    
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
