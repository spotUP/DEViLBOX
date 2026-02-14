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

export const usePortPositions = (containerRef?: React.RefObject<HTMLElement | null>) => {
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

    // Calculate position relative to container (or viewport if no container)
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // If we have a container reference, make coordinates relative to it
    let relativeX = centerX;
    let relativeY = centerY;

    if (containerRef?.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      relativeX = centerX - containerRect.left;
      relativeY = centerY - containerRect.top;
    }

    setPositions((prev) => {
      const next = new Map(prev);
      next.set(portId, { x: relativeX, y: relativeY });
      return next;
    });
  }, [containerRef]);

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

    // Listen to scroll events on the container (if provided) and window
    const scrollTarget = containerRef?.current || window;
    scrollTarget.addEventListener('scroll', handleScroll, true);

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll, true);
    };
  }, [recalculateAll, containerRef]);

  return {
    positions,
    registerPort,
    recalculateAll,
  };
};
