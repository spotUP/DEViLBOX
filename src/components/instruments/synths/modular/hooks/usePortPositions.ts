/**
 * usePortPositions - Track DOM positions of port elements
 *
 * Maintains a map of portId → {x, y} coordinates for cable rendering.
 * Uses ResizeObserver to update positions when layout changes.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface PortPosition {
  x: number;
  y: number;
}

export const usePortPositions = () => {
  const [positions, setPositions] = useState<Map<string, PortPosition>>(new Map());
  const elementRefs = useRef<Map<string, HTMLElement>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);

  // Update position for a specific port
  const updatePosition = useCallback((portId: string, element: HTMLElement | null) => {
    if (!element) {
      elementRefs.current.delete(portId);
      setPositions((prev) => {
        const next = new Map(prev);
        next.delete(portId);
        return next;
      });
      return;
    }

    elementRefs.current.set(portId, element);

    // Calculate position relative to viewport
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    setPositions((prev) => {
      const next = new Map(prev);
      next.set(portId, { x: centerX, y: centerY });
      return next;
    });
  }, []);

  // Register a port element
  const registerPort = useCallback(
    (portId: string, element: HTMLElement | null) => {
      updatePosition(portId, element);
    },
    [updatePosition]
  );

  // Recalculate all positions (called after layout changes)
  const recalculateAll = useCallback(() => {
    elementRefs.current.forEach((element, portId) => {
      updatePosition(portId, element);
    });
  }, [updatePosition]);

  // Set up ResizeObserver to track layout changes
  useEffect(() => {
    observerRef.current = new ResizeObserver(() => {
      recalculateAll();
    });

    // Observe the document body for any layout changes
    observerRef.current.observe(document.body);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [recalculateAll]);

  // Also recalculate on scroll (for scrollable containers)
  useEffect(() => {
    const handleScroll = () => {
      recalculateAll();
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [recalculateAll]);

  return {
    positions,
    registerPort,
    recalculateAll,
  };
};
