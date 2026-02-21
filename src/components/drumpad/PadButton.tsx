/**
 * PadButton - Individual drum pad component with velocity sensitivity
 */

import React, { useCallback, useState, useMemo } from 'react';
import type { DrumPad } from '../../types/drumpad';

interface PadButtonProps {
  pad: DrumPad;
  isSelected: boolean;
  isFocused?: boolean;  // Keyboard focus state
  velocity: number;  // Last triggered velocity (0-127)
  onTrigger: (padId: number, velocity: number) => void;
  onRelease?: (padId: number) => void;  // For sustain mode
  onSelect: (padId: number) => void;
  onFocus?: () => void;  // Focus callback
  className?: string;
}

export const PadButton: React.FC<PadButtonProps> = ({
  pad,
  isSelected,
  isFocused = false,
  velocity,
  onTrigger,
  onRelease,
  onSelect,
  onFocus,
  className = '',
}) => {
  const [isPressed, setIsPressed] = useState(false);

  // Calculate velocity based on click/touch position
  const calculateVelocity = useCallback((clientY: number, target: Element): number => {
    // Simple velocity calculation based on Y position in pad
    const rect = target.getBoundingClientRect();
    const relativeY = (clientY - rect.top) / rect.height;

    // Bottom of pad = higher velocity, top = lower velocity
    const baseVelocity = Math.floor((1 - relativeY) * 127);

    // Clamp to valid range
    return Math.max(1, Math.min(127, baseVelocity));
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsPressed(true);

    const vel = calculateVelocity(event.clientY, event.currentTarget);
    onTrigger(pad.id, vel);
  }, [pad.id, onTrigger, calculateVelocity]);

  const handleMouseUp = useCallback(() => {
    setIsPressed(false);
    onRelease?.(pad.id);
  }, [pad.id, onRelease]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      // Select pad for editing with modifier key
      onSelect(pad.id);
    }
  }, [pad.id, onSelect]);

  // Touch support for mobile devices
  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    setIsPressed(true);

    const touch = event.touches[0];
    const vel = calculateVelocity(touch.clientY, event.currentTarget);
    onTrigger(pad.id, vel);
  }, [pad.id, onTrigger, calculateVelocity]);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    setIsPressed(false);
    onRelease?.(pad.id);

    // Check for selection gesture (long press could be added later)
    if (event.changedTouches.length > 1) {
      // Multi-touch = select
      onSelect(pad.id);
    }
  }, [pad.id, onSelect, onRelease]);

  // Determine pad color based on state (memoized for performance)
  const padColor = useMemo(() => {
    if (!pad.sample) {
      return 'bg-dark-border';
    }

    if (isPressed) {
      return 'bg-accent-primary';
    }

    if (isSelected) {
      return 'bg-accent-secondary';
    }

    // Use velocity to show intensity
    const intensity = velocity / 127;
    if (intensity > 0.7) {
      return 'bg-emerald-600';
    } else if (intensity > 0.4) {
      return 'bg-emerald-700';
    } else {
      return 'bg-emerald-800';
    }
  }, [pad.sample, isPressed, isSelected, velocity]);

  return (
    <button
      data-pad-id={pad.id}
      className={`
        relative rounded-lg transition-all select-none
        ${padColor}
        ${!pad.sample ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110 active:brightness-125'}
        ${isPressed ? 'scale-95 duration-75' : 'scale-100 duration-150'}
        ${isSelected ? 'ring-2 ring-accent-primary ring-offset-2 ring-offset-dark-bg transition-all duration-200' : ''}
        ${isFocused && !isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-dark-bg transition-all duration-200' : ''}
        transform-gpu will-change-transform
        ${className}
      `}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onFocus={onFocus}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      disabled={!pad.sample}
      tabIndex={0}
      aria-label={`Drum pad ${pad.id}: ${pad.name}${pad.sample ? '' : ' (empty)'}`}
      aria-pressed={isPressed}
      role="gridcell"
      style={{
        aspectRatio: '1',
      }}
    >
      {/* Pad number */}
      <div className="absolute top-1 left-1 text-[10px] font-mono text-white/60">
        {pad.id}
      </div>

      {/* Pad name */}
      <div className="absolute inset-0 flex items-center justify-center px-2">
        <span className="text-xs font-bold text-white text-center truncate leading-tight">
          {pad.name}
        </span>
      </div>

      {/* Velocity indicator + pad badges */}
      <div className="absolute bottom-1 right-1 flex items-center gap-0.5">
        {pad.muteGroup > 0 && (
          <span className="text-[8px] font-mono text-amber-400/70">M{pad.muteGroup}</span>
        )}
        {pad.playMode === 'sustain' && (
          <span className="text-[8px] font-mono text-blue-400/70">S</span>
        )}
        {pad.reverse && (
          <span className="text-[8px] font-mono text-purple-400/70">R</span>
        )}
        {velocity > 0 && pad.sample && (
          <div
            className="w-1.5 h-1.5 rounded-full bg-white"
            style={{ opacity: velocity / 127 }}
          />
        )}
      </div>

      {/* Empty state icon */}
      {!pad.sample && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-2xl text-white/20">+</div>
        </div>
      )}
    </button>
  );
};
