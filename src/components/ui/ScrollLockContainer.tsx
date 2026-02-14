/**
 * ScrollLockContainer - Prevents page scroll when child controls are being interacted with
 * Wraps knob-heavy panels to prevent scroll conflicts on mobile
 */

import React, { useEffect, useRef, useState } from 'react';

export interface ScrollLockContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const ScrollLockContainer: React.FC<ScrollLockContainerProps> = ({
  children,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Detect active drag on child controls
    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;

      // Check if touching a control element (knob, slider, etc.)
      const isControl =
        target.closest('[data-prevent-scroll]') ||
        target.closest('.knob-body') ||
        target.closest('[role="slider"]') ||
        target.closest('input[type="range"]');

      if (isControl) {
        setIsInteracting(true);
      }
    };

    const handleTouchEnd = () => {
      setIsInteracting(false);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  // Apply scroll lock to body when interacting
  useEffect(() => {
    if (isInteracting) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isInteracting]);

  return (
    <div
      ref={containerRef}
      className={`scroll-lock-container ${className}`}
      style={{
        overflowY: isInteracting ? 'hidden' : 'auto',
        touchAction: isInteracting ? 'none' : 'auto',
      }}
    >
      {children}
    </div>
  );
};

export default ScrollLockContainer;
