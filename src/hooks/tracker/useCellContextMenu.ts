import React, { useCallback } from 'react';

// Hook for using cell context menu
export const useCellContextMenu = () => {
  const [menuState, setMenuState] = React.useState<{
    position: { x: number; y: number } | null;
    rowIndex: number;
    channelIndex: number;
  }>({
    position: null,
    rowIndex: 0,
    channelIndex: 0,
  });

  const openMenu = useCallback((
    e: React.MouseEvent,
    rowIndex: number,
    channelIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({
      position: { x: e.clientX, y: e.clientY },
      rowIndex,
      channelIndex,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, position: null }));
  }, []);

  return {
    ...menuState,
    openMenu,
    closeMenu,
    isOpen: menuState.position !== null,
  };
};
