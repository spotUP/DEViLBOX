/**
 * TouchTarget - Ensures minimum touch target size with haptic feedback
 * Wrapper component for buttons and interactive elements on mobile
 */

import React, { useCallback } from 'react';
import { haptics } from '@/utils/haptics';

export interface TouchTargetProps {
  children: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  className?: string;
  disabled?: boolean;
  minSize?: 'sm' | 'md' | 'lg'; // sm: 32px, md: 44px, lg: 48px
}

export const TouchTarget: React.FC<TouchTargetProps> = ({
  children,
  onPress,
  onLongPress,
  haptic = 'light',
  className = '',
  disabled = false,
  minSize = 'md',
}) => {
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPressed, setIsPressed] = React.useState(false);

  const handleTouchStart = useCallback(() => {
    if (disabled) return;

    setIsPressed(true);

    // Start long-press timer
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        haptics.heavy();
        onLongPress();
        longPressTimer.current = null;
      }, 500);
    }
  }, [disabled, onLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;

    setIsPressed(false);

    // Clear long-press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;

      // Trigger press (not long-press)
      if (haptic !== 'none') {
        haptics[haptic]();
      }
      onPress();
    }
  }, [disabled, haptic, onPress]);

  const handleTouchCancel = useCallback(() => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const sizeClasses = {
    sm: 'min-w-[32px] min-h-[32px]',
    md: 'min-w-[44px] min-h-[44px]',
    lg: 'min-w-[48px] min-h-[48px]',
  };

  return (
    <button
      className={`
        touch-target
        ${sizeClasses[minSize]}
        inline-flex items-center justify-center
        transition-transform
        ${isPressed ? 'scale-95' : 'scale-100'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchCancel}
      disabled={disabled}
      style={{ touchAction: 'manipulation' }}
    >
      {children}
    </button>
  );
};

export default TouchTarget;
